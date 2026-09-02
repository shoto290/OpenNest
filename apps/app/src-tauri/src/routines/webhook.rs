use std::io::ErrorKind;
use std::net::{Ipv4Addr, SocketAddr, TcpListener as StandardListener};

use axum::extract::rejection::StringRejection;
use axum::extract::{DefaultBodyLimit, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::post;
use axum::Router;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, Runtime};
use tokio::net::TcpListener;
use tokio::sync::watch as signal;
use uuid::Uuid;

use super::commands::{declared_source, Announcer};
use super::contract::{RoutineError, TriggerDecision, TriggerEvent};
use super::core::{self, Clock, SystemClock};
use crate::conversations::commands::ready;
use crate::db;

pub const SOURCE_ID: &str = "local-webhook";

pub const HEADER: &str = "X-OpenNest-Delivery";

pub const PREFERRED_PORT: u16 = 45_367;

pub const MAX_BODY_BYTES: usize = 64 * 1024;

const PATH: &str = "/routines/call";

const ACCEPTED: (StatusCode, &str) = (StatusCode::ACCEPTED, "the routine was told");

const REFUSED: (StatusCode, &str) = (StatusCode::NOT_FOUND, "no routine answers this call");

const FAILED: (StatusCode, &str) = (StatusCode::INTERNAL_SERVER_ERROR, "the call was not carried");

pub struct Webhook {
	address: Option<SocketAddr>,
	stop: signal::Sender<bool>,
}

impl Webhook {
	pub fn url(&self) -> Option<String> {
		self.address.map(|address| format!("http://{address}{PATH}"))
	}

	pub fn stop(&self) {
		self.stop.send_replace(true);
	}
}

pub fn start<R: Runtime>(app: AppHandle<R>) -> Webhook {
	let (stop, halted) = signal::channel(false);
	let address = match listening() {
		Ok((listener, address)) => {
			tauri::async_runtime::spawn(serving(app, listener, halted));
			Some(address)
		}
		Err(failure) => {
			eprintln!("no local webhook call is answered: {failure}");
			None
		}
	};
	Webhook { address, stop }
}

fn listening() -> Result<(StandardListener, SocketAddr), std::io::Error> {
	let listener = bound()?;
	listener.set_nonblocking(true)?;
	let address = listener.local_addr()?;
	Ok((listener, address))
}

fn bound() -> Result<StandardListener, std::io::Error> {
	match StandardListener::bind((Ipv4Addr::LOCALHOST, PREFERRED_PORT)) {
		Err(taken) if taken.kind() == ErrorKind::AddrInUse => {
			StandardListener::bind((Ipv4Addr::LOCALHOST, 0))
		}
		held => held,
	}
}

async fn serving<R: Runtime>(
	app: AppHandle<R>,
	listener: StandardListener,
	halted: signal::Receiver<bool>,
) {
	let listener = match TcpListener::from_std(listener) {
		Ok(listener) => listener,
		Err(failure) => return eprintln!("the local webhook kept no socket: {failure}"),
	};
	let served = axum::serve(listener, route(app)).with_graceful_shutdown(stopping(halted)).await;
	if let Err(failure) = served {
		eprintln!("the local webhook stopped answering: {failure}");
	}
}

async fn stopping(mut halted: signal::Receiver<bool>) {
	if halted.changed().await.is_err() {
		eprintln!("the local webhook lost the signal that stops it");
	}
}

fn route<R: Runtime>(app: AppHandle<R>) -> Router {
	Router::new()
		.route(PATH, post(called::<R>))
		.layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
		.with_state(app)
}

async fn called<R: Runtime>(
	State(app): State<AppHandle<R>>,
	headers: HeaderMap,
	body: Result<String, StringRejection>,
) -> (StatusCode, &'static str) {
	let Ok(body) = body else {
		return REFUSED;
	};
	match carried(&app, &headers, body).await {
		Ok(Some(_)) => ACCEPTED,
		Ok(None) => REFUSED,
		Err(failure) => {
			eprintln!("a local webhook call reached no routine: {failure:?}");
			FAILED
		}
	}
}

async fn carried<R: Runtime>(
	app: &AppHandle<R>,
	headers: &HeaderMap,
	body: String,
) -> Result<Option<TriggerDecision>, RoutineError> {
	let Some(key) = presented(headers) else {
		return Ok(None);
	};
	let state = app.state::<db::DatabaseState>();
	let database = ready(&state)?;
	let held = database.routines().keyed_on_source(key, SOURCE_ID.to_owned()).await?;
	let Some(routine) = held else {
		return Ok(None);
	};
	let source =
		declared_source(app, database, &routine.bot_id, &routine.trigger_source_id).await?;
	let event = TriggerEvent {
		routine_id: routine.id.clone(),
		source,
		payload: payload(body, SystemClock.now_ms())?,
	};
	core::on_trigger(database, &Announcer { app }, &SystemClock, event).await.map(Some)
}

