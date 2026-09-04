use axum::extract::rejection::StringRejection;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use serde_json::{json, Map, Value};
use tauri::{Manager, Runtime};
use uuid::Uuid;

use super::contract::{MissionEntry, MissionError, MissionEventKind};
use crate::conversations::commands::ready;
use crate::db;
use crate::routines::webhook::{self, Calls, DeliveryId};

pub const PATH: &str = "/missions/call";

pub const SOURCE: &str = "agent-hook";

const ACCEPTED: (StatusCode, &str) = (StatusCode::ACCEPTED, "the mission was told");

const REFUSED: (StatusCode, &str) = (StatusCode::NOT_FOUND, "no mission answers this call");

const UNREADABLE: (StatusCode, &str) =
	(StatusCode::BAD_REQUEST, "the call carried no readable payload");

const TOO_LARGE: (StatusCode, &str) =
	(StatusCode::PAYLOAD_TOO_LARGE, "the call carried more than the cap");

const FLOODED: (StatusCode, &str) =
	(StatusCode::TOO_MANY_REQUESTS, "the mission was called too often");

const REFUSED_DELIVERY_ID: (StatusCode, &str) =
	(StatusCode::BAD_REQUEST, "the delivery id is unreadable or carried more than 200 bytes");

const FAILED: (StatusCode, &str) = (StatusCode::INTERNAL_SERVER_ERROR, "the call was not carried");

pub(crate) async fn called<R: Runtime>(
	State(calls): State<Calls<R>>,
	headers: HeaderMap,
	body: Result<String, StringRejection>,
) -> (StatusCode, &'static str) {
	if !webhook::named_here(&headers) {
		return REFUSED;
	}
	let delivery_id = match webhook::delivery_id(&headers) {
		DeliveryId::Refused => return REFUSED_DELIVERY_ID,
		DeliveryId::Carried(held) => held,
		DeliveryId::Generated => Uuid::new_v4().to_string(),
	};
	let body = match body {
		Ok(body) => body,
		Err(rejection) => return unread(rejection),
	};
	match carried(&calls, &headers, delivery_id, body).await {
		Ok(answer) => answer,
		Err(failure) => {
			eprintln!("a local hook call reached no mission: {failure:?}");
			FAILED
		}
	}
}

async fn carried<R: Runtime>(
	calls: &Calls<R>,
	headers: &HeaderMap,
	delivery_id: String,
	body: String,
) -> Result<(StatusCode, &'static str), MissionError> {
	let Some(key) = webhook::presented(headers) else {
		return Ok(REFUSED);
	};
	let state = calls.app.state::<db::DatabaseState>();
	let database = ready(&state)?;
	let Some(mission) = database.missions().armed_on_key(key).await? else {
		return Ok(REFUSED);
	};
	if mission.closed_at.is_some() {
		return Ok(REFUSED);
	}
	if !calls.limit.admits(&mission.id, calls.clock.as_ref()).await {
		return Ok(FLOODED);
	}
	let Some(payload) = payload(&body) else {
		return Ok(UNREADABLE);
	};
	let entry =
		MissionEntry { kind: MissionEventKind::AgentAsked, source: SOURCE.to_owned(), payload };
	match database.missions().append_delivery(mission.id, entry, delivery_id).await {
		Ok(_) => Ok(ACCEPTED),
		Err(MissionError::UnknownMission { .. } | MissionError::MissionAlreadyClosed { .. }) => {
			Ok(REFUSED)
		}
		Err(failure) => Err(failure),
	}
}

fn unread(rejection: StringRejection) -> (StatusCode, &'static str) {
	match rejection.into_response().status() {
		StatusCode::PAYLOAD_TOO_LARGE => TOO_LARGE,
		_ => UNREADABLE,
	}
}

fn payload(body: &str) -> Option<Value> {
	let held: Value = serde_json::from_str(body).ok()?;
	let held = held.as_object()?;
	let mut payload = Map::new();
	payload.insert("event".to_owned(), json!(text(held, "event")));
	payload.insert("branch".to_owned(), json!(text(held, "branch")));
	payload.insert("cwd".to_owned(), json!(text(held, "cwd")));
	let message = text(held, "message");
	if !message.is_empty() {
		payload.insert("message".to_owned(), json!(message));
	}
	Some(Value::Object(payload))
}

fn text(held: &Map<String, Value>, name: &str) -> String {
	held.get(name).and_then(Value::as_str).unwrap_or_default().to_owned()
}

#[cfg(test)]
mod tests {
	use std::fs;
	use std::net::SocketAddr;
	use std::sync::atomic::{AtomicI64, Ordering};
	use std::sync::Arc;

	use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
	use tauri::App;
	use tokio::io::{AsyncReadExt, AsyncWriteExt};
	use tokio::net::TcpStream;

