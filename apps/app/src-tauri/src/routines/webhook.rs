use std::io::ErrorKind;
use std::net::{Ipv4Addr, SocketAddr, TcpListener as StandardListener};
use std::sync::Arc;

use axum::extract::rejection::StringRejection;
use axum::extract::{DefaultBodyLimit, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::post;
use axum::Router;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, Runtime};
use tokio::net::TcpListener;
use tokio::sync::watch as signal;
use uuid::Uuid;

use super::commands::{declared_source, Announcer};
use super::contract::{RoutineError, TriggerEvent};
use super::core::{self, Clock, SystemClock};
use super::rate_limit::RateLimit;
use crate::conversations::commands::ready;
use crate::db;

pub const SOURCE_ID: &str = "local-webhook";

pub const HEADER: &str = "X-OpenNest-Delivery";

pub const DELIVERY_ID_HEADER: &str = "X-OpenNest-Delivery-Id";

pub const MAX_DELIVERY_ID_BYTES: usize = 200;

pub const PREFERRED_PORT: u16 = 45_367;

pub const MAX_BODY_BYTES: usize = 64 * 1024;

const PATH: &str = "/routines/call";

const ACCEPTED: (StatusCode, &str) = (StatusCode::ACCEPTED, "the routine was told");

const REFUSED: (StatusCode, &str) = (StatusCode::NOT_FOUND, "no routine answers this call");

const TOO_LARGE: (StatusCode, &str) =
	(StatusCode::PAYLOAD_TOO_LARGE, "the call carried more than the cap");

const FLOODED: (StatusCode, &str) =
	(StatusCode::TOO_MANY_REQUESTS, "the routine was called too often");

const OVER_LONG_DELIVERY_ID: (StatusCode, &str) =
	(StatusCode::BAD_REQUEST, "the delivery id carried more than 200 bytes");

const FAILED: (StatusCode, &str) = (StatusCode::INTERNAL_SERVER_ERROR, "the call was not carried");

const LOOPBACK_NAMES: [&str; 2] = ["127.0.0.1", "localhost"];

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
	started(app, Arc::new(SystemClock))
}