fn presented(headers: &HeaderMap) -> Option<String> {
	headers.get(HEADER)?.to_str().ok().map(str::to_owned)
}

fn payload(body: String, at: i64) -> Result<Value, RoutineError> {
	Ok(json!({
		"deliveryId": Uuid::new_v4().to_string(),
		"receivedAt": core::moment(at)?,
		"body": body,
	}))
}

#[cfg(test)]
mod tests {
	use std::fs;
	use std::path::PathBuf;
	use std::sync::mpsc;
	use std::time::Duration;

	use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
	use tauri::{App, Listener as _};
	use tokio::io::{AsyncReadExt, AsyncWriteExt};
	use tokio::net::TcpStream;

	use super::super::commands::RUN_REQUESTED_EVENT;
	use super::super::contract::{Filter, FilterMatchMode, RoutineDraft};
	use super::*;
	use crate::bundles;

	const A_PARTICIPANT: &str = "
		INSERT INTO bots (id, space_id, name, model, created_at)
			VALUES ('b1', 'personal', 'First', 'sonnet', 1);
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('c1', 'main', 'First', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'assistant', 1, 0);
	";

	const A_KEY: &str = "the-webhook-key";

	const ANOTHER_KEY: &str = "the-schedule-key";

	async fn a_host(name: &str) -> App<MockRuntime> {
		let mut context = mock_context(noop_assets());
		context.config_mut().identifier =
			format!("com.opennest.routine-webhook-{name}-{}", std::process::id()).into();
		let app = mock_builder().build(context).expect("the app builds");
		cleaned(&app);
		app.manage(db::bootstrap(app.handle()));
		let system = bundles::system::path(app.handle()).expect("the system bundle is named");
		bundles::system::write(&system).expect("the system bundle lands");
		{
			let state = app.state::<db::DatabaseState>();
			let database = ready(&state).expect("the database opens");
			database
				.call_mut(|connection| Ok(connection.execute_batch(A_PARTICIPANT)?))
				.await
				.expect("the participant is planted");
			planted(database, SOURCE_ID, A_KEY).await;
			planted(database, "schedule", ANOTHER_KEY).await;
		}
		app
	}

	async fn planted(database: &db::Database, trigger_source_id: &str, key: &str) {
		let draft = RoutineDraft {
			conversation_id: "c1".to_owned(),
			bot_id: "b1".to_owned(),
			title: "Nightly report".to_owned(),
			instruction: "Read what the call carried.".to_owned(),
			trigger_source_id: trigger_source_id.to_owned(),
			filter: Filter { match_mode: FilterMatchMode::All, rows: Vec::new() },
			trigger_config: json!({ "expression": "0 * * * *" }),
		};
		database.routines().create(draft, key.to_owned(), 1).await.expect("the routine is stored");
	}

	fn cleaned(app: &App<MockRuntime>) {
		if let Ok(dir) = app.path().app_data_dir() {
			let _ = fs::remove_dir_all(&dir);
		}
	}

	async fn counted(database: &db::Database, statement: &'static str) -> i64 {
		database
			.call(move |connection| Ok(connection.query_row(statement, [], |row| row.get(0))?))
			.await
			.expect("the count reads")
	}

	fn calling(key: Option<&str>, body: &str) -> String {
		let mut request = format!(
			"POST {PATH} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\
			 Content-Length: {}\r\n",
			body.len()
		);
		if let Some(key) = key {
			request.push_str(&format!("{HEADER}: {key}\r\n"));
		}
		request.push_str("\r\n");
		request.push_str(body);
		request
	}

	async fn answered(address: SocketAddr, request: String) -> (u16, String) {
		let mut stream = TcpStream::connect(address).await.expect("the listener answers");
		stream.write_all(request.as_bytes()).await.expect("the request lands");
		let mut answer = Vec::new();
		stream.read_to_end(&mut answer).await.expect("the answer reads");
		let answer = String::from_utf8_lossy(&answer).into_owned();
		let (head, body) = answer.split_once("\r\n\r\n").expect("the answer carries a body");
		let status = head.split_whitespace().nth(1).expect("the answer carries a status");
		(status.parse().expect("the status is a number"), body.to_owned())
	}

	fn address_of(webhook: &Webhook) -> SocketAddr {
		webhook.address.expect("the webhook bound an address")
	}