	use super::super::contract::{
		Mission, MissionDraft, MissionEvent, MissionNote, MissionWatch, Ticket,
	};
	use super::*;
	use crate::routines::core::Clock;
	use crate::routines::rate_limit::{CALLS_PER_WINDOW, WINDOW_MS};
	use crate::routines::webhook::{started, Webhook, DELIVERY_ID_HEADER, HEADER};

	const NOON: i64 = 1_800_000_000_000;

	const A_KEY: &str = "the-mission-delivery-key";

	const A_BODY: &str = r#"{"event":"Notification","sessionId":"s1","cwd":"/tmp/workspace",
		"branch":"feature/ope-27","excerpt":"","message":"Claude needs your permission"}"#;

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

	async fn a_host(name: &str) -> App<MockRuntime> {
		let mut context = mock_context(noop_assets());
		context.config_mut().identifier =
			format!("com.opennest.mission-call-{name}-{}", std::process::id()).into();
		let app = mock_builder().build(context).expect("the app builds");
		cleaned(&app);
		app.manage(db::bootstrap(app.handle()));
		{
			let state = app.state::<db::DatabaseState>();
			ready(&state)
				.expect("the database opens")
				.call_mut(|connection| Ok(connection.execute_batch(A_PARTICIPANT)?))
				.await
				.expect("the participant is planted");
		}
		app
	}

	fn cleaned(app: &App<MockRuntime>) {
		if let Ok(dir) = app.path().app_data_dir() {
			let _ = fs::remove_dir_all(&dir);
		}
	}

	async fn an_armed_mission(app: &App<MockRuntime>, key: &str) -> Mission {
		let state = app.state::<db::DatabaseState>();
		let database = ready(&state).expect("the database opens");
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
		let watch = MissionWatch {
			branch: "feature/ope-27".to_owned(),
			repository: "shoto290/OpenNest".to_owned(),
			workspace_path: None,
		};
		let (armed, _) = database
			.missions()
			.arm(opened.id.clone(), watch, key.to_owned())
			.await
			.expect("the mission is armed");
		armed
	}

	async fn closed(app: &App<MockRuntime>, mission_id: &str) {
		let state = app.state::<db::DatabaseState>();
		ready(&state)
			.expect("the database opens")
			.missions()
			.append(
				mission_id.to_owned(),
				MissionEntry::of(
					MissionEventKind::Closed,
					MissionNote { source: "human".to_owned(), payload: json!({}) },
				),
			)
			.await
			.expect("the mission closes");
	}

	async fn events_of(app: &App<MockRuntime>, mission_id: &str) -> Vec<MissionEvent> {
		let state = app.state::<db::DatabaseState>();
		ready(&state)
			.expect("the database opens")
			.missions()
			.detail(mission_id.to_owned())
			.await
			.expect("the mission reads")
			.events
	}

	async fn hook_events_of(app: &App<MockRuntime>, mission_id: &str) -> Vec<MissionEvent> {
		events_of(app, mission_id)
			.await
			.into_iter()
			.filter(|event| event.source == SOURCE)
			.collect()
	}

	fn calling(key: Option<&str>, delivery_id: Option<&str>, body: &str) -> String {
		let mut request = format!(
			"POST {PATH} HTTP/1.1\r\nConnection: close\r\nHost: 127.0.0.1\r\n\
				Content-Length: {}\r\n",
			body.len()
		);
		if let Some(key) = key {
			request.push_str(&format!("{HEADER}: {key}\r\n"));
		}
		if let Some(delivery_id) = delivery_id {
			request.push_str(&format!("{DELIVERY_ID_HEADER}: {delivery_id}\r\n"));
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

	fn answer(held: (StatusCode, &str)) -> (u16, String) {
		(held.0.as_u16(), held.1.to_owned())
	}

	fn listening(app: &App<MockRuntime>, clock: Arc<Ticking>) -> Webhook {
		started(app.handle().clone(), clock)
	}

	#[tokio::test]
	async fn a_call_carrying_the_key_of_an_armed_mission_appends_one_agent_asked_event() {
		let app = a_host("told").await;
		let mission = an_armed_mission(&app, A_KEY).await;
		let webhook = listening(&app, Ticking::at(NOON));

		let held = answered(webhook.address(), calling(Some(A_KEY), None, A_BODY)).await;

		assert_eq!(held, answer(ACCEPTED));
		let appended = hook_events_of(&app, &mission.id).await;
		assert_eq!(appended.len(), 1, "got {appended:?}");
		assert_eq!(appended[0].kind, MissionEventKind::AgentAsked);
		assert_eq!(
			appended[0].payload,
			json!({
				"event": "Notification",
				"branch": "feature/ope-27",
				"cwd": "/tmp/workspace",
				"message": "Claude needs your permission",
			}),
		);

		webhook.stop();
		cleaned(&app);
	}

	#[tokio::test]
	async fn a_call_carrying_no_message_leaves_the_message_out_of_the_payload() {
		let app = a_host("silent").await;
		let mission = an_armed_mission(&app, A_KEY).await;
		let webhook = listening(&app, Ticking::at(NOON));
		let body = r#"{"event":"Stop","cwd":"/tmp/workspace","branch":"main","message":""}"#;

		let held = answered(webhook.address(), calling(Some(A_KEY), None, body)).await;

		assert_eq!(held, answer(ACCEPTED));
		assert_eq!(
			hook_events_of(&app, &mission.id).await[0].payload,
			json!({ "event": "Stop", "branch": "main", "cwd": "/tmp/workspace" }),
		);

		webhook.stop();
		cleaned(&app);
	}

	#[tokio::test]
	async fn a_call_no_mission_holds_the_key_of_appends_nothing() {
		let app = a_host("unheld").await;
		let mission = an_armed_mission(&app, A_KEY).await;
		let webhook = listening(&app, Ticking::at(NOON));

		for key in [None, Some("no mission holds this")] {
			assert_eq!(
				answered(webhook.address(), calling(key, None, A_BODY)).await,
				answer(REFUSED),
			);
		}

		assert!(hook_events_of(&app, &mission.id).await.is_empty());

		webhook.stop();
		cleaned(&app);
	}

	#[tokio::test]
	async fn a_call_naming_a_closed_mission_is_refused_and_appends_nothing() {
		let app = a_host("shut").await;
		let mission = an_armed_mission(&app, A_KEY).await;
		closed(&app, &mission.id).await;
		let webhook = listening(&app, Ticking::at(NOON));

		let held = answered(webhook.address(), calling(Some(A_KEY), None, A_BODY)).await;

		assert_eq!(held, answer(REFUSED));
		assert!(hook_events_of(&app, &mission.id).await.is_empty());

		webhook.stop();
		cleaned(&app);
	}

	#[tokio::test]
	async fn one_delivery_id_carried_twice_appends_one_event_and_two_append_two() {
		let app = a_host("delivered").await;
		let mission = an_armed_mission(&app, A_KEY).await;
		let webhook = listening(&app, Ticking::at(NOON));

		for _ in 0..2 {
			let held =
				answered(webhook.address(), calling(Some(A_KEY), Some("delivery-1"), A_BODY)).await;
			assert_eq!(held, answer(ACCEPTED));
		}
		assert_eq!(hook_events_of(&app, &mission.id).await.len(), 1);

		answered(webhook.address(), calling(Some(A_KEY), Some("delivery-2"), A_BODY)).await;

		assert_eq!(hook_events_of(&app, &mission.id).await.len(), 2);

		webhook.stop();
		cleaned(&app);
	}

	#[tokio::test]
	async fn the_call_beyond_the_cap_of_a_window_is_refused_and_the_one_after_it_passed_is_carried()
	{
		let app = a_host("flooded").await;
		let mission = an_armed_mission(&app, A_KEY).await;
		let clock = Ticking::at(NOON);
		let webhook = listening(&app, clock.clone());
		for call in 0..CALLS_PER_WINDOW {
			let request = calling(Some(A_KEY), Some(&format!("delivery-{call}")), A_BODY);
			assert_eq!(answered(webhook.address(), request).await, answer(ACCEPTED));
		}

		let refused =
			answered(webhook.address(), calling(Some(A_KEY), Some("delivery-over"), A_BODY)).await;

		assert_eq!(refused, answer(FLOODED));
		assert_eq!(hook_events_of(&app, &mission.id).await.len(), CALLS_PER_WINDOW);

		clock.moved_by(WINDOW_MS);
		let carried =
			answered(webhook.address(), calling(Some(A_KEY), Some("delivery-after"), A_BODY)).await;

		assert_eq!(carried, answer(ACCEPTED));
		assert_eq!(hook_events_of(&app, &mission.id).await.len(), CALLS_PER_WINDOW + 1);

		webhook.stop();
		cleaned(&app);
	}

	#[tokio::test]
	async fn a_call_naming_another_host_or_carrying_a_body_beyond_the_cap_appends_nothing() {
		let app = a_host("guarded").await;
		let mission = an_armed_mission(&app, A_KEY).await;
		let webhook = listening(&app, Ticking::at(NOON));
		let long = "a".repeat(crate::routines::webhook::MAX_BODY_BYTES + 1);

		let elsewhere =
			calling(Some(A_KEY), None, A_BODY).replace("Host: 127.0.0.1", "Host: attacker.example");
		assert_eq!(answered(webhook.address(), elsewhere).await, answer(REFUSED));
		assert_eq!(
			answered(webhook.address(), calling(Some(A_KEY), None, &long)).await,
			answer(TOO_LARGE),
		);

		assert!(hook_events_of(&app, &mission.id).await.is_empty());

		webhook.stop();
		cleaned(&app);
	}
}