fn started<R: Runtime>(app: AppHandle<R>, clock: Arc<dyn Clock>) -> Webhook {
	let (stop, halted) = signal::channel(false);
	let calls = Calls { app, clock, limit: Arc::new(RateLimit::default()) };
	let address = match listening() {
		Ok((listener, address)) => {
			tauri::async_runtime::spawn(serving(calls, listener, halted));
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
	calls: Calls<R>,
	listener: StandardListener,
	halted: signal::Receiver<bool>,
) {
	let listener = match TcpListener::from_std(listener) {
		Ok(listener) => listener,
		Err(failure) => return eprintln!("the local webhook kept no socket: {failure}"),
	};
	let served = axum::serve(listener, route(calls)).with_graceful_shutdown(stopping(halted)).await;
	if let Err(failure) = served {
		eprintln!("the local webhook stopped answering: {failure}");
	}
}

async fn stopping(mut halted: signal::Receiver<bool>) {
	if halted.changed().await.is_err() {
		eprintln!("the local webhook lost the signal that stops it");
	}
}

struct Calls<R: Runtime> {
	app: AppHandle<R>,
	clock: Arc<dyn Clock>,
	limit: Arc<RateLimit>,
}

impl<R: Runtime> Clone for Calls<R> {
	fn clone(&self) -> Self {
		Calls { app: self.app.clone(), clock: self.clock.clone(), limit: self.limit.clone() }
	}
}

enum DeliveryId {
	Carried(String),
	Generated,
	OverLong,
}

fn route<R: Runtime>(calls: Calls<R>) -> Router {
	Router::new()
		.route(PATH, post(called::<R>))
		.layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
		.with_state(calls)
}

async fn called<R: Runtime>(
	State(calls): State<Calls<R>>,
	headers: HeaderMap,
	body: Result<String, StringRejection>,
) -> (StatusCode, &'static str) {
	if !named_here(&headers) {
		return REFUSED;
	}
	let delivery_id = match delivery_id(&headers) {
		DeliveryId::OverLong => return OVER_LONG_DELIVERY_ID,
		DeliveryId::Carried(held) => Some(held),
		DeliveryId::Generated => None,
	};
	let body = match body {
		Ok(body) => body,
		Err(rejection) => return unread(rejection),
	};
	match carried(&calls, &headers, delivery_id, body).await {
		Ok(answer) => answer,
		Err(failure) => {
			eprintln!("a local webhook call reached no routine: {failure:?}");
			FAILED
		}
	}
}

async fn carried<R: Runtime>(
	calls: &Calls<R>,
	headers: &HeaderMap,
	delivery_id: Option<String>,
	body: String,
) -> Result<(StatusCode, &'static str), RoutineError> {
	let Some(key) = presented(headers) else {
		return Ok(REFUSED);
	};
	let state = calls.app.state::<db::DatabaseState>();
	let database = ready(&state)?;
	let held = database.routines().keyed_on_source(key, SOURCE_ID.to_owned()).await?;
	let Some(routine) = held else {
		return Ok(REFUSED);
	};
	if !calls.limit.admits(&routine.id, calls.clock.as_ref()).await {
		return Ok(FLOODED);
	}
	let app = &calls.app;
	let source =
		declared_source(app, database, &routine.bot_id, &routine.trigger_source_id).await?;
	let event = TriggerEvent {
		routine_id: routine.id,
		source,
		payload: payload(body, delivery_id, calls.clock.now_ms())?,
	};
	core::on_trigger(database, &Announcer { app }, calls.clock.as_ref(), event).await?;
	Ok(ACCEPTED)
}

fn unread(rejection: StringRejection) -> (StatusCode, &'static str) {
	match rejection.into_response().status() {
		StatusCode::PAYLOAD_TOO_LARGE => TOO_LARGE,
		_ => REFUSED,
	}
}

fn named_here(headers: &HeaderMap) -> bool {
	let Some(host) = headers.get(header::HOST).and_then(|host| host.to_str().ok()) else {
		return false;
	};
	let name = host.split(':').next().unwrap_or(host);
	LOOPBACK_NAMES.contains(&name)
}

fn presented(headers: &HeaderMap) -> Option<String> {
	headers.get(HEADER)?.to_str().ok().map(str::to_owned)
}

fn delivery_id(headers: &HeaderMap) -> DeliveryId {
	let Some(value) = headers.get(DELIVERY_ID_HEADER) else {
		return DeliveryId::Generated;
	};
	if value.len() > MAX_DELIVERY_ID_BYTES {
		return DeliveryId::OverLong;
	}
	match value.to_str().map(str::trim) {
		Ok(held) if !held.is_empty() => DeliveryId::Carried(held.to_owned()),
		_ => DeliveryId::Generated,
	}
}

fn payload(body: String, delivery_id: Option<String>, at: i64) -> Result<Value, RoutineError> {
	Ok(json!({
		"deliveryId": delivery_id.unwrap_or_else(|| Uuid::new_v4().to_string()),
		"receivedAt": core::moment(at)?,
		"body": body,
	}))
}

#[cfg(test)]
mod tests {
	use std::fs;
	use std::path::PathBuf;
	use std::sync::atomic::{AtomicI64, Ordering};
	use std::sync::mpsc;
	use std::time::Duration;

	use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
	use tauri::{App, Listener as _};
	use tokio::io::{AsyncReadExt, AsyncWriteExt};
	use tokio::net::TcpStream;

	use super::super::commands::RUN_REQUESTED_EVENT;
	use super::super::contract::{Filter, FilterMatchMode, RoutineDraft};
	use super::super::rate_limit::{CALLS_PER_WINDOW, WINDOW_MS};
	use super::*;
	use crate::bundles;

	const NOON: i64 = 1_800_000_000_000;

	struct Ticking(AtomicI64);

	impl Ticking {
		fn at(now: i64) -> Arc<Self> {
			Arc::new(Ticking(AtomicI64::new(now)))
		}

		fn moved_by(&self, elapsed: i64) {
			self.0.fetch_add(elapsed, Ordering::SeqCst);
		}
	}

	impl Clock for Ticking {
		fn now_ms(&self) -> i64 {
			self.0.load(Ordering::SeqCst)
		}
	}

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

	const A_SECOND_KEY: &str = "the-second-webhook-key";

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
			planted(database, SOURCE_ID, A_SECOND_KEY).await;
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
		reaching("POST", PATH, Some("127.0.0.1"), key, body)
	}

	fn delivering(key: Option<&str>, delivery_id: &str, body: &str) -> String {
		let request = calling(key, body);
		let (head, sent) = request.split_once("\r\n\r\n").expect("the request carries a body");
		format!("{head}\r\n{DELIVERY_ID_HEADER}: {delivery_id}\r\n\r\n{sent}")
	}

	fn reaching(
		method: &str,
		path: &str,
		host: Option<&str>,
		key: Option<&str>,
		body: &str,
	) -> String {
		let mut request = format!(
			"{method} {path} HTTP/1.1\r\nConnection: close\r\nContent-Length: {}\r\n",
			body.len()
		);
		if let Some(host) = host {
			request.push_str(&format!("Host: {host}\r\n"));
		}
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

	fn delivery_id_of(arriving: &mpsc::Receiver<String>) -> String {
		let announced = arriving
			.recv_timeout(Duration::from_secs(5))
			.expect("a run was announced to the front");
		let announced: Value = serde_json::from_str(&announced).expect("the event is JSON");
		announced["payload"]["deliveryId"]
			.as_str()
			.expect("the payload names a delivery id")
			.to_owned()
	}

	fn refused() -> (u16, String) {
		(REFUSED.0.as_u16(), REFUSED.1.to_owned())
	}

	async fn runs_of(app: &App<MockRuntime>) -> i64 {
		let state = app.state::<db::DatabaseState>();
		let database = ready(&state).expect("the database opens");
		counted(database, "SELECT count(*) FROM routine_runs").await
	}

	async fn no_row_was_written(app: &App<MockRuntime>) {
		let state = app.state::<db::DatabaseState>();
		let database = ready(&state).expect("the database opens");
		assert_eq!(counted(database, "SELECT count(*) FROM routine_runs").await, 0);
		assert_eq!(counted(database, "SELECT count(*) FROM routine_dedupe_values").await, 0);
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

		no_row_was_written(&app).await;

		webhook.stop();
		cleaned(&app);
	}

	#[tokio::test]
	async fn a_body_longer_than_the_cap_is_answered_its_size_not_the_key_refusal() {
		let app = a_host("capped").await;
		let webhook = start(app.handle().clone());

		let long = "a".repeat(MAX_BODY_BYTES + 1);
		let answer = answered(address_of(&webhook), calling(Some(A_KEY), &long)).await;

		assert_eq!(answer, (TOO_LARGE.0.as_u16(), TOO_LARGE.1.to_owned()));
		no_row_was_written(&app).await;

		webhook.stop();
		cleaned(&app);
	}

	#[tokio::test]
	async fn a_call_naming_another_host_or_naming_none_is_refused_and_reads_no_routine() {
		let app = a_host("hosted").await;
		let webhook = start(app.handle().clone());
		let address = address_of(&webhook);

		for request in [
			reaching("POST", PATH, Some("attacker.example"), Some(A_KEY), "{}"),
			reaching("POST", PATH, Some("127.0.0.1.attacker.example"), Some(A_KEY), "{}"),
			reaching("POST", PATH, None, Some(A_KEY), "{}"),
		] {
			assert_eq!(answered(address, request).await, refused());
		}

		no_row_was_written(&app).await;

		webhook.stop();
		cleaned(&app);
	}

	#[tokio::test]
	async fn a_call_naming_the_loopback_with_or_without_the_bound_port_is_carried() {
		let app = a_host("loopback").await;
		let webhook = start(app.handle().clone());
		let address = address_of(&webhook);

		for host in ["localhost", "127.0.0.1", &format!("localhost:{}", address.port())] {
			let request = reaching("POST", PATH, Some(host), Some(A_KEY), "{}");
			let answer = answered(address, request).await;
			assert_eq!(answer, (ACCEPTED.0.as_u16(), ACCEPTED.1.to_owned()), "{host} was refused");
		}

		webhook.stop();
		cleaned(&app);
	}

	#[tokio::test]
	async fn another_method_and_another_path_write_no_row() {
		let app = a_host("elsewhere").await;
		let webhook = start(app.handle().clone());
		let address = address_of(&webhook);

		for request in [
			reaching("GET", PATH, Some("127.0.0.1"), Some(A_KEY), ""),
			reaching("POST", "/elsewhere", Some("127.0.0.1"), Some(A_KEY), "{}"),
		] {
			let (status, _) = answered(address, request).await;
			assert!(status >= 400, "the call was answered {status}");
		}

		no_row_was_written(&app).await;

		webhook.stop();
		cleaned(&app);
	}

	#[tokio::test]
	async fn the_call_beyond_the_cap_of_a_window_is_refused_and_the_one_after_it_passed_is_carried()
	{
		let app = a_host("flooded").await;
		let clock = Ticking::at(NOON);
		let webhook = started(app.handle().clone(), clock.clone());
		let address = address_of(&webhook);
		for _ in 0..CALLS_PER_WINDOW {
			let answer = answered(address, calling(Some(A_KEY), "{}")).await;
			assert_eq!(answer, (ACCEPTED.0.as_u16(), ACCEPTED.1.to_owned()));
		}
		let carried_runs = runs_of(&app).await;

		let flooded = answered(address, calling(Some(A_KEY), "{}")).await;

		assert_eq!(flooded, (FLOODED.0.as_u16(), FLOODED.1.to_owned()));
		assert_eq!(runs_of(&app).await, carried_runs, "the refused call wrote a row");

		clock.moved_by(WINDOW_MS);

		let answer = answered(address, calling(Some(A_KEY), "{}")).await;
		assert_eq!(answer, (ACCEPTED.0.as_u16(), ACCEPTED.1.to_owned()));
		assert_eq!(runs_of(&app).await, carried_runs + 1);

		webhook.stop();
		cleaned(&app);
	}

	#[tokio::test]
	async fn a_flood_carrying_a_key_no_routine_holds_stays_refused_and_is_never_answered_too_many()
	{
		let app = a_host("unheld").await;
		let clock = Ticking::at(NOON);
		let webhook = started(app.handle().clone(), clock.clone());
		let address = address_of(&webhook);

		for _ in 0..CALLS_PER_WINDOW + 10 {
			assert_eq!(
				answered(address, calling(Some("no routine holds this"), "{}")).await,
				refused()
			);
		}

		no_row_was_written(&app).await;

		webhook.stop();
		cleaned(&app);
	}

	#[tokio::test]
	async fn one_delivery_id_carried_twice_opens_one_run_and_two_delivery_ids_open_two() {
		let app = a_host("delivered").await;
		let webhook = start(app.handle().clone());
		let address = address_of(&webhook);

		for _ in 0..2 {
			let answer = answered(address, delivering(Some(A_KEY), "delivery-1", "{}")).await;
			assert_eq!(answer, (ACCEPTED.0.as_u16(), ACCEPTED.1.to_owned()));
		}

		assert_eq!(runs_of(&app).await, 1);

		for id in ["delivery-2", "delivery-3"] {
			assert_eq!(
				answered(address, delivering(Some(A_KEY), id, "{}")).await,
				(ACCEPTED.0.as_u16(), ACCEPTED.1.to_owned())
			);
		}

		assert_eq!(runs_of(&app).await, 3);

		webhook.stop();
		cleaned(&app);
	}

	#[tokio::test]
	async fn a_carried_delivery_id_reaches_the_payload_and_a_blank_one_is_generated() {
		let app = a_host("named").await;
		let (requested, arriving) = mpsc::channel();
		app.listen(RUN_REQUESTED_EVENT, move |event| {
			requested.send(event.payload().to_owned()).expect("the test is listening");
		});
		let webhook = start(app.handle().clone());
		let address = address_of(&webhook);

		answered(address, delivering(Some(A_KEY), "delivery-1", "{}")).await;
		assert_eq!(delivery_id_of(&arriving), "delivery-1");

		answered(address, delivering(Some(A_SECOND_KEY), "   ", "{}")).await;
		let generated = delivery_id_of(&arriving);
		assert_ne!(generated, "");
		assert_ne!(generated, "delivery-1");

		webhook.stop();
		cleaned(&app);
	}

	#[tokio::test]
	async fn a_delivery_id_longer_than_the_cap_is_answered_before_any_routine_is_read() {
		let app = a_host("overlong").await;
		let webhook = start(app.handle().clone());
		let address = address_of(&webhook);
		let long = "d".repeat(MAX_DELIVERY_ID_BYTES + 1);

		for key in [Some(A_KEY), Some("no routine holds this"), None] {
			let (status, message) = answered(address, delivering(key, &long, "{}")).await;
			assert_eq!(status, OVER_LONG_DELIVERY_ID.0.as_u16());
			assert!(
				message.contains(&MAX_DELIVERY_ID_BYTES.to_string()),
				"the answer named no cap: {message}"
			);
		}

		let answer =
			answered(address, delivering(Some(A_KEY), &"d".repeat(MAX_DELIVERY_ID_BYTES), "{}"))
				.await;
		assert_eq!(answer, (ACCEPTED.0.as_u16(), ACCEPTED.1.to_owned()));
		assert_eq!(runs_of(&app).await, 1);

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
