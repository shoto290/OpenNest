use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tokio::sync::Mutex;

use super::contract::{
	AgentEvent, CheckReport, ConnectionState, EvolvedBundle, PermissionDecision, RuntimeScope,
	ScopedEvent, SessionHandle, TransportError,
};
use super::redact;
use super::session::{Bundle, EventSink, GatedSink, Session, SessionOptions};
use super::sidecar::{self, Sidecar, SidecarOptions};
use crate::bundles;
use crate::db;
use crate::db::repositories::conversations::Bot as StoredBot;
use crate::db::repositories::runtime_context::ParticipantKey;
use crate::environment::contract::{EnvOwner, ResolvedEnv};
use crate::environment::store as environment;
use crate::private_files;

pub const EVENT_CHANNEL: &str = "agent://event";

const RUNS_DIR: &str = "runs";

const MAX_LIVE_SESSIONS: usize = 8;

fn announce<R: Runtime>(app: &AppHandle<R>, scope: Option<RuntimeScope>, event: AgentEvent) {
	let _ = app.emit(EVENT_CHANNEL, ScopedEvent { scope, event });
}

type Participant = (String, String);

type RunKey = String;

fn run_key(scope: &RuntimeScope) -> RunKey {
	scope.runtime_session_id.clone()
}

fn participant(scope: &RuntimeScope) -> Participant {
	(scope.conversation_id.clone(), scope.bot_id.clone())
}

fn participant_key(scope: &RuntimeScope) -> ParticipantKey {
	ParticipantKey { conversation_id: scope.conversation_id.clone(), bot_id: scope.bot_id.clone() }
}

struct Live<S = Arc<Session>> {
	runs: std::sync::Mutex<HashMap<RunKey, Run<S>>>,
}

struct Run<S> {
	scope: RuntimeScope,
	session: Option<S>,
}

struct Admission<S> {
	replaced: Option<S>,
	keeps_lineage: bool,
}

impl<S> Admission<S> {
	fn resume(&self, asked: Option<String>) -> Option<String> {
		asked.filter(|_| self.keeps_lineage)
	}
}

impl<S> Default for Live<S> {
	fn default() -> Self {
		Self { runs: std::sync::Mutex::new(HashMap::new()) }
	}
}

impl<S: Clone> Live<S> {
	fn take_over(&self, scope: RuntimeScope) -> Result<Admission<S>, TransportError> {
		let mut runs = self.runs.lock().expect("live runs");
		let key = run_key(&scope);
		if !runs.contains_key(&key) && runs.len() >= MAX_LIVE_SESSIONS {
			return Err(TransportError::TooManyLiveSessions { cap: MAX_LIVE_SESSIONS });
		}
		let keeps_lineage = !runs
			.iter()
			.any(|(held, run)| held != &key && participant(&run.scope) == participant(&scope));
		let replaced =
			runs.insert(key, Run { scope, session: None }).and_then(|replaced| replaced.session);
		Ok(Admission { replaced, keeps_lineage })
	}

	fn install(&self, scope: &RuntimeScope, session: S) -> bool {
		let mut runs = self.runs.lock().expect("live runs");
		let Some(run) = runs.get_mut(&run_key(scope)) else {
			return false;
		};
		if &run.scope != scope {
			return false;
		}
		run.session = Some(session);
		true
	}

	fn clear(&self, scope: &RuntimeScope) -> Option<S> {
		self.runs.lock().expect("live runs").remove(&run_key(scope)).and_then(|run| run.session)
	}

	fn clear_all(&self) -> Vec<S> {
		std::mem::take(&mut *self.runs.lock().expect("live runs"))
			.into_values()
			.filter_map(|run| run.session)
			.collect()
	}

	fn holds(&self, scope: &RuntimeScope) -> bool {
		self.runs.lock().expect("live runs").values().any(|run| &run.scope == scope)
	}

	fn is_foreign(&self, scope: &RuntimeScope) -> bool {
		self.runs
			.lock()
			.expect("live runs")
			.get(&run_key(scope))
			.is_some_and(|run| &run.scope != scope)
	}

	fn session_for(&self, scope: &RuntimeScope) -> Result<S, TransportError> {
		let runs = self.runs.lock().expect("live runs");
		let Some(run) = runs.get(&run_key(scope)) else {
			return Err(TransportError::NotStarted);
		};
		if &run.scope != scope {
			return Err(stale(scope));
		}
		run.session.clone().ok_or(TransportError::NotStarted)
	}
}

struct RunSink<R: Runtime> {
	app: AppHandle<R>,
	scope: RuntimeScope,
	live: Arc<Live>,
	records_its_own_lineage: bool,
}

impl<R: Runtime> EventSink for RunSink<R> {
	fn emit(&self, event: AgentEvent) {
		if !self.live.holds(&self.scope) {
			return;
		}
		if let AgentEvent::SessionReady { session_id, .. } = &event {
			self.record_its_own_lineage(session_id.clone());
		}
		let ended = matches!(event, AgentEvent::TurnEnded { .. });
		announce(&self.app, Some(self.scope.clone()), event);
		if ended {
			self.record_writes();
		}
	}
}

impl<R: Runtime> RunSink<R> {
	fn record_its_own_lineage(&self, provider_session_id: String) {
		if !self.records_its_own_lineage {
			return;
		}
		let app = self.app.clone();
		let scope = self.scope.clone();
		tauri::async_runtime::spawn(async move {
			let refused = match bot_database(&app) {
				Some(database) => {
					record_its_own_provider_session(database, &scope, provider_session_id)
						.await
						.err()
				}
				None => Some(TransportError::WriteFailed {
					detail: NO_DATABASE_FOR_THE_LINEAGE.to_owned(),
				}),
			};
			if let Some(error) = refused {
				announce(&app, Some(scope), AgentEvent::Failed { error });
			}
		});
	}

