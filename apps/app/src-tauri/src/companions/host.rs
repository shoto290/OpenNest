use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

use super::contract::{
	CompanionCreated, CompanionError, CompanionInvited, CREATED_EVENT, FIRST_RUN_DONE_EVENT,
};
use crate::agent::protocol::HostAnswer;
use crate::agent::session::{Answering, HostRequests};
use crate::conversations::commands::{
	conversation_create_bot_from_draft, conversation_suggested_bots, ready, seat_participant,
};
use crate::conversations::contract::BotDraft;
use crate::db;
use crate::db::repositories::conversations::{Bot as StoredBot, TOPIC_KIND};

const SUBTYPE: &str = "companion";

const NO_DATABASE: &str = "the store this session writes to is not open";

#[derive(Debug)]
pub struct CompanionHost<R: Runtime> {
	app: AppHandle<R>,
	conversation_id: String,
	bot_id: String,
}

impl<R: Runtime> Clone for CompanionHost<R> {
	fn clone(&self) -> Self {
		Self {
			app: self.app.clone(),
			conversation_id: self.conversation_id.clone(),
			bot_id: self.bot_id.clone(),
		}
	}
}

impl<R: Runtime> CompanionHost<R> {
	pub fn new(app: AppHandle<R>, conversation_id: String, bot_id: String) -> Self {
		Self { app, conversation_id, bot_id }
	}

	pub async fn answer(&self, request: Value) -> HostAnswer {
		self.served(request).await.map_err(refused)
	}

	async fn served(&self, request: Value) -> Result<Value, CompanionError> {
		let Asked::Companion { operation, payload } = read(request)?;
		let state = self.state()?;
		let database = ready(&state)?;
		match operation {
			Operation::Suggestions => {
				let _: Bare = read(payload)?;
				answered(conversation_suggested_bots())
			}
			Operation::Create => {
				let asked: Drafted = read(payload)?;
				let space_id = self.space(database).await?;
				let created =
					conversation_create_bot_from_draft(self.app.clone(), state, asked.into(), space_id)
						.await?;
				let companion = CompanionCreated { id: created.id, name: created.name };
				self.announce(CREATED_EVENT, &companion)?;
				answered(companion)
			}
			Operation::FirstRunDone => {
				let _: Bare = read(payload)?;
				database.user().mark_first_run_done().await?;
				self.announce(FIRST_RUN_DONE_EVENT, ())?;
				Ok(Value::Null)
			}
			Operation::Invite => {
				let asked: Invited = read(payload)?;
				answered(self.invite(database, asked.companion).await?)
			}
		}
	}

	async fn invite(
		&self,
		database: &db::Database,
		companion: String,
	) -> Result<CompanionInvited, CompanionError> {
		if companion.trim().is_empty() {
			return Err(CompanionError::EmptyCompanionField);
		}
		self.seated_kind(database).await?;
		let space_id = self.space(database).await?;
		let roster = database.conversations().bots(Some(space_id)).await?;
		let invitee = picked(&roster, &companion)?;
		let joined = seat_participant(
			&self.app,
			database,
			self.conversation_id.clone(),
			invitee.id.clone(),
			Some(self.bot_id.clone()),
		)
		.await?;
		Ok(CompanionInvited {
			id: invitee.id.clone(),
			name: invitee.name.clone(),
			already_seated: joined.arrival.is_none(),
		})
	}

	async fn seated_kind(&self, database: &db::Database) -> Result<(), CompanionError> {
		match database.conversations().kind(self.conversation_id.clone()).await? {
			Some(kind) if kind == TOPIC_KIND => Ok(()),
			Some(kind) => Err(CompanionError::ConversationWithoutSeats {
				conversation_id: self.conversation_id.clone(),
				conversation_kind: kind,
			}),
			None => Err(CompanionError::ConversationWithoutSpace {
				conversation_id: self.conversation_id.clone(),
			}),
		}
	}

