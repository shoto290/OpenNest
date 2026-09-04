use std::collections::HashMap;
use std::time::Duration;

use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, ETAG, IF_NONE_MATCH, USER_AGENT};
use reqwest::{Client, Response, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::watch as signal;

use super::contract::{MissionEntry, MissionError, MissionEventKind, WatchedMission};
use crate::conversations::commands::ready;
use crate::db;
use crate::routines::core::{Clock, SystemClock};

pub const TICK: Duration = Duration::from_secs(120);

pub const SOURCE: &str = "github";

const API: &str = "https://api.github.com";

const AGENT: &str = "OpenNest";

const TIMEOUT: Duration = Duration::from_secs(15);

const API_VERSION_HEADER: &str = "X-GitHub-Api-Version";

const API_VERSION: &str = "2022-11-28";

const RATE_LIMIT_RESET_HEADER: &str = "x-ratelimit-reset";

const RETRY_AFTER_HEADER: &str = "retry-after";

const FAILED_CONCLUSIONS: [&str; 5] =
	["failure", "timed_out", "action_required", "startup_failure", "cancelled"];

pub struct Poller {
	stop: signal::Sender<bool>,
}

impl Poller {
	pub fn stop(&self) {
		self.stop.send_replace(true);
	}
}

pub fn spawn<R: Runtime>(app: AppHandle<R>) -> Poller {
	let (stop, halted) = signal::channel(false);
	tauri::async_runtime::spawn(polling(app, API.to_owned(), halted));
	Poller { stop }
}

async fn polling<R: Runtime>(app: AppHandle<R>, base: String, mut halted: signal::Receiver<bool>) {
	let state = app.state::<db::DatabaseState>();
	let database = match ready(&state) {
		Ok(database) => database,
		Err(failure) => return eprintln!("no mission is watched on github: {failure:?}"),
	};
	let reach = match Reach::bearing(base, token()) {
		Ok(reach) => reach,
		Err(failure) => return eprintln!("no mission is watched on github: {failure}"),
	};
	let mut kept = Kept::default();
	let mut ticker = tokio::time::interval(TICK);
	loop {
		tokio::select! {
			_ = halted.changed() => return,
			_ = ticker.tick() => pass(&reach, database, &mut kept, &SystemClock).await,
		}
	}
}

pub(crate) struct Reach {
	client: Client,
	base: String,
	token: Option<String>,
}

impl Reach {
	pub(crate) fn bearing(base: String, token: Option<String>) -> Result<Self, String> {
		installed_tls_provider();
		let client = Client::builder()
			.timeout(TIMEOUT)
			.default_headers(headers())
			.build()
			.map_err(|error| format!("the http client was not built: {error}"))?;
		Ok(Self { client, base, token })
	}

	async fn sent(&self, url: String, etag: Option<&str>) -> Result<Response, Failure> {
		let mut request = self.client.get(&url);
		if let Some(token) = self.token.as_deref() {
			request = request.bearer_auth(token);
		}
		if let Some(etag) = etag {
			request = request.header(IF_NONE_MATCH, etag);
		}
		request.send().await.map_err(|error| Failure::Unreached(error.to_string()))
	}

	async fn pulls(
		&self,
		mission: &WatchedMission,
		etag: Option<&str>,
	) -> Result<Answer<Vec<Pull>>, Failure> {
		let owner = owner_of(&mission.repository)?;
		let url = format!(
			"{}/repos/{}/pulls?head={}:{}&state=all&sort=updated&direction=desc&per_page=1",
			self.base, mission.repository, owner, mission.branch
		);
		read(self.sent(url, etag).await?).await
	}

	async fn checks(&self, repository: &str, head_sha: &str) -> Result<Answer<Runs>, Failure> {
		let url = format!("{}/repos/{repository}/commits/{head_sha}/check-runs", self.base);
		read(self.sent(url, None).await?).await
	}
}

#[derive(Default)]
pub(crate) struct Kept {
	etags: HashMap<String, String>,
	held_until_ms: Option<i64>,
}

impl Kept {
	fn held(&self, now_ms: i64) -> bool {
		self.held_until_ms.is_some_and(|until| now_ms < until)
	}

	fn hold_until(&mut self, until_ms: i64) {
		self.held_until_ms = Some(until_ms);
	}
}

enum Answer<T> {
	Unchanged,
	Held { until_ms: i64 },
	Read { etag: Option<String>, held: T },
}

#[derive(Debug)]
enum Failure {
	Unreached(String),
	Unreadable(String),
	Refused(u16),
	Storage(MissionError),
}

impl std::fmt::Display for Failure {
	fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		match self {
			Failure::Unreached(detail) => write!(formatter, "github was not reached: {detail}"),
			Failure::Unreadable(detail) => write!(formatter, "github answered {detail}"),
			Failure::Refused(status) => write!(formatter, "github refused with {status}"),
			Failure::Storage(failure) => {
				write!(formatter, "the mission was not written: {failure:?}")
			}
		}
	}
}