	fn record_writes(&self) {
		let app = self.app.clone();
		let scope = self.scope.clone();
		let live = self.live.clone();
		tauri::async_runtime::spawn(async move {
			for (bundle, evolution) in evolutions(&app, &scope.bot_id).await {
				if !live.holds(&scope) {
					return;
				}
				announce(
					&app,
					Some(scope.clone()),
					AgentEvent::BotEvolved {
						bundle,
						commit_id: evolution.commit_id,
						title: evolution.title,
					},
				);
			}
		});
	}
}

async fn evolutions<R: Runtime>(
	app: &AppHandle<R>,
	bot_id: &str,
) -> Vec<(EvolvedBundle, bundles::Evolution)> {
	let mut announced = Vec::new();
	if let Some(evolution) =
		bundles::user::laid_down(app).and_then(|path| bundles::user::evolve(&path))
	{
		announced.push((EvolvedBundle::User, evolution));
	}
	let Some(database) = bot_database(app) else {
		return announced;
	};
	let Ok(Some(bot)) = database.conversations().bot(bot_id.to_owned()).await else {
		return announced;
	};
	if let Some(evolution) =
		bundles::space::laid_down(app, &bot.space_id).and_then(|path| bundles::space::evolve(&path))
	{
		announced.push((EvolvedBundle::Space, evolution));
	}
	let Some(root) = bundles::root(app) else {
		return announced;
	};
	if let Some(evolution) = bundles::evolve(&root, &bot) {
		reconcile_bot(database, &root, &bot).await;
		announced.push((EvolvedBundle::Bot, evolution));
	}
	announced
}

const NO_DATABASE_FOR_THE_LINEAGE: &str =
	"the provider session id could not be recorded without the store";

async fn record_its_own_provider_session(
	database: &db::Database,
	scope: &RuntimeScope,
	provider_session_id: String,
) -> Result<(), TransportError> {
	database
		.runtime_context()
		.record_provider_session(
			participant_key(scope),
			scope.runtime_session_id.clone(),
			provider_session_id,
		)
		.await
		.map_err(|error| TransportError::WriteFailed {
			detail: format!("the provider session id could not be recorded: {error:?}"),
		})
}

fn bot_database<R: Runtime>(app: &AppHandle<R>) -> Option<&db::Database> {
	app.try_state::<db::DatabaseState>()?.inner().as_ref().ok()
}

async fn reconcile_bot(database: &db::Database, root: &Path, bot: &StoredBot) {
	if let Some(found) = bundles::adopted(root, bot) {
		let _ = database.conversations().adopt_instructions(bot.id.clone(), found).await;
	}
	if let Some(learned) = bundles::adopted_memory(root, bot) {
		let _ = database.conversations().adopt_memory(bot.id.clone(), learned).await;
	}
}

#[derive(Default)]
struct Gate {
	quitting: bool,
	busy: HashSet<RunKey>,
}

#[derive(Default)]
pub struct AgentState {
	gate: std::sync::Mutex<Gate>,
	live: Arc<Live>,
	sidecar: Mutex<Option<Arc<Sidecar>>>,
	models: Mutex<Option<Vec<String>>>,
	tools: Mutex<Option<Vec<String>>>,
}

impl AgentState {
	fn claim(&self, scope: &RuntimeScope) -> Result<Claim<'_>, TransportError> {
		let mut gate = self.gate.lock().expect("gate");
		let run = run_key(scope);
		if gate.quitting || !gate.busy.insert(run.clone()) {
			return Err(TransportError::TransitionInProgress);
		}
		Ok(Claim { state: self, run })
	}

	fn enter_quit(&self) {
		self.gate.lock().expect("gate").quitting = true;
	}

	async fn sidecar(&self) -> Result<Arc<Sidecar>, TransportError> {
		let mut slot = self.sidecar.lock().await;
		if let Some(running) = slot.as_ref().filter(|running| running.is_live()) {
			return Ok(running.clone());
		}
		let started = Sidecar::start(SidecarOptions::new(sidecar::resolve()?)).await?;
		*slot = Some(started.clone());
		Ok(started)
	}

	async fn take_sidecar(&self) -> Option<Arc<Sidecar>> {
		self.sidecar.lock().await.take()
	}

	async fn models(&self) -> Vec<String> {
		let mut cached = self.models.lock().await;
		if let Some(found) = cached.as_ref() {
			return found.clone();
		}
		let Ok(sidecar) = self.sidecar().await else {
			return Vec::new();
		};
		let Ok(offered) = sidecar.catalogue().await else {
			return Vec::new();
		};
		*cached = Some(offered.clone());
		offered
	}

	async fn tools(&self) -> Vec<String> {
		let mut cached = self.tools.lock().await;
		if let Some(found) = cached.as_ref() {
			return found.clone();
		}
		let Ok(sidecar) = self.sidecar().await else {
			return Vec::new();
		};
		let Ok(offered) = sidecar.tools().await else {
			return Vec::new();
		};
		*cached = Some(offered.clone());
		offered
	}

	async fn title(&self, text: &str) -> Option<String> {
		let sidecar = self.sidecar().await.ok()?;
		sidecar.title(text).await.ok().flatten()
	}
}

struct Claim<'a> {
	state: &'a AgentState,
	run: RunKey,
}

impl Drop for Claim<'_> {
	fn drop(&mut self) {
		self.state.gate.lock().expect("gate").busy.remove(&self.run);
	}
}

fn stale(scope: &RuntimeScope) -> TransportError {
	TransportError::StaleRuntimeSession { runtime_session_id: scope.runtime_session_id.clone() }
}

#[tauri::command]
pub async fn agent_models<R: Runtime>(app: AppHandle<R>) -> Vec<String> {
	app.state::<AgentState>().models().await
}