	async fn space(&self, database: &db::Database) -> Result<String, CompanionError> {
		database
			.conversations()
			.space(self.conversation_id.clone())
			.await?
			.ok_or_else(|| CompanionError::ConversationWithoutSpace {
				conversation_id: self.conversation_id.clone(),
			})
	}

	fn announce<T: Serialize + Clone>(
		&self,
		event: &str,
		payload: T,
	) -> Result<(), CompanionError> {
		self.app
			.emit(event, payload)
			.map_err(|error| CompanionError::Undeliverable { detail: error.to_string() })
	}

	fn state(&self) -> Result<State<'_, db::DatabaseState>, CompanionError> {
		self.app
			.try_state::<db::DatabaseState>()
			.ok_or_else(|| CompanionError::Unexpected { detail: NO_DATABASE.to_owned() })
	}
}

impl<R: Runtime> HostRequests for CompanionHost<R> {
	fn subtype(&self) -> &'static str {
		SUBTYPE
	}

	fn serve(&self, request: Value) -> Answering {
		let held = self.clone();
		Box::pin(async move { held.answer(request).await })
	}
}

#[derive(Debug, Deserialize)]
#[serde(tag = "subtype", rename_all = "camelCase")]
enum Asked {
	Companion {
		operation: Operation,
		#[serde(default = "nothing")]
		payload: Value,
	},
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
enum Operation {
	Suggestions,
	Create,
	FirstRunDone,
	Invite,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Bare {}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Invited {
	companion: String,
}

fn picked<'a>(roster: &'a [StoredBot], companion: &str) -> Result<&'a StoredBot, CompanionError> {
	let wanted = companion.trim();
	if let Some(held) = roster.iter().find(|bot| bot.id == wanted) {
		return Ok(held);
	}
	let named: Vec<&StoredBot> = roster
		.iter()
		.filter(|bot| bot.name.trim().to_lowercase() == wanted.to_lowercase())
		.collect();
	match named.as_slice() {
		[held] => Ok(held),
		[] => Err(CompanionError::UnknownCompanion { companion: companion.to_owned() }),
		_ => Err(CompanionError::AmbiguousCompanion {
			companion: companion.to_owned(),
			ids: named.iter().map(|bot| bot.id.clone()).collect(),
		}),
	}
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Drafted {
	name: String,
	job: String,
	description: String,
}

impl From<Drafted> for BotDraft {
	fn from(asked: Drafted) -> Self {
		BotDraft { name: asked.name, job: asked.job, description: asked.description }
	}
}

fn nothing() -> Value {
	Value::Object(serde_json::Map::new())
}

fn read<T: serde::de::DeserializeOwned>(payload: Value) -> Result<T, CompanionError> {
	serde_json::from_value(payload)
		.map_err(|error| CompanionError::UnreadableRequest { detail: error.to_string() })
}

fn answered<T: Serialize>(answer: T) -> Result<Value, CompanionError> {
	serde_json::to_value(answer)
		.map_err(|error| CompanionError::Unexpected { detail: error.to_string() })
}

fn refused(error: CompanionError) -> Value {
	serde_json::to_value(&error).unwrap_or_else(
		|failure| serde_json::json!({ "kind": "unexpected", "detail": failure.to_string() }),
	)
}

#[cfg(test)]
mod tests {
	use std::fs;
	use std::sync::mpsc;
	use std::time::Duration;

	use serde_json::json;
	use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
	use tauri::{App, Listener as _, Manager as _};

	use super::*;
	use crate::bundles;
	use crate::conversations::contract::COMPANION_ARRIVED_EVENT;
	use crate::db::repositories::conversations::DEFAULT_BOT_MODEL;