impl From<MissionError> for Failure {
	fn from(error: MissionError) -> Self {
		Failure::Storage(error)
	}
}

#[derive(Debug, Clone, Deserialize)]
struct Pull {
	number: u64,
	state: String,
	html_url: String,
	merged_at: Option<String>,
	head: Head,
}

#[derive(Debug, Clone, Deserialize)]
struct Head {
	sha: String,
}

#[derive(Debug, Clone, Deserialize)]
struct Runs {
	#[serde(default)]
	check_runs: Vec<CheckRun>,
}

#[derive(Debug, Clone, Deserialize)]
struct CheckRun {
	status: String,
	conclusion: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum Checks {
	None,
	Pending,
	Passed,
	Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Fingerprint {
	number: u64,
	state: String,
	head_sha: String,
	checks: Checks,
	merged: bool,
}

impl Fingerprint {
	fn held(stored: &str) -> Result<Option<Self>, Failure> {
		if stored.is_empty() {
			return Ok(None);
		}
		serde_json::from_str(stored)
			.map(Some)
			.map_err(|error| Failure::Unreadable(format!("a fingerprint it kept: {error}")))
	}

	fn of(pull: &Pull, checks: Checks) -> Self {
		Self {
			number: pull.number,
			state: pull.state.clone(),
			head_sha: pull.head.sha.clone(),
			checks,
			merged: pull.merged_at.is_some(),
		}
	}
}

pub(crate) async fn pass(
	reach: &Reach,
	database: &db::Database,
	kept: &mut Kept,
	clock: &dyn Clock,
) {
	let watched = match database.missions().watched().await {
		Ok(watched) => watched,
		Err(failure) => {
			return eprintln!("the missions watched on github were not read: {failure:?}");
		}
	};
	for mission in watched {
		if kept.held(clock.now_ms()) {
			return;
		}
		let id = mission.id.clone();
		if let Err(failure) = seen(reach, database, kept, mission).await {
			eprintln!("what became of mission {id} on github was not read: {failure}");
		}
	}
}

async fn seen(
	reach: &Reach,
	database: &db::Database,
	kept: &mut Kept,
	mission: WatchedMission,
) -> Result<(), Failure> {
	let etag = kept.etags.get(&mission.id).cloned();
	let answered = reach.pulls(&mission, etag.as_deref()).await?;
	let (etag, pulls) = match answered {
		Answer::Unchanged => return Ok(()),
		Answer::Held { until_ms } => {
			kept.hold_until(until_ms);
			return Ok(());
		}
		Answer::Read { etag, held } => (etag, held),
	};
	if let Some(etag) = etag {
		kept.etags.insert(mission.id.clone(), etag);
	}
	let Some(pull) = pulls.into_iter().next() else {
		return Ok(());
	};
	let held = Fingerprint::held(&mission.fingerprint)?;
	let checks = match asks_for_checks(held.as_ref(), &pull) {
		false => kept_checks(held.as_ref()),
		true => match reach.checks(&mission.repository, &pull.head.sha).await? {
			Answer::Unchanged => kept_checks(held.as_ref()),
			Answer::Held { until_ms } => {
				kept.hold_until(until_ms);
				return Ok(());
			}
			Answer::Read { held: runs, .. } => concluded(&runs),
		},
	};
	let fresh = Fingerprint::of(&pull, checks);
	if held.as_ref() == Some(&fresh) {
		return Ok(());
	}
	let entries = appended(held.as_ref(), &fresh, &pull);
	let stored = serde_json::to_string(&fresh)
		.map_err(|error| Failure::Unreadable(format!("no fingerprint: {error}")))?;
	database.missions().record_github(mission.id, entries, stored).await?;
	Ok(())
}

fn kept_checks(held: Option<&Fingerprint>) -> Checks {
	held.map_or(Checks::None, |held| held.checks)
}

fn asks_for_checks(held: Option<&Fingerprint>, pull: &Pull) -> bool {
	held.is_some_and(|held| {
		held.number == pull.number && (held.head_sha != pull.head.sha || held.state != pull.state)
	})
}

fn appended(held: Option<&Fingerprint>, fresh: &Fingerprint, pull: &Pull) -> Vec<MissionEntry> {
	let mut entries = Vec::new();
	if held.is_none_or(|held| held.number != fresh.number) {
		entries.push(entry(
			MissionEventKind::Note,
			json!({ "pullRequest": fresh.number, "url": pull.html_url }),
		));
	}
	if let Some(kind) = moved_checks(held, fresh) {
		entries.push(entry(kind, json!({ "pullRequest": fresh.number })));
	}
	if fresh.merged && held.is_none_or(|held| !held.merged) {
		entries.push(entry(
			MissionEventKind::Closed,
			json!({
				"outcome": "done",
				"summary": format!("pull request #{} was merged", fresh.number),
			}),
		));
	}
	entries
}

fn moved_checks(held: Option<&Fingerprint>, fresh: &Fingerprint) -> Option<MissionEventKind> {
	if held.is_some_and(|held| held.checks == fresh.checks) {
		return None;
	}
	match fresh.checks {
		Checks::Passed => Some(MissionEventKind::Ready),
		Checks::Failed => Some(MissionEventKind::Failed),
		Checks::None | Checks::Pending => None,
	}
}

fn entry(kind: MissionEventKind, payload: serde_json::Value) -> MissionEntry {
	MissionEntry { kind, source: SOURCE.to_owned(), payload }
}

fn concluded(runs: &Runs) -> Checks {
	if runs.check_runs.is_empty() {
		return Checks::None;
	}
	if runs.check_runs.iter().any(failed) {
		return Checks::Failed;
	}
	match runs.check_runs.iter().all(|run| run.status == "completed") {
		true => Checks::Passed,
		false => Checks::Pending,
	}
}

fn failed(run: &CheckRun) -> bool {
	run.conclusion.as_deref().is_some_and(|held| FAILED_CONCLUSIONS.contains(&held))
}

async fn read<T: serde::de::DeserializeOwned>(answer: Response) -> Result<Answer<T>, Failure> {
	if answer.status() == StatusCode::NOT_MODIFIED {
		return Ok(Answer::Unchanged);
	}
	if let Some(until_ms) = held_until(&answer) {
		return Ok(Answer::Held { until_ms });
	}
	if !answer.status().is_success() {
		return Err(Failure::Refused(answer.status().as_u16()));
	}
	let etag = answer.headers().get(ETAG).and_then(|held| held.to_str().ok()).map(str::to_owned);
	let held = answer.json::<T>().await.map_err(|error| Failure::Unreadable(error.to_string()))?;
	Ok(Answer::Read { etag, held })
}

fn held_until(answer: &Response) -> Option<i64> {
	let refused = matches!(answer.status(), StatusCode::FORBIDDEN | StatusCode::TOO_MANY_REQUESTS);
	if !refused {
		return None;
	}
	let headers = answer.headers();
	if let Some(reset) = seconds(headers, RATE_LIMIT_RESET_HEADER) {
		return Some(reset * 1000);
	}
	seconds(headers, RETRY_AFTER_HEADER).map(|after| SystemClock.now_ms() + after.max(0) * 1000)
}

fn seconds(headers: &HeaderMap, name: &str) -> Option<i64> {
	headers.get(name)?.to_str().ok()?.trim().parse().ok()
}

fn owner_of(repository: &str) -> Result<&str, Failure> {
	repository
		.split_once('/')
		.map(|(owner, _)| owner)
		.ok_or_else(|| Failure::Unreadable("a repository named without an owner".to_owned()))
}

fn token() -> Option<String> {
	["GITHUB_TOKEN", "GH_TOKEN"]
		.into_iter()
		.find_map(|name| std::env::var(name).ok())
		.filter(|held| !held.trim().is_empty())
}

fn installed_tls_provider() {
	static ONCE: std::sync::Once = std::sync::Once::new();
	ONCE.call_once(|| {
		if rustls::crypto::ring::default_provider().install_default().is_err() {
			eprintln!("github is reached through the tls provider already installed");
		}
	});
}

fn headers() -> HeaderMap {
	let mut headers = HeaderMap::new();
	headers.insert(USER_AGENT, HeaderValue::from_static(AGENT));
	headers.insert(ACCEPT, HeaderValue::from_static("application/vnd.github+json"));
	headers.insert(API_VERSION_HEADER, HeaderValue::from_static(API_VERSION));
	headers
}

#[cfg(test)]
mod tests {
	use std::net::{Ipv4Addr, SocketAddr};
	use std::path::PathBuf;
	use std::sync::atomic::{AtomicI64, Ordering};
	use std::sync::Arc;

	use axum::extract::State as Extracted;
	use axum::response::{IntoResponse, Response as Answered};
	use axum::routing::get;
	use axum::Router;
	use reqwest::header::AUTHORIZATION;
	use serde_json::Value;
	use tokio::sync::Mutex;

	use super::super::contract::{
		Mission, MissionDraft, MissionEvent, MissionNote, MissionState, MissionWatch, Ticket,
	};
	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::{open, Database};

	const NOON: i64 = 1_800_000_000_000;

	const A_BRANCH: &str = "feature/ope-27";

	const A_REPOSITORY: &str = "shoto290/OpenNest";

	const A_PULL_URL: &str = "https://github.test/shoto290/OpenNest/pull/7";

	const A_PARTICIPANT: &str = "
		INSERT INTO bots (id, space_id, name, model, created_at)
			VALUES ('b1', 'personal', 'First', 'sonnet', 1);
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('c1', 'main', 'First', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'lead', 1, 0);
	";

	struct Ticking(AtomicI64);

	impl Ticking {
		fn at(now: i64) -> Self {
			Ticking(AtomicI64::new(now))
		}
	}

	impl Clock for Ticking {
		fn now_ms(&self) -> i64 {
			self.0.load(Ordering::SeqCst)
		}
	}

	#[derive(Clone, Debug, PartialEq, Eq)]
	struct Asked {
		path: String,
		conditional_on: Option<String>,
		bearing: bool,
	}

	struct Answers {
		pulls: Value,
		checks: Value,
		etag: String,
		reset_at_s: Option<i64>,
		asked: Vec<Asked>,
	}

	struct Stub {
		base: String,
		answers: Arc<Mutex<Answers>>,
		stop: signal::Sender<bool>,
	}

	impl Stub {
		async fn holding(pulls: Value, etag: &str) -> Self {
			let answers = Arc::new(Mutex::new(Answers {
				pulls,
				checks: json!({ "check_runs": [] }),
				etag: etag.to_owned(),
				reset_at_s: None,
				asked: Vec::new(),
			}));
			let listener = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
				.await
				.expect("the stub binds");
			let address: SocketAddr = listener.local_addr().expect("the stub is named");
			let (stop, halted) = signal::channel(false);
			let router = Router::new()
				.route("/repos/{owner}/{name}/pulls", get(pulls_of))
				.route("/repos/{owner}/{name}/commits/{sha}/check-runs", get(checks_of))
				.with_state(answers.clone());
			let mut halting = halted;
			tokio::spawn(async move {
				let _ = axum::serve(listener, router)
					.with_graceful_shutdown(async move {
						let _ = halting.changed().await;
					})
					.await;
			});
			Stub { base: format!("http://{address}"), answers, stop }
		}

		async fn answering(&self, pulls: Value, etag: &str) {
			let mut held = self.answers.lock().await;
			held.pulls = pulls;
			held.etag = etag.to_owned();
		}

		async fn checking(&self, checks: Value) {
			self.answers.lock().await.checks = checks;
		}

		async fn refusing_until(&self, reset_at_s: i64) {
			self.answers.lock().await.reset_at_s = Some(reset_at_s);
		}

		async fn asked(&self) -> Vec<Asked> {
			self.answers.lock().await.asked.clone()
		}

		fn reach(&self) -> Reach {
			Reach::bearing(self.base.clone(), None).expect("the client builds")
		}
	}

	async fn pulls_of(
		Extracted(answers): Extracted<Arc<Mutex<Answers>>>,
		headers: HeaderMap,
	) -> Answered {
		let mut held = answers.lock().await;
		let conditional_on =
			headers.get(IF_NONE_MATCH).and_then(|held| held.to_str().ok()).map(str::to_owned);
		held.asked.push(Asked {
			path: "pulls".to_owned(),
			conditional_on: conditional_on.clone(),
			bearing: headers
				.get(AUTHORIZATION)
				.and_then(|held| held.to_str().ok())
				.is_some_and(|held| held.starts_with("Bearer ")),
		});
		if let Some(reset_at_s) = held.reset_at_s {
			return (
				StatusCode::FORBIDDEN,
				[(RATE_LIMIT_RESET_HEADER, reset_at_s.to_string())],
				String::new(),
			)
				.into_response();
		}
		if conditional_on.as_deref() == Some(held.etag.as_str()) {
			return StatusCode::NOT_MODIFIED.into_response();
		}
		as_json(Some(&held.etag), &held.pulls)
	}

	async fn checks_of(Extracted(answers): Extracted<Arc<Mutex<Answers>>>) -> Answered {
		let mut held = answers.lock().await;
		held.asked.push(Asked { path: "checks".to_owned(), conditional_on: None, bearing: false });
		as_json(None, &held.checks)
	}

	fn as_json(etag: Option<&str>, held: &Value) -> Answered {
		let mut answer = Answered::builder()
			.status(StatusCode::OK)
			.header(reqwest::header::CONTENT_TYPE, "application/json");
		if let Some(etag) = etag {
			answer = answer.header(ETAG, etag);
		}
		answer.body(axum::body::Body::from(held.to_string())).expect("the stub answers with a body")
	}

	fn a_pull(state: &str, head_sha: &str, merged: bool) -> Value {
		json!([{
			"number": 7,
			"state": state,
			"html_url": A_PULL_URL,
			"merged_at": merged.then(|| "2026-09-04T10:00:00Z".to_owned()),
			"head": { "sha": head_sha },
		}])
	}

	fn a_run(status: &str, conclusion: Option<&str>) -> Value {
		json!({ "check_runs": [{ "status": status, "conclusion": conclusion }] })
	}

	async fn planted() -> (Database, PathBuf) {
		let dir = temp_dir();
		let database = open(&dir);
		database
			.call_mut(|connection| Ok(connection.execute_batch(A_PARTICIPANT)?))
			.await
			.expect("the participant is planted");
		(database, dir)
	}

	async fn an_armed_mission(database: &Database) -> Mission {
		let opened = database
			.missions()
			.open(MissionDraft {
				origin_conversation_id: "c1".to_owned(),
				bot_id: "b1".to_owned(),
				objective: "Fix the crash".to_owned(),
				ticket: Ticket {
					platform: "github".to_owned(),
					external_id: "42".to_owned(),
					url: "https://opennest.test/tickets/42".to_owned(),
					title: "Crash on open".to_owned(),
				},
				tools: vec!["gh".to_owned()],
				source: "bot".to_owned(),
			})
			.await
			.expect("the mission opens");
		let (armed, _) = database
			.missions()
			.arm(
				opened.id,
				MissionWatch {
					branch: A_BRANCH.to_owned(),
					repository: A_REPOSITORY.to_owned(),
					workspace_path: None,
				},
				"the-delivery-key".to_owned(),
			)
			.await
			.expect("the mission is armed");
		armed
	}

	async fn events_of(database: &Database, mission_id: &str) -> Vec<MissionEvent> {
		database.missions().detail(mission_id.to_owned()).await.expect("the mission reads").events
	}

	async fn from_github(database: &Database, mission_id: &str) -> Vec<(MissionEventKind, Value)> {
		events_of(database, mission_id)
			.await
			.into_iter()
			.filter(|event| event.source == SOURCE)
			.map(|event| (event.kind, event.payload))
			.collect()
	}

	async fn state_of(database: &Database, mission_id: &str) -> (MissionState, bool) {
		let held = database
			.missions()
			.detail(mission_id.to_owned())
			.await
			.expect("the mission reads")
			.mission;
		(held.state, held.closed_at.is_some())
	}

	async fn walked(stub: &Stub, database: &Database, kept: &mut Kept, clock: &Ticking) {
		pass(&stub.reach(), database, kept, clock).await;
	}

	async fn walked_bearing(stub: &Stub, database: &Database, token: Option<&str>) {
		let reach =
			Reach::bearing(stub.base.clone(), token.map(str::to_owned)).expect("the client builds");
		pass(&reach, database, &mut Kept::default(), &Ticking::at(NOON)).await;
	}

	#[tokio::test]
	async fn a_pull_request_seen_for_the_first_time_appends_one_note_and_asks_for_no_check() {
		let (database, dir) = planted().await;
		let mission = an_armed_mission(&database).await;
		let stub = Stub::holding(a_pull("open", "abc", false), "\"one\"").await;
		let clock = Ticking::at(NOON);
		let mut kept = Kept::default();

		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(
			from_github(&database, &mission.id).await,
			vec![(MissionEventKind::Note, json!({ "pullRequest": 7, "url": A_PULL_URL }),)],
		);
		assert_eq!(
			stub.asked().await,
			vec![Asked { path: "pulls".to_owned(), conditional_on: None, bearing: false }],
			"the first pass asked github for more than the pull requests of the branch"
		);

		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(from_github(&database, &mission.id).await.len(), 1, "the second pass appended");
		assert_eq!(
			stub.asked().await.last().and_then(|asked| asked.conditional_on.clone()),
			Some("\"one\"".to_owned()),
			"the second pass was not conditional on the entity tag it kept"
		);

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_token_in_the_environment_is_carried_as_a_bearer_and_the_pass_runs_without_one() {
		let (database, dir) = planted().await;
		an_armed_mission(&database).await;
		let stub = Stub::holding(a_pull("open", "abc", false), "\"one\"").await;

		walked_bearing(&stub, &database, None).await;
		walked_bearing(&stub, &database, Some("a-token-from-the-environment")).await;

		assert_eq!(
			stub.asked().await.iter().map(|asked| asked.bearing).collect::<Vec<_>>(),
			vec![false, true],
		);

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn check_runs_all_concluded_and_none_failed_append_ready() {
		let (database, dir) = planted().await;
		let mission = an_armed_mission(&database).await;
		let stub = Stub::holding(a_pull("open", "abc", false), "\"one\"").await;
		let clock = Ticking::at(NOON);
		let mut kept = Kept::default();
		walked(&stub, &database, &mut kept, &clock).await;

		stub.answering(a_pull("open", "def", false), "\"two\"").await;
		stub.checking(a_run("completed", Some("success"))).await;
		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(
			from_github(&database, &mission.id).await.last(),
			Some(&(MissionEventKind::Ready, json!({ "pullRequest": 7 }))),
		);
		assert_eq!(state_of(&database, &mission.id).await, (MissionState::ReadyToMerge, false));

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_check_run_concluded_in_failure_appends_failed() {
		let (database, dir) = planted().await;
		let mission = an_armed_mission(&database).await;
		let stub = Stub::holding(a_pull("open", "abc", false), "\"one\"").await;
		let clock = Ticking::at(NOON);
		let mut kept = Kept::default();
		walked(&stub, &database, &mut kept, &clock).await;

		stub.answering(a_pull("open", "def", false), "\"two\"").await;
		stub.checking(a_run("completed", Some("failure"))).await;
		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(
			from_github(&database, &mission.id).await.last(),
			Some(&(MissionEventKind::Failed, json!({ "pullRequest": 7 }))),
		);
		assert_eq!(state_of(&database, &mission.id).await, (MissionState::Failed, false));

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_merged_pull_request_appends_closed_naming_it_and_the_mission_closes() {
		let (database, dir) = planted().await;
		let mission = an_armed_mission(&database).await;
		let stub = Stub::holding(a_pull("open", "abc", false), "\"one\"").await;
		let clock = Ticking::at(NOON);
		let mut kept = Kept::default();
		walked(&stub, &database, &mut kept, &clock).await;

		stub.answering(a_pull("closed", "abc", true), "\"two\"").await;
		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(
			from_github(&database, &mission.id).await.last(),
			Some(&(
				MissionEventKind::Closed,
				json!({ "outcome": "done", "summary": "pull request #7 was merged" }),
			)),
		);
		assert_eq!(state_of(&database, &mission.id).await, (MissionState::Done, true));

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_mission_closed_between_two_passes_is_neither_read_nor_appended_to() {
		let (database, dir) = planted().await;
		let mission = an_armed_mission(&database).await;
		let stub = Stub::holding(a_pull("open", "abc", false), "\"one\"").await;
		let clock = Ticking::at(NOON);
		let mut kept = Kept::default();
		walked(&stub, &database, &mut kept, &clock).await;
		database
			.missions()
			.append(
				mission.id.clone(),
				MissionEntry::of(
					MissionEventKind::Closed,
					MissionNote { source: "human".to_owned(), payload: json!({}) },
				),
			)
			.await
			.expect("the mission closes");
		let asked = stub.asked().await.len();

		stub.answering(a_pull("closed", "def", true), "\"two\"").await;
		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(
			from_github(&database, &mission.id).await.len(),
			1,
			"the closed mission was appended to"
		);
		assert_eq!(stub.asked().await.len(), asked, "the closed mission was read on github");

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_refusal_carrying_a_rate_limit_reset_stops_every_request_before_that_reset() {
		let (database, dir) = planted().await;
		let mission = an_armed_mission(&database).await;
		let stub = Stub::holding(a_pull("open", "abc", false), "\"one\"").await;
		let clock = Ticking::at(NOON);
		let mut kept = Kept::default();
		stub.refusing_until(NOON / 1000 + 600).await;

		walked(&stub, &database, &mut kept, &clock).await;
		let refused = stub.asked().await.len();
		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(refused, 1, "the refusal was not the end of the pass");
		assert_eq!(stub.asked().await.len(), 1, "a request landed before the reset");
		assert!(from_github(&database, &mission.id).await.is_empty());

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}
}