#[tauri::command]
pub async fn agent_tools<R: Runtime>(app: AppHandle<R>) -> Vec<String> {
	app.state::<AgentState>().tools().await
}

#[tauri::command]
pub async fn agent_title<R: Runtime>(app: AppHandle<R>, text: String) -> Option<String> {
	app.state::<AgentState>().title(&text).await
}

#[tauri::command]
pub async fn agent_check<R: Runtime>(
	app: AppHandle<R>,
	scope: Option<RuntimeScope>,
) -> CheckReport {
	announce(
		&app,
		scope.clone(),
		AgentEvent::ConnectionChanged { state: ConnectionState::Checking },
	);
	let report = check(app.state::<AgentState>().inner()).await;
	announce(&app, scope, AgentEvent::ConnectionChanged { state: report.connection });
	report
}

pub async fn check(state: &AgentState) -> CheckReport {
	let sidecar = match state.sidecar().await {
		Ok(sidecar) => sidecar,
		Err(error) => return reported(None, Err(error)),
	};
	let version = sidecar.version().to_owned();
	reported(Some(version), sidecar.authenticated().await)
}

fn reported(binary_version: Option<String>, probe: Result<bool, TransportError>) -> CheckReport {
	let error = match probe {
		Ok(true) => None,
		Ok(false) => Some(TransportError::NotAuthenticated),
		Err(error) => Some(error),
	};
	CheckReport {
		connection: match error {
			None => ConnectionState::Ready,
			Some(_) => ConnectionState::Unavailable,
		},
		binary_version,
		authenticated: error.is_none(),
		error,
	}
}

#[derive(Default)]
struct RuntimeIdentity {
	bundle: Option<Bundle>,
	working_dir: Option<String>,
	server_env: ResolvedEnv,
}

const ENV_UNREADABLE: &str = "the environment store could not be read";

fn served_environment<R: Runtime>(app: &AppHandle<R>, bot: &StoredBot) -> ResolvedEnv {
	let Some(root) = environment::root(app) else {
		return ResolvedEnv::failed(ENV_UNREADABLE);
	};
	let owner = EnvOwner::Bot { id: bot.id.clone(), space_id: bot.space_id.clone() };
	environment::resolve(&root, &owner).unwrap_or_else(|_| ResolvedEnv::failed(ENV_UNREADABLE))
}

async fn runtime_identity<R: Runtime>(
	app: &AppHandle<R>,
	state: &db::DatabaseState,
	bot_id: &str,
) -> RuntimeIdentity {
	let Ok(database) = state.as_ref() else {
		return RuntimeIdentity::default();
	};
	let Ok(Some(bot)) = database.conversations().bot(bot_id.to_owned()).await else {
		return RuntimeIdentity::default();
	};
	let root = bundles::root(app);
	let system = bundles::system::laid_down(app);
	let user = bundles::user::laid_down(app);
	let space = bundles::space::laid_down(app, &bot.space_id);
	let permissions = settled_permissions(database, root.as_deref(), &bot).await;
	let bundle = root.as_deref().and_then(|root| {
		laid_down_bundle(
			root,
			&bot,
			&permissions,
			system.as_deref(),
			user.as_deref(),
			space.as_deref(),
		)
	});
	if let Some(root) = root.as_deref() {
		reconcile_bot(database, root, &bot).await;
	}
	let server_env = served_environment(app, &bot);
	RuntimeIdentity { bundle, working_dir: bot.working_dir, server_env }
}

async fn settled_permissions(
	database: &db::Database,
	root: Option<&Path>,
	bot: &StoredBot,
) -> bundles::BotPermissions {
	if let Some(stored) = bot.permissions.clone() {
		return stored;
	}
	let carried = root
		.and_then(|root| bundles::permissions(root, &bot.id))
		.unwrap_or_else(|| bundles::BotPermissions::unruled_like(&bot.denied_tools));
	let _ = database.conversations().adopt_permissions(bot.id.clone(), carried.clone()).await;
	carried
}

fn laid_down_bundle(
	root: &Path,
	bot: &StoredBot,
	permissions: &bundles::BotPermissions,
	system: Option<&Path>,
	user: Option<&Path>,
	space: Option<&Path>,
) -> Option<Bundle> {
	bundles::set_permissions(root, bot, permissions).ok()?;
	bundles::ensure(root, bot).ok()?;
	Some(Bundle {
		path: bundles::dir(root, &bot.id).to_string_lossy().into_owned(),
		system_path: system.map(|path| path.to_string_lossy().into_owned()),
		user_path: user.map(|path| path.to_string_lossy().into_owned()),
		space_path: space.map(|path| path.to_string_lossy().into_owned()),
		agent: bundles::agent_ref(bot),
		identity: bundles::identity(bot),
		output_style: bundles::output_style(root, &bot.id),
		settings_path: bundles::settings_file(root, &bot.id)
			.map(|path| path.to_string_lossy().into_owned()),
	})
}

fn its_own_directory<R: Runtime>(app: &AppHandle<R>, bot_id: &str) -> PathBuf {
	app.path()
		.app_data_dir()
		.map_or_else(|_| std::env::temp_dir(), |app_data| reserved_directory(app_data, bot_id))
}

fn reserved_directory(app_data: PathBuf, bot_id: &str) -> PathBuf {
	let mine = app_data.join(RUNS_DIR).join(bot_id);
	if private_files::create_dir(&mine).is_ok() {
		mine
	} else {
		app_data
	}
}

fn where_it_runs(stored: Option<String>, anywhere: PathBuf) -> (PathBuf, Option<String>) {
	let Some(stored) = stored.filter(|path| !path.trim().is_empty()) else {
		return (anywhere, None);
	};
	let asked = PathBuf::from(&stored);
	if asked.is_dir() {
		return (asked, None);
	}
	(anywhere, Some(redact::path(&asked)))
}