	const A_SPACE: &str = "
		INSERT INTO bots (id, name, model, created_at) VALUES ('b1', 'Shoto', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b1', 'personal', 1);
		INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
			VALUES ('c1', 'main', 'personal', 'Chat', 1, 1);
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('nowhere', 'main', 'Chat', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'assistant', 1, 0), ('nowhere', 'b1', 'assistant', 1, 0);
	";

	const A_ROOM: &str = "
		INSERT INTO spaces (id, name, colour, position, created_at)
			VALUES ('work', 'Work', 'blue', 1, 1);
		INSERT INTO bots (id, name, model, created_at) VALUES
			('b2', 'Ada', 'sonnet', 1), ('b3', 'Rex', 'sonnet', 1),
			('b4', ' rex ', 'sonnet', 1), ('b5', 'Kai', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES
			('b2', 'personal', 1), ('b3', 'personal', 1), ('b4', 'personal', 1), ('b5', 'work', 1);
		INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at) VALUES
			('room', 'topic', 'personal', 'Plans', 1, 1),
			('unled', 'topic', 'personal', 'Plans', 1, 1);
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('drifting', 'topic', 'Plans', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('room', 'b1', 'lead', 1, 0), ('room', 'b2', 'assistant', 1, 1),
				('unled', 'b1', 'assistant', 1, 0), ('drifting', 'b1', 'lead', 1, 0);
	";

	type Standing = (Vec<(String, String, String, i64, Option<i64>)>, i64);

	async fn a_host(name: &str) -> App<MockRuntime> {
		let mut context = mock_context(noop_assets());
		context.config_mut().identifier =
			format!("com.kiroshi.companion-host-{name}-{}", std::process::id()).into();
		let app = mock_builder().build(context).expect("the app builds");
		if let Ok(dir) = app.path().app_data_dir() {
			let _ = fs::remove_dir_all(&dir);
		}
		app.manage(db::bootstrap(app.handle()));
		let system = bundles::system::path(app.handle()).expect("the system bundle is named");
		bundles::system::write(&system).expect("the system bundle lands");
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.call_mut(|connection| Ok(connection.execute_batch(A_SPACE)?))
			.await
			.expect("the space is planted");
		app
	}

	fn cleaned(app: &App<MockRuntime>) {
		if let Ok(dir) = app.path().app_data_dir() {
			let _ = fs::remove_dir_all(&dir);
		}
	}

	fn serving(app: &App<MockRuntime>, conversation_id: &str) -> CompanionHost<MockRuntime> {
		CompanionHost::new(app.handle().clone(), conversation_id.to_owned(), "b1".to_owned())
	}

	async fn a_room(name: &str) -> App<MockRuntime> {
		let app = a_host(name).await;
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.call_mut(|connection| Ok(connection.execute_batch(A_ROOM)?))
			.await
			.expect("the room is planted");
		app
	}

	fn an_invite(payload: Value) -> Value {
		json!({ "subtype": "companion", "operation": "invite", "payload": payload })
	}

	async fn standing(app: &App<MockRuntime>) -> Standing {
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.call(|connection| {
				let mut seats = connection.prepare(
					"SELECT conversation_id, bot_id, role, join_seq, left_at
						FROM conversation_participants ORDER BY conversation_id, bot_id",
				)?;
				let held = seats
					.query_map([], |row| {
						Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
					})?
					.collect::<rusqlite::Result<Vec<_>>>()?;
				let arrivals =
					connection.query_row("SELECT count(*) FROM conversation_arrivals", [], |row| {
						row.get(0)
					})?;
				Ok((held, arrivals))
			})
			.await
			.expect("the seats read")
	}

	async fn role_of(app: &App<MockRuntime>, conversation_id: &str, bot_id: &str) -> String {
		let (seats, _) = standing(app).await;
		seats
			.into_iter()
			.find(|seat| seat.0 == conversation_id && seat.1 == bot_id)
			.map(|seat| seat.2)
			.expect("the companion holds a seat")
	}

	async fn refused_and_untouched(
		app: &App<MockRuntime>,
		conversation_id: &str,
		payload: Value,
	) -> Value {
		let before = standing(app).await;
		let refused = refusal(serving(app, conversation_id).answer(an_invite(payload)).await);
		assert_eq!(standing(app).await, before, "a refused invitation moved a seat or an arrival");
		refused
	}

	fn asking(operation: &str) -> Value {
		json!({ "subtype": "companion", "operation": operation })
	}

	fn a_create(extra: Value) -> Value {
		let mut payload = json!({
			"name": "Quill",
			"job": "a writing partner",
			"description": "Help me draft, tighten and polish what I write."
		});
		if let (Some(payload), Some(extra)) = (payload.as_object_mut(), extra.as_object()) {
			payload.extend(extra.clone());
		}
		json!({ "subtype": "companion", "operation": "create", "payload": payload })
	}

	fn refusal(answer: HostAnswer) -> Value {
		answer.expect_err("the operation is refused")
	}

	async fn worn(app: &App<MockRuntime>) -> Vec<StoredBot> {
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.conversations()
			.bots(Some("personal".to_owned()))
			.await
			.expect("the roster reads")
	}

	async fn is_first_run_done(app: &App<MockRuntime>) -> bool {
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.user()
			.preferences()
			.await
			.expect("the preferences read")
			.first_run_done
	}

	fn heard(app: &App<MockRuntime>, event: &str) -> mpsc::Receiver<String> {
		let (announced, arriving) = mpsc::channel();
		app.listen(event, move |event| {
			announced.send(event.payload().to_owned()).expect("the test is listening");
		});
		arriving
	}

	fn announced(arriving: &mpsc::Receiver<String>) -> Value {
		let payload =
			arriving.recv_timeout(Duration::from_secs(5)).expect("the event is announced");
		serde_json::from_str(&payload).expect("the event is JSON")
	}

	#[tokio::test]
	async fn suggestions_answer_what_the_screen_offers_entry_for_entry_in_the_same_order() {
		let app = a_host("suggestions").await;

		let answered =
			serving(&app, "c1").answer(asking("suggestions")).await.expect("they are answered");

		assert_eq!(
			answered,
			serde_json::to_value(conversation_suggested_bots()).expect("the list serialises")
		);

		cleaned(&app);
	}

	#[tokio::test]
	async fn a_created_companion_lands_in_the_space_of_the_conversation_drafted_like_the_screen() {
		let app = a_host("created").await;

		let created = serving(&app, "c1").answer(a_create(json!({}))).await.expect("it is created");

		assert_eq!(created["name"], json!("Quill"));
		let id = created["id"].as_str().expect("the companion is named");
		let planted =
			worn(&app).await.into_iter().find(|bot| bot.id == id).expect("it joined the space");
		assert_eq!(planted.title, "a writing partner");
		assert_eq!(planted.instructions, "Help me draft, tighten and polish what I write.");
		assert_eq!(planted.model, DEFAULT_BOT_MODEL);
		assert_eq!(planted.permissions, Some(bundles::BotPermissions::default().accepted()));
		assert!(planted.avatar_blot.is_some());
		let bundled = bundles::root(app.handle())
			.and_then(|root| bundles::generated(&root, id))
			.expect("the bundle is written");
		assert_eq!(bundled.output_style, bundles::DEFAULT_OUTPUT_STYLE);

		cleaned(&app);
	}

	#[tokio::test]
	async fn a_name_blank_once_trimmed_is_refused_and_nothing_is_created() {
		let app = a_host("nameless").await;

		let refused =
			refusal(serving(&app, "c1").answer(a_create(json!({ "name": "   " }))).await);

		assert_eq!(refused["kind"], json!("namelessCompanion"));
		assert_eq!(worn(&app).await.len(), 1);

		cleaned(&app);
	}

	#[tokio::test]
	async fn a_conversation_belonging_to_no_space_is_refused_and_nothing_is_created() {
		let app = a_host("spaceless").await;

		let refused = refusal(serving(&app, "nowhere").answer(a_create(json!({}))).await);

		assert_eq!(refused["kind"], json!("conversationWithoutSpace"));
		assert_eq!(refused["conversationId"], json!("nowhere"));
		assert_eq!(worn(&app).await.len(), 1);

		cleaned(&app);
	}

	#[tokio::test]
	async fn a_field_the_operation_does_not_declare_is_named_and_nothing_is_created() {
		let app = a_host("undeclared").await;

		let refused =
			refusal(serving(&app, "c1").answer(a_create(json!({ "spaceId": "work" }))).await);

		assert_eq!(refused["kind"], json!("unreadableRequest"));
		assert!(
			refused["detail"].as_str().is_some_and(|detail| detail.contains("spaceId")),
			"got {refused}"
		);
		assert_eq!(worn(&app).await.len(), 1);

		cleaned(&app);
	}

	#[tokio::test]
	async fn creating_a_companion_announces_the_id_it_created() {
		let app = a_host("announced").await;
		let arriving = heard(&app, CREATED_EVENT);

		let created = serving(&app, "c1").answer(a_create(json!({}))).await.expect("it is created");

		assert_eq!(announced(&arriving)["id"], created["id"]);

		cleaned(&app);
	}

	#[tokio::test]
	async fn the_first_run_is_recorded_under_the_setting_the_app_reads_and_announced() {
		let app = a_host("first-run").await;
		let arriving = heard(&app, FIRST_RUN_DONE_EVENT);
		assert!(!is_first_run_done(&app).await);

		serving(&app, "c1").answer(asking("firstRunDone")).await.expect("it is recorded");

		assert!(is_first_run_done(&app).await);
		assert_eq!(announced(&arriving), Value::Null);

		cleaned(&app);
	}

	#[tokio::test]
	async fn a_first_run_already_recorded_is_answered_again_and_stays_recorded() {
		let app = a_host("first-run-twice").await;
		let host = serving(&app, "c1");
		host.answer(asking("firstRunDone")).await.expect("it is recorded");

		let again = host.answer(asking("firstRunDone")).await.expect("it is answered again");

		assert_eq!(again, Value::Null);
		assert!(is_first_run_done(&app).await);

		cleaned(&app);
	}

	#[tokio::test]
	async fn a_companion_invited_by_id_is_seated_with_the_caller_recorded_and_announced_as_inviter()
	{
		let app = a_room("invite-by-id").await;
		let arriving = heard(&app, COMPANION_ARRIVED_EVENT);

		let invited = serving(&app, "room")
			.answer(an_invite(json!({ "companion": "b3" })))
			.await
			.expect("it is invited");

		assert_eq!(invited, json!({ "id": "b3", "name": "Rex", "alreadySeated": false }));
		assert_eq!(role_of(&app, "room", "b3").await, "assistant");
		let arrival = announced(&arriving);
		assert_eq!(arrival["botId"], json!("b3"));
		assert_eq!(arrival["conversationId"], json!("room"));
		assert_eq!(arrival["invitedByBotId"], json!("b1"));
		assert_eq!(standing(&app).await.1, 1);

		cleaned(&app);
	}

	#[tokio::test]
	async fn a_name_trimmed_and_compared_without_case_seats_the_one_companion_wearing_it() {
		let app = a_room("invite-by-name").await;

		let ada = serving(&app, "unled")
			.answer(an_invite(json!({ "companion": "  aDA " })))
			.await
			.expect("it is invited");

		assert_eq!(ada, json!({ "id": "b2", "name": "Ada", "alreadySeated": false }));
		assert_eq!(role_of(&app, "unled", "b2").await, "lead");

		cleaned(&app);
	}

	#[tokio::test]
	async fn a_companion_seated_where_no_seat_holds_the_lead_takes_it() {
		let app = a_room("invite-lead").await;

		serving(&app, "unled")
			.answer(an_invite(json!({ "companion": "b2" })))
			.await
			.expect("it is invited");

		assert_eq!(role_of(&app, "unled", "b2").await, "lead");
		assert_eq!(role_of(&app, "unled", "b1").await, "assistant");

		cleaned(&app);
	}

	#[tokio::test]
	async fn a_companion_already_seated_is_served_and_no_seat_or_arrival_moves() {
		let app = a_room("invite-seated").await;
		let before = standing(&app).await;

		let lead = serving(&app, "room")
			.answer(an_invite(json!({ "companion": "shoto" })))
			.await
			.expect("it is served");
		let mate = serving(&app, "room")
			.answer(an_invite(json!({ "companion": "b2" })))
			.await
			.expect("it is served");

		assert_eq!(lead, json!({ "id": "b1", "name": "Shoto", "alreadySeated": true }));
		assert_eq!(mate, json!({ "id": "b2", "name": "Ada", "alreadySeated": true }));
		assert_eq!(standing(&app).await, before);

		cleaned(&app);
	}

	#[tokio::test]
	async fn an_empty_field_is_refused_as_empty() {
		let app = a_room("invite-empty").await;

		let refused = refused_and_untouched(&app, "room", json!({ "companion": "   " })).await;

		assert_eq!(refused, json!({ "kind": "emptyCompanionField" }));

		cleaned(&app);
	}

	#[tokio::test]
	async fn a_name_worn_by_several_companions_is_refused_with_every_id_it_matched() {
		let app = a_room("invite-ambiguous").await;

		let refused = refused_and_untouched(&app, "room", json!({ "companion": "REX" })).await;

		assert_eq!(refused["kind"], json!("ambiguousCompanion"));
		assert_eq!(refused["companion"], json!("REX"));
		let mut ids: Vec<String> =
			serde_json::from_value(refused["ids"].clone()).expect("the ids are listed");
		ids.sort();
		assert_eq!(ids, vec!["b3".to_owned(), "b4".to_owned()]);

		cleaned(&app);
	}

	#[tokio::test]
	async fn a_companion_outside_the_space_is_refused_by_id_and_by_name() {
		let app = a_room("invite-unknown").await;

		for companion in ["b5", "Kai", "Nobody"] {
			let refused =
				refused_and_untouched(&app, "room", json!({ "companion": companion })).await;

			assert_eq!(refused, json!({ "kind": "unknownCompanion", "companion": companion }));
		}

		cleaned(&app);
	}

	#[tokio::test]
	async fn a_conversation_that_carries_no_seats_is_refused_with_its_kind() {
		let app = a_room("invite-main").await;

		let refused = refused_and_untouched(&app, "c1", json!({ "companion": "b2" })).await;

		assert_eq!(
			refused,
			json!({
				"kind": "conversationWithoutSeats",
				"conversationId": "c1",
				"conversationKind": "main"
			})
		);

		cleaned(&app);
	}

	#[tokio::test]
	async fn an_invitation_into_a_conversation_belonging_to_no_space_is_refused() {
		let app = a_room("invite-spaceless").await;

		let refused = refused_and_untouched(&app, "drifting", json!({ "companion": "b2" })).await;

		assert_eq!(
			refused,
			json!({ "kind": "conversationWithoutSpace", "conversationId": "drifting" })
		);

		cleaned(&app);
	}

	#[tokio::test]
	async fn an_invitation_carrying_a_field_it_does_not_declare_is_refused_naming_it() {
		let app = a_room("invite-undeclared").await;

		let refused = refused_and_untouched(
			&app,
			"room",
			json!({ "companion": "b3", "conversationId": "unled" }),
		)
		.await;

		assert_eq!(refused["kind"], json!("unreadableRequest"));
		assert!(
			refused["detail"].as_str().is_some_and(|detail| detail.contains("conversationId")),
			"got {refused}"
		);

		cleaned(&app);
	}
}