	fn refused() -> (u16, String) {
		(REFUSED.0.as_u16(), REFUSED.1.to_owned())
	}

	#[tokio::test]
	async fn a_call_carrying_the_key_of_a_webhook_routine_opens_a_run_from_what_it_carried() {
		let app = a_host("fired").await;
		let (requested, arriving) = mpsc::channel();
		app.listen(RUN_REQUESTED_EVENT, move |event| {
			requested.send(event.payload().to_owned()).expect("the test is listening");
		});
		let webhook = start(app.handle().clone());

		let answer = answered(address_of(&webhook), calling(Some(A_KEY), "{\"ok\":true}")).await;

		assert_eq!(answer, (ACCEPTED.0.as_u16(), ACCEPTED.1.to_owned()));
		let announced = arriving
			.recv_timeout(Duration::from_secs(5))
			.expect("the run was announced to the front");
		let announced: Value = serde_json::from_str(&announced).expect("the event is JSON");
		let payload = &announced["payload"];
		assert_eq!(payload["body"], json!("{\"ok\":true}"));
		assert!(payload["deliveryId"].as_str().is_some_and(|id| !id.is_empty()), "got {payload}");
		assert!(
			payload["receivedAt"].as_str().is_some_and(|at| at.ends_with('Z')),
			"got {payload}"
		);
		let state = app.state::<db::DatabaseState>();
		let database = ready(&state).expect("the database opens");
		assert_eq!(counted(database, "SELECT count(*) FROM routine_runs").await, 1);

		webhook.stop();
		cleaned(&app);
	}

	#[tokio::test]
	async fn a_call_no_webhook_routine_holds_the_key_of_opens_nothing() {
		let app = a_host("refused").await;
		let webhook = start(app.handle().clone());
		let address = address_of(&webhook);

		for request in [
			calling(None, "{}"),
			calling(Some("no routine holds this"), "{}"),
			calling(Some(ANOTHER_KEY), "{}"),
		] {
			assert_eq!(answered(address, request).await, refused());
		}

		let state = app.state::<db::DatabaseState>();
		let database = ready(&state).expect("the database opens");
		assert_eq!(counted(database, "SELECT count(*) FROM routine_runs").await, 0);
		assert_eq!(counted(database, "SELECT count(*) FROM routine_dedupe_values").await, 0);

		webhook.stop();
		cleaned(&app);
	}

	#[tokio::test]
	async fn a_body_longer_than_the_cap_is_refused_the_way_every_other_call_is() {
		let app = a_host("capped").await;
		let webhook = start(app.handle().clone());

		let long = "a".repeat(MAX_BODY_BYTES + 1);
		let answer = answered(address_of(&webhook), calling(Some(A_KEY), &long)).await;

		assert_eq!(answer, refused());
		let state = app.state::<db::DatabaseState>();
		let database = ready(&state).expect("the database opens");
		assert_eq!(counted(database, "SELECT count(*) FROM routine_runs").await, 0);

		webhook.stop();
		cleaned(&app);
	}

	#[tokio::test]
	async fn the_listener_stops_answering_once_the_webhook_is_stopped() {
		let app = a_host("stopped").await;
		let webhook = start(app.handle().clone());
		let address = address_of(&webhook);
		assert_eq!(answered(address, calling(None, "{}")).await, refused());

		webhook.stop();

		let mut refusals = 0;
		while refusals < 100 && TcpStream::connect(address).await.is_ok() {
			refusals += 1;
			tokio::time::sleep(Duration::from_millis(20)).await;
		}
		assert!(refusals < 100, "the listener outlived the signal that stops it");

		cleaned(&app);
	}

	#[tokio::test]
	async fn a_taken_preferred_port_sends_the_listener_to_one_the_system_chooses() {
		let taken = StandardListener::bind((Ipv4Addr::LOCALHOST, PREFERRED_PORT));

		let (listener, address) = listening().expect("a listener binds");

		assert_ne!(address.port(), PREFERRED_PORT, "the taken port was handed out twice");
		assert_ne!(address.port(), 0, "the system named the port it chose");
		drop(listener);
		drop(taken);
	}

	#[test]
	fn the_header_and_the_source_are_the_ones_the_committed_bundle_declares() {
		let bundle = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("plugins").join("opennest");
		let declared = super::super::sources::sources_at(&bundle).expect("the bundle reads");

		let source = declared
			.iter()
			.find(|source| source.id == SOURCE_ID)
			.unwrap_or_else(|| panic!("the bundle declares no {SOURCE_ID}"));

		assert_eq!(source.header.as_deref(), Some(HEADER));
	}
}