#[tauri::command]
pub async fn agent_start_or_resume_session<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, AgentState>,
	database: State<'_, db::DatabaseState>,
	scope: RuntimeScope,
	resume: Option<String>,
	cwd: Option<String>,
) -> Result<SessionHandle, TransportError> {
	let _claim = state.claim(&scope)?;

	let admitted = state.live.take_over(scope.clone())?;
	let lineage_is_held_elsewhere = resume.is_some() && !admitted.keeps_lineage;
	let resume = admitted.resume(resume);
	if let Some(previous) = admitted.replaced {
		previous.shutdown().await;
	}

	let sidecar = state.sidecar().await?;
	let identity = runtime_identity(&app, &database, &scope.bot_id).await;
	let anywhere = cwd.map(PathBuf::from).unwrap_or_else(|| its_own_directory(&app, &scope.bot_id));
	let (working_dir, refused_dir) = where_it_runs(identity.working_dir, anywhere);

	let sink: Arc<dyn EventSink> = Arc::new(RunSink {
		app: app.clone(),
		scope: scope.clone(),
		live: state.live.clone(),
		records_its_own_lineage: lineage_is_held_elsewhere,
	});
	let options = SessionOptions::new(working_dir)
		.bundled(identity.bundle)
		.serving(identity.server_env)
		.with_app_data(app.path().app_data_dir().ok())
		.in_conversation(scope.conversation_id.clone());

	let refused_id = resume.clone();
	let started = match start_with_fallback(sidecar, options, resume, sink.clone()).await {
		Ok(started) => started,
		Err(error) => {
			sink.emit(AgentEvent::ConnectionChanged { state: ConnectionState::Unavailable });
			sink.emit(AgentEvent::Failed { error: error.clone() });
			return Err(error);
		}
	};

	if let Some(path) = refused_dir {
		sink.emit(AgentEvent::Failed { error: TransportError::WorkingDirectoryRefused { path } });
	}

	if lineage_is_held_elsewhere {
		sink.emit(AgentEvent::Failed {
			error: TransportError::ResumeFailed { forgot_session_id: false },
		});
	}

	if let Some(refusal) = &started.resume_refusal {
		let forgot_session_id =
			forget_the_id_a_refusal_blames(&database, &scope, refused_id, refusal).await;
		sink.emit(AgentEvent::Failed { error: TransportError::ResumeFailed { forgot_session_id } });
	}

	let session = Arc::new(started.session);
	let handle = SessionHandle { resumed: session.resumed() };
	if !state.live.install(&scope, session.clone()) {
		session.shutdown().await;
		return Err(TransportError::TransitionInProgress);
	}
	sink.emit(AgentEvent::ConnectionChanged { state: ConnectionState::Ready });
	Ok(handle)
}

async fn forget_the_id_a_refusal_blames(
	state: &db::DatabaseState,
	scope: &RuntimeScope,
	refused_id: Option<String>,
	refusal: &TransportError,
) -> bool {
	if !matches!(refusal, TransportError::Crashed { .. }) {
		return false;
	}
	let (Ok(database), Some(refused_id)) = (state.as_ref(), refused_id) else {
		return true;
	};
	let _ = database
		.runtime_context()
		.forget_provider_session(participant_key(scope), refused_id)
		.await;
	true
}

pub struct Started {
	pub session: Session,
	pub resume_refusal: Option<TransportError>,
}

pub async fn start_with_fallback(
	sidecar: Arc<Sidecar>,
	options: SessionOptions,
	resume: Option<String>,
	sink: Arc<dyn EventSink>,
) -> Result<Started, TransportError> {
	if resume.is_none() {
		let session = Session::start(sidecar, options, sink).await?;
		return Ok(Started { session, resume_refusal: None });
	}

	let gated = Arc::new(GatedSink::new(sink.clone()));
	let resuming = Session::start(sidecar.clone(), options.clone().resuming(resume), gated.clone());
	let refusal = match resuming.await {
		Ok(session) => {
			gated.promote();
			return Ok(Started { session, resume_refusal: None });
		}
		Err(error) => error,
	};

	gated.discard();
	let session = Session::start(sidecar, options, sink).await?;
	Ok(Started { session, resume_refusal: Some(refusal) })
}

#[tauri::command]
pub async fn agent_submit_prompt(
	state: State<'_, AgentState>,
	scope: RuntimeScope,
	text: String,
) -> Result<(), TransportError> {
	state.live.session_for(&scope)?.submit_prompt(&text).await
}

#[tauri::command]
pub async fn agent_cancel_turn(
	state: State<'_, AgentState>,
	scope: RuntimeScope,
) -> Result<(), TransportError> {
	state.live.session_for(&scope)?.cancel_turn().await
}

#[tauri::command]
pub async fn agent_respond_to_permission(
	state: State<'_, AgentState>,
	scope: RuntimeScope,
	id: String,
	decision: PermissionDecision,
) -> Result<(), TransportError> {
	state.live.session_for(&scope)?.respond_to_permission(&id, decision).await
}

#[tauri::command]
pub async fn agent_answer_question(
	state: State<'_, AgentState>,
	scope: RuntimeScope,
	id: String,
	answers: HashMap<String, String>,
	annotations: Option<serde_json::Value>,
) -> Result<(), TransportError> {
	state.live.session_for(&scope)?.answer_question(&id, answers, annotations).await
}

pub async fn shutdown_session(state: &AgentState, scope: &RuntimeScope) {
	let session = state.live.clear(scope);
	if let Some(session) = session {
		session.shutdown().await;
	}
}

pub async fn terminate_session(state: &AgentState) {
	state.enter_quit();
	let ending: Vec<_> = state
		.live
		.clear_all()
		.into_iter()
		.map(|session| tauri::async_runtime::spawn(async move { session.shutdown().await }))
		.collect();
	for termination in ending {
		let _ = termination.await;
	}
	if let Some(sidecar) = state.take_sidecar().await {
		sidecar.terminate().await;
	}
	sidecar::sweep_live_groups();
}

#[tauri::command]
pub async fn agent_shutdown<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, AgentState>,
	scope: RuntimeScope,
) -> Result<(), TransportError> {
	let _claim = state.claim(&scope)?;
	if state.live.is_foreign(&scope) {
		return Err(stale(&scope));
	}
	shutdown_session(&state, &scope).await;
	announce(&app, Some(scope), AgentEvent::ConnectionChanged { state: ConnectionState::Checking });
	Ok(())
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::db::repositories::runtime_context::RuntimeSessionStatus;

	fn a_fresh_app_data(name: &str) -> PathBuf {
		let app_data = std::env::temp_dir().join(format!("opennest-app-data-{name}"));
		let _ = std::fs::remove_dir_all(&app_data);
		std::fs::create_dir_all(&app_data).expect("the app data directory is there");
		app_data
	}

	#[test]
	fn a_bot_with_no_directory_runs_in_one_reserved_for_it_inside_the_app_data() {
		let app_data = a_fresh_app_data("reserved");

		let running_in = reserved_directory(app_data.clone(), "bot-a");

		assert_eq!(running_in, app_data.join(RUNS_DIR).join("bot-a"));
		assert!(running_in.is_dir(), "the reserved directory was not created");
		std::fs::remove_dir_all(&app_data).expect("cleanup");
	}

	#[test]
	fn two_bots_with_no_directory_never_share_one() {
		let app_data = a_fresh_app_data("distinct");

		let first = reserved_directory(app_data.clone(), "bot-a");
		let second = reserved_directory(app_data.clone(), "bot-b");

		assert_ne!(first, second);
		assert!(first.is_dir() && second.is_dir());
		std::fs::remove_dir_all(&app_data).expect("cleanup");
	}

	#[test]
	fn a_reserved_directory_that_cannot_be_created_falls_back_to_the_app_data() {
		let app_data = a_fresh_app_data("blocked");
		std::fs::write(app_data.join(RUNS_DIR), b"i am a file").expect("the file is written");

		let running_in = reserved_directory(app_data.clone(), "bot-a");

		assert_eq!(running_in, app_data);
		std::fs::remove_dir_all(&app_data).expect("cleanup");
	}

	#[test]
	fn a_bot_that_names_a_directory_runs_in_it() {
		let asked = std::env::temp_dir();
		let (running_in, refused) = where_it_runs(
			Some(asked.to_string_lossy().into_owned()),
			PathBuf::from("/somewhere/else"),
		);

		assert_eq!(running_in, asked);
		assert_eq!(refused, None, "a directory that is there was refused");
	}

	#[test]
	fn a_bot_that_names_none_runs_where_one_always_did() {
		let anywhere = PathBuf::from("/somewhere/else");
		for nothing in [None, Some(String::new()), Some("   ".to_owned())] {
			let (running_in, refused) = where_it_runs(nothing, anywhere.clone());
			assert_eq!(running_in, anywhere);
			assert_eq!(refused, None);
		}
	}

	#[test]
	fn a_directory_that_is_gone_is_reported_and_the_run_happens_anyway() {
		let anywhere = std::env::temp_dir();
		let missing = anywhere.join("opennest-no-such-directory-3f2b");
		let _ = std::fs::remove_dir_all(&missing);

		let (running_in, refused) =
			where_it_runs(Some(missing.to_string_lossy().into_owned()), anywhere.clone());

		assert_eq!(running_in, anywhere, "a missing directory left the reader without a process");
		assert_eq!(refused.as_deref(), Some(redact::path(&missing).as_str()));
	}

	#[test]
	fn a_path_that_is_not_a_directory_is_refused_like_one_that_is_gone() {
		let anywhere = std::env::temp_dir();
		let file = anywhere.join("opennest-not-a-directory-3f2b");
		std::fs::write(&file, b"i am a file").expect("the file is written");

		let (running_in, refused) =
			where_it_runs(Some(file.to_string_lossy().into_owned()), anywhere.clone());

		assert_eq!(running_in, anywhere);
		assert_eq!(refused.as_deref(), Some(redact::path(&file).as_str()));
		std::fs::remove_file(&file).expect("cleanup");
	}

	fn a_stored_bot() -> StoredBot {
		StoredBot {
			id: "b1".to_owned(),
			space_id: "personal".to_owned(),
			section_id: None,
			pin_position: None,
			name: "Bean".to_owned(),
			title: String::new(),
			model: "sonnet".to_owned(),
			avatar_animal: crate::db::repositories::conversations::AvatarAnimal::Owl,
			avatar_blot: None,
			avatar_image_path: None,
			working_dir: None,
			instructions: "Answer briefly.".to_owned(),
			memory: String::new(),
			denied_tools: Vec::new(),
			permissions: None,
			created_at: 1,
		}
	}

	fn a_fresh_bundle_root(name: &str) -> PathBuf {
		let root = std::env::temp_dir().join(format!("opennest-session-rules-{name}"));
		let _ = std::fs::remove_dir_all(&root);
		root
	}

	fn a_rule(allow: &str) -> bundles::BotPermissions {
		bundles::BotPermissions { allow: vec![allow.to_owned()], ..Default::default() }
	}

	fn a_settings_path(root: &Path, bot: &StoredBot) -> PathBuf {
		bundles::dir(root, &bot.id).join("settings.json")
	}

	fn what_the_bot_wrote(root: &Path, bot: &StoredBot, allow: &str) {
		private_files::replace(
			&a_settings_path(root, bot),
			serde_json::json!({
				"env": { "TZ": "UTC" },
				"permissions": { "allow": [allow], "defaultMode": "acceptEdits" }
			})
			.to_string()
			.as_bytes(),
		)
		.expect("the settings file is written");
	}

	fn settings_of(root: &Path, bot: &StoredBot) -> serde_json::Value {
		let read = std::fs::read(a_settings_path(root, bot)).expect("the settings file is read");
		serde_json::from_slice(&read).expect("the settings file parses")
	}

	#[test]
	fn a_session_start_writes_the_stored_rules_over_the_ones_the_bot_gave_itself() {
		let root = a_fresh_bundle_root("replaced");
		let bot = a_stored_bot();
		bundles::write(&root, &bot).expect("the bundle is written");
		what_the_bot_wrote(&root, &bot, "Bash");

		laid_down_bundle(&root, &bot, &a_rule("Read"), None, None, None)
			.expect("the bundle is laid down");

		assert_eq!(bundles::permissions(&root, &bot.id), Some(a_rule("Read")));
		assert_eq!(
			settings_of(&root, &bot)["env"]["TZ"],
			serde_json::json!("UTC"),
			"a key the app does not own was rewritten"
		);

		let _ = std::fs::remove_dir_all(&root);
	}

	#[test]
	fn a_session_start_that_changes_nothing_leaves_the_history_where_it_was() {
		let root = a_fresh_bundle_root("quiet");
		let bot = a_stored_bot();
		bundles::write(&root, &bot).expect("the bundle is written");
		what_the_bot_wrote(&root, &bot, "Bash");

		laid_down_bundle(&root, &bot, &a_rule("Read"), None, None, None)
			.expect("the bundle is laid down");
		let after_the_rewrite = bundles::history(&root, &bot.id).expect("the history reads").len();

		laid_down_bundle(&root, &bot, &a_rule("Read"), None, None, None)
			.expect("the bundle is laid down");

		assert_eq!(
			bundles::history(&root, &bot.id).expect("the history reads").len(),
			after_the_rewrite
		);

		let _ = std::fs::remove_dir_all(&root);
	}

	#[tokio::test]
	async fn the_rules_a_bundle_carries_become_the_stored_ones_once() {
		let root = a_fresh_bundle_root("adopted");
		let dir = crate::db::connection::temp_dir();
		let database = crate::db::open(&dir);
		let bot = database
			.conversations()
			.create_bot(a_stored_bot().into(), None, None)
			.await
			.expect("the bot");
		bundles::write(&root, &bot).expect("the bundle is written");
		what_the_bot_wrote(&root, &bot, "Bash");

		let settled = settled_permissions(&database, Some(&root), &bot).await;
		assert_eq!(settled.allow, ["Bash"]);

		let held =
			database.conversations().bot(bot.id.clone()).await.expect("the bot").expect("a row");
		assert_eq!(held.permissions.as_ref(), Some(&settled));

		what_the_bot_wrote(&root, &bot, "Write");

		assert_eq!(
			settled_permissions(&database, Some(&root), &held).await.allow,
			["Bash"],
			"the file was adopted a second time"
		);

		drop(database);
		let _ = std::fs::remove_dir_all(&root);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	const REPLACED_SESSION: &str = "the session that was replaced";
	const REPLACEMENT_SESSION: &str = "the session that replaced it";

	fn a_scope() -> RuntimeScope {
		RuntimeScope {
			conversation_id: "c1".into(),
			bot_id: "b1".into(),
			runtime_session_id: "r1".into(),
			epoch: 1,
		}
	}

	fn the_next_run() -> RuntimeScope {
		RuntimeScope { runtime_session_id: "r2".into(), epoch: 2, ..a_scope() }
	}

	fn another_bots_run() -> RuntimeScope {
		RuntimeScope {
			conversation_id: "c2".into(),
			bot_id: "b2".into(),
			runtime_session_id: "r9".into(),
			epoch: 1,
		}
	}

	const ANOTHER_BOTS_SESSION: &str = "the session of the bot next door";

	fn a_run_named(runtime_session_id: &str) -> RuntimeScope {
		RuntimeScope { runtime_session_id: runtime_session_id.into(), ..a_scope() }
	}

	fn admitted<S: Clone>(live: &Live<S>, scope: RuntimeScope) -> Admission<S> {
		live.take_over(scope).expect("the host admits the run")
	}

	fn is_stale(outcome: &Result<&str, TransportError>) -> bool {
		matches!(outcome, Err(TransportError::StaleRuntimeSession { .. }))
	}

	fn is_unheld(outcome: &Result<&str, TransportError>) -> bool {
		matches!(outcome, Err(TransportError::NotStarted))
	}

	#[test]
	fn a_scope_differing_on_the_epoch_is_stale_and_one_naming_another_run_is_not_held() {
		let live = Live::<&str>::default();
		admitted(&live, a_scope());
		assert!(live.install(&a_scope(), REPLACED_SESSION));

		assert!(live.holds(&a_scope()), "the host stopped recognising the run it holds");
		assert!(!live.is_foreign(&a_scope()), "the live run was refused as somebody else's");

		let drifted = RuntimeScope { epoch: 2, ..a_scope() };
		assert!(live.is_foreign(&drifted), "a scope naming another epoch reached the run");
		assert!(!live.holds(&drifted), "a run the host never held was taken for it");
		assert!(
			is_stale(&live.session_for(&drifted)),
			"a scope naming another epoch was handed the session"
		);

		for other in [
			the_next_run(),
			another_bots_run(),
			RuntimeScope { bot_id: "b2".into(), runtime_session_id: "r3".into(), ..a_scope() },
		] {
			assert!(!live.holds(&other), "a run the host never held was taken for it: {other:?}");
			assert!(
				!live.is_foreign(&other),
				"a run the host never held was refused as a stale one: {other:?}"
			);
			assert!(
				is_unheld(&live.session_for(&other)),
				"a run the host never held was handed another's session: {other:?}"
			);
		}
	}

	#[test]
	fn two_runs_of_one_bot_are_held_at_the_same_time_and_only_the_first_keeps_the_lineage() {
		let live = Live::<&str>::default();

		let first = admitted(&live, a_scope());
		assert!(live.install(&a_scope(), REPLACED_SESSION));
		let second = admitted(&live, the_next_run());
		assert!(live.install(&the_next_run(), REPLACEMENT_SESSION));

		assert!(first.keeps_lineage, "the first instance of a bot was refused the lineage");
		assert!(
			second.replaced.is_none(),
			"a second instance handed back the first one's child to be shut down"
		);
		assert!(!second.keeps_lineage, "two instances of one bot both kept the lineage");
		assert_eq!(
			live.session_for(&a_scope()).ok(),
			Some(REPLACED_SESSION),
			"the first instance lost its session to the second one"
		);
		assert_eq!(live.session_for(&the_next_run()).ok(), Some(REPLACEMENT_SESSION));
		assert!(live.holds(&a_scope()) && live.holds(&the_next_run()));
	}

	#[test]
	fn a_run_started_again_under_its_own_id_hands_back_the_child_it_replaces() {
		let live = Live::<&str>::default();
		admitted(&live, a_scope());
		assert!(live.install(&a_scope(), REPLACED_SESSION));

		let again = admitted(&live, a_scope());

		assert_eq!(
			again.replaced,
			Some(REPLACED_SESSION),
			"a restart of one run left its child behind"
		);
		assert!(again.keeps_lineage, "a run restarting under its own id was refused the lineage");
		assert!(
			is_unheld(&live.session_for(&a_scope())),
			"a restarted run answered with the child it replaced"
		);
	}

	#[test]
	fn the_lineage_comes_back_to_the_next_run_once_the_bot_holds_none() {
		let live = Live::<&str>::default();
		admitted(&live, a_scope());
		assert!(!admitted(&live, the_next_run()).keeps_lineage);

		live.clear(&a_scope());
		live.clear(&the_next_run());

		assert!(
			admitted(&live, a_scope()).keeps_lineage,
			"the lineage stayed with a run the host had let go"
		);
	}

	#[test]
	fn the_ninth_live_session_is_refused_and_the_eight_it_found_stay() {
		let live = Live::<&str>::default();
		for index in 0..MAX_LIVE_SESSIONS {
			let scope = a_run_named(&format!("r{index}"));
			admitted(&live, scope.clone());
			assert!(live.install(&scope, REPLACED_SESSION));
		}

		let refused = live.take_over(a_run_named("r-one-too-many")).err();

		assert_eq!(
			refused,
			Some(TransportError::TooManyLiveSessions { cap: MAX_LIVE_SESSIONS }),
			"the ninth live session was let in"
		);
		assert!(
			!live.holds(&a_run_named("r-one-too-many")),
			"a refused start was still taken for a live run"
		);
		assert_eq!(
			live.clear_all().len(),
			MAX_LIVE_SESSIONS,
			"the sessions the host was already holding did not survive the refusal"
		);
	}

	#[test]
	fn two_bots_each_hold_their_own_session_at_the_same_time() {
		let live = Live::<&str>::default();

		assert!(admitted(&live, a_scope()).replaced.is_none());
		assert!(live.install(&a_scope(), REPLACED_SESSION));
		assert!(
			admitted(&live, another_bots_run()).replaced.is_none(),
			"starting one bot handed back another bot's child to be shut down"
		);
		assert!(live.install(&another_bots_run(), ANOTHER_BOTS_SESSION));

		assert_eq!(live.session_for(&a_scope()).ok(), Some(REPLACED_SESSION));
		assert_eq!(live.session_for(&another_bots_run()).ok(), Some(ANOTHER_BOTS_SESSION));
		assert!(live.holds(&a_scope()) && live.holds(&another_bots_run()));

		assert_eq!(live.clear(&a_scope()), Some(REPLACED_SESSION));
		assert!(
			live.holds(&another_bots_run()),
			"ending one bot's run ended the run of the bot beside it"
		);
		assert_eq!(
			live.session_for(&another_bots_run()).ok(),
			Some(ANOTHER_BOTS_SESSION),
			"a bot lost its own session when another bot's was shut down"
		);
	}

	#[test]
	fn the_exit_gives_up_every_bots_child_at_once() {
		let live = Live::<&str>::default();
		admitted(&live, a_scope());
		live.install(&a_scope(), REPLACED_SESSION);
		admitted(&live, another_bots_run());
		live.install(&another_bots_run(), ANOTHER_BOTS_SESSION);
		admitted(&live, a_run_named("r7"));

		let mut ended = live.clear_all();
		ended.sort_unstable();
		assert_eq!(
			ended,
			vec![ANOTHER_BOTS_SESSION, REPLACED_SESSION],
			"the exit left a live child behind"
		);
		assert!(!live.holds(&a_scope()) && !live.holds(&another_bots_run()));
		assert!(
			is_unheld(&live.session_for(&another_bots_run())),
			"a command reached a session after the exit gave it up"
		);
	}

	#[test]
	fn a_child_built_for_a_run_the_host_has_left_is_never_installed() {
		let live = Live::<&str>::default();
		admitted(&live, a_scope());

		live.clear_all();

		assert!(
			!live.install(&a_scope(), REPLACED_SESSION),
			"a start installed its child into a host that had let its run go"
		);
		assert!(
			matches!(live.session_for(&a_scope()), Err(TransportError::NotStarted)),
			"a host standing for no run answered with a session all the same"
		);
	}

	#[test]
	fn a_transition_holds_one_run_and_lets_every_other_run_through() {
		let state = AgentState::default();

		let held = state.claim(&a_scope()).expect("the first claim is free");
		assert!(
			matches!(state.claim(&a_scope()), Err(TransportError::TransitionInProgress)),
			"one run took two transitions at once"
		);
		assert!(
			state.claim(&the_next_run()).is_ok(),
			"one instance's transition refused another instance of the same bot"
		);
		assert!(
			state.claim(&another_bots_run()).is_ok(),
			"one bot's transition refused another bot's"
		);

		drop(held);
		assert!(state.claim(&a_scope()).is_ok(), "a spent transition kept its seat");
	}

	#[test]
	fn nothing_starts_for_any_bot_once_the_host_is_quitting() {
		let state = AgentState::default();
		state.enter_quit();

		for scope in [a_scope(), another_bots_run()] {
			assert!(
				matches!(state.claim(&scope), Err(TransportError::TransitionInProgress)),
				"a start was let through after the quit: {scope:?}"
			);
		}
	}

	const A_CONVERSATION: &str = "
		INSERT INTO bots (id, space_id, name, model, created_at)
			VALUES ('b1', 'personal', 'First', 'sonnet', 1);
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('c1', 'main', 'First', 1, 1);
		INSERT INTO conversation_participants
			(conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'assistant', 1, 0);
	";

	async fn a_database_resuming(provider_session_id: &str) -> db::DatabaseState {
		let database = crate::db::open(&crate::db::connection::temp_dir());
		database
			.call_mut(|connection| Ok(connection.execute_batch(A_CONVERSATION)?))
			.await
			.expect("the conversation is there");
		let participant = participant_key(&a_scope());
		let session = database
			.runtime_context()
			.open(participant.clone(), 1, None)
			.await
			.expect("the runtime session opens");
		database
			.runtime_context()
			.record_provider_session(participant, session.id, provider_session_id.to_owned())
			.await
			.expect("the provider session is recorded");
		Ok(database)
	}

	async fn stored_id(state: &db::DatabaseState) -> Option<String> {
		state
			.as_ref()
			.expect("the database opens")
			.runtime_context()
			.active_session(participant_key(&a_scope()))
			.await
			.expect("the live session")
			.and_then(|session| session.provider_session_id)
	}

	async fn a_conversation_of_two_instances() -> (db::DatabaseState, RuntimeScope, RuntimeScope) {
		let database = crate::db::open(&crate::db::connection::temp_dir());
		database
			.call_mut(|connection| Ok(connection.execute_batch(A_CONVERSATION)?))
			.await
			.expect("the conversation is there");
		let participant = participant_key(&a_scope());
		let runtime = database.runtime_context();
		let first = runtime.open(participant.clone(), 1, None).await.expect("the first instance");
		let second = runtime.open(participant.clone(), 2, None).await.expect("the second instance");
		runtime
			.record_provider_session(participant, first.id.clone(), "session-1".to_owned())
			.await
			.expect("the lineage is recorded");
		let scope_of =
			|id: String, seq: i64| RuntimeScope { runtime_session_id: id, epoch: seq, ..a_scope() };
		(Ok(database), scope_of(first.id, first.seq), scope_of(second.id, second.seq))
	}

	#[tokio::test]
	async fn a_second_instance_starts_cold_and_records_its_own_provider_session() {
		let (state, lineage, beside_it) = a_conversation_of_two_instances().await;
		let live = Live::<&str>::default();

		let holder = admitted(&live, lineage.clone());
		let cold = admitted(&live, beside_it.clone());

		assert_eq!(
			holder.resume(Some("session-1".to_owned())),
			Some("session-1".to_owned()),
			"the instance holding the lineage was refused its own resume id"
		);
		assert_eq!(
			cold.resume(Some("session-1".to_owned())),
			None,
			"a second instance was handed the resume id the first one is running on"
		);

		let database = state.as_ref().expect("the database opens");
		record_its_own_provider_session(database, &beside_it, "session-2".to_owned())
			.await
			.expect("the second instance records its own provider session");

		let sessions = database
			.runtime_context()
			.sessions_for(participant_key(&a_scope()))
			.await
			.expect("the sessions");
		let recorded: Vec<_> = sessions
			.iter()
			.map(|session| (session.provider_session_id.as_deref(), session.status))
			.collect();
		assert_eq!(
			recorded,
			vec![
				(Some("session-1"), RuntimeSessionStatus::Active),
				(Some("session-2"), RuntimeSessionStatus::Active)
			],
			"the second instance did not write its own id on its own live row"
		);
	}

	#[tokio::test]
	async fn a_timed_out_resume_keeps_the_stored_id_and_a_crashed_one_spends_it() {
		let state = a_database_resuming("session-1").await;

		let spent = forget_the_id_a_refusal_blames(
			&state,
			&a_scope(),
			Some("session-1".into()),
			&TransportError::StartupTimeout { timeout_ms: 30_000 },
		)
		.await;
		assert!(!spent, "a slow resume was reported to the frontend as a spent id");
		assert_eq!(
			stored_id(&state).await.as_deref(),
			Some("session-1"),
			"a slow resume cost the id"
		);

		let spent = forget_the_id_a_refusal_blames(
			&state,
			&a_scope(),
			Some("session-1".into()),
			&TransportError::Crashed { code: Some(4), detail: None },
		)
		.await;
		assert!(spent, "the frontend was left holding an id the host gave up on");
		assert_eq!(
			stored_id(&state).await,
			None,
			"a refused id outlived the crash that proved it dead"
		);
	}
}
