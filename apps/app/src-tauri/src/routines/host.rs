use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime, State};

use super::commands::{
	routine_create, routine_delete, routine_list, routine_row, routine_run_now, routine_update,
};
use super::contract::{Filter, FilterMatchMode, RoutineDraft, RoutineEdit, RoutineError};
use crate::agent::protocol::HostAnswer;
use crate::agent::session::{Answering, HostRequests};
use crate::conversations::commands::ready;
use crate::db;

const SOLO_THREAD: &str = "a routine lives in a conversation, not in a solo thread";

const NO_DATABASE: &str = "the store this session writes to is not open";

#[derive(Debug)]
pub struct RoutineHost<R: Runtime> {
	app: AppHandle<R>,
	conversation_id: String,
	bot_id: String,
}

impl<R: Runtime> Clone for RoutineHost<R> {
	fn clone(&self) -> Self {
		Self {
			app: self.app.clone(),
			conversation_id: self.conversation_id.clone(),
			bot_id: self.bot_id.clone(),
		}
	}
}

impl<R: Runtime> RoutineHost<R> {
	pub fn new(app: AppHandle<R>, conversation_id: String, bot_id: String) -> Self {
		Self { app, conversation_id, bot_id }
	}

	pub async fn answer(&self, request: Value) -> HostAnswer {
		self.served(request).await.map_err(as_value)
	}

	async fn served(&self, request: Value) -> Result<Value, RoutineError> {
		let Asked::Routine { operation, payload } = read(request)?;
		let state = self.state()?;
		let database = ready(&state)?;
		self.refuse_a_solo_thread(database).await?;
		match operation {
			Operation::List => {
				let _: Listed = read_payload(payload)?;
				as_value_of(routine_list(self.state()?, self.conversation_id.clone()).await?)
			}
			Operation::Create => {
				let asked: Created = read_payload(payload)?;
				as_value_of(
					routine_create(self.app.clone(), self.state()?, self.draft(asked)).await?,
				)
			}
			Operation::Update => {
				let asked: Edited = read_payload(payload)?;
				self.refuse_a_routine_it_does_not_own(database, &asked.id).await?;
				let id = asked.id.clone();
				as_value_of(routine_update(self.app.clone(), self.state()?, id, edit(asked)).await?)
			}
			Operation::RunNow => {
				let asked: Named = read_payload(payload)?;
				self.refuse_a_routine_it_does_not_own(database, &asked.id).await?;
				as_value_of(routine_run_now(self.app.clone(), self.state()?, asked.id).await?)
			}
			Operation::Delete => {
				let asked: Named = read_payload(payload)?;
				self.refuse_a_routine_it_does_not_own(database, &asked.id).await?;
				routine_delete(self.app.clone(), self.state()?, asked.id).await?;
				Ok(Value::Null)
			}
		}
	}

	fn draft(&self, asked: Created) -> RoutineDraft {
		RoutineDraft {
			conversation_id: self.conversation_id.clone(),
			bot_id: self.bot_id.clone(),
			title: asked.title,
			instruction: asked.instruction,
			trigger_source_id: asked.trigger_source_id,
			filter: asked.filter,
			trigger_config: asked.trigger_config,
		}
	}

	fn state(&self) -> Result<State<'_, db::DatabaseState>, RoutineError> {
		self.app
			.try_state::<db::DatabaseState>()
			.ok_or_else(|| RoutineError::Unexpected { detail: NO_DATABASE.to_owned() })
	}

	async fn refuse_a_solo_thread(&self, database: &db::Database) -> Result<(), RoutineError> {
		if database.conversations().is_topic(self.conversation_id.clone()).await? {
			return Ok(());
		}
		Err(RoutineError::NotInAConversation {
			conversation_id: self.conversation_id.clone(),
			reason: SOLO_THREAD.to_owned(),
		})
	}

	async fn refuse_a_routine_it_does_not_own(
		&self,
		database: &db::Database,
		id: &str,
	) -> Result<(), RoutineError> {
		let held = routine_row(database, id).await?;
		if held.conversation_id != self.conversation_id {
			return Err(RoutineError::RoutineOfAnotherConversation {
				id: held.id,
				conversation_id: self.conversation_id.clone(),
			});
		}
		if held.bot_id != self.bot_id {
			return Err(RoutineError::RoutineOfAnotherBot {
				id: held.id,
				bot_id: self.bot_id.clone(),
			});
		}
		Ok(())
	}
}

impl<R: Runtime> HostRequests for RoutineHost<R> {
	fn serve(&self, request: Value) -> Answering {
		let held = self.clone();
		Box::pin(async move { held.answer(request).await })
	}
}

#[derive(Debug, Deserialize)]
#[serde(tag = "subtype", rename_all = "camelCase")]
enum Asked {
	Routine {
		operation: Operation,
		#[serde(default = "nothing")]
		payload: Value,
	},
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
enum Operation {
	List,
	Create,
	Update,
	RunNow,
	Delete,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Listed {}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Created {
	title: String,
	instruction: String,
	trigger_source_id: String,
	#[serde(default = "every_event")]
	filter: Filter,
	#[serde(default = "nothing")]
	trigger_config: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Edited {
	id: String,
	title: String,
	instruction: String,
	filter: Filter,
	trigger_config: Value,
	is_enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Named {
	id: String,
}

fn edit(asked: Edited) -> RoutineEdit {
	RoutineEdit {
		title: asked.title,
		instruction: asked.instruction,
		filter: asked.filter,
		trigger_config: asked.trigger_config,
		is_enabled: asked.is_enabled,
	}
}

fn nothing() -> Value {
	Value::Object(serde_json::Map::new())
}

fn every_event() -> Filter {
	Filter { match_mode: FilterMatchMode::All, rows: Vec::new() }
}

fn read(request: Value) -> Result<Asked, RoutineError> {
	read_payload(request)
}

fn read_payload<T: serde::de::DeserializeOwned>(payload: Value) -> Result<T, RoutineError> {
	serde_json::from_value(payload)
		.map_err(|error| RoutineError::UnreadableRequest { detail: error.to_string() })
}

fn as_value_of<T: Serialize>(answer: T) -> Result<Value, RoutineError> {
	serde_json::to_value(answer)
		.map_err(|error| RoutineError::Unexpected { detail: error.to_string() })
}

fn as_value(error: RoutineError) -> Value {
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

	use super::super::commands::CHANGED_EVENT;
	use super::*;
	use crate::bundles;

	const A_SPACE: &str = "
		INSERT INTO bots (id, space_id, name, model, created_at)
			VALUES ('b1', 'personal', 'First', 'sonnet', 1), ('b2', 'personal', 'Second', 'sonnet', 1);
		INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
			VALUES ('c1', 'topic', 'personal', 'First', 1, 1),
				('c2', 'topic', 'personal', 'Second', 1, 1);
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('m1', 'main', 'Chat', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'assistant', 1, 0), ('c1', 'b2', 'assistant', 1, 1),
				('c2', 'b1', 'assistant', 1, 0), ('m1', 'b1', 'assistant', 1, 0);
	";

	async fn a_host(name: &str) -> App<MockRuntime> {
		let mut context = mock_context(noop_assets());
		context.config_mut().identifier =
			format!("com.opennest.routine-host-{name}-{}", std::process::id()).into();
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

	fn serving(app: &App<MockRuntime>, conversation_id: &str) -> RoutineHost<MockRuntime> {
		RoutineHost::new(app.handle().clone(), conversation_id.to_owned(), "b1".to_owned())
	}

	fn a_create(extra: Value) -> Value {
		let mut payload = json!({
			"title": "Nightly report",
			"instruction": "Read the shift log and report what changed.",
			"triggerSourceId": "schedule",
			"triggerConfig": { "expression": "0 * * * *" }
		});
		merged(&mut payload, extra);
		json!({ "subtype": "routine", "operation": "create", "payload": payload })
	}

	fn merged(payload: &mut Value, extra: Value) {
		let (Some(payload), Some(extra)) = (payload.as_object_mut(), extra.as_object()) else {
			return;
		};
		payload.extend(extra.clone());
	}

	fn naming(operation: &str, id: &str) -> Value {
		json!({ "subtype": "routine", "operation": operation, "payload": { "id": id } })
	}

	fn an_edit(id: &str) -> Value {
		json!({
			"subtype": "routine",
			"operation": "update",
			"payload": {
				"id": id,
				"title": "Renamed",
				"instruction": "Read the shift log and report what changed.",
				"filter": { "matchMode": "all", "rows": [] },
				"triggerConfig": { "expression": "0 * * * *" },
				"isEnabled": true
			}
		})
	}

	fn refusal(answer: HostAnswer) -> Value {
		answer.expect_err("the operation is refused")
	}

	async fn a_routine_of(
		app: &App<MockRuntime>,
		conversation_id: &str,
		bot_id: &str,
	) -> super::super::contract::Routine {
		routine_create(
			app.handle().clone(),
			app.state(),
			RoutineDraft {
				conversation_id: conversation_id.to_owned(),
				bot_id: bot_id.to_owned(),
				title: "Held".to_owned(),
				instruction: "Read the shift log.".to_owned(),
				trigger_source_id: "schedule".to_owned(),
				filter: every_event(),
				trigger_config: json!({ "expression": "0 * * * *" }),
			},
		)
		.await
		.expect("the routine is created")
	}

	async fn listed(
		app: &App<MockRuntime>,
		conversation_id: &str,
	) -> Vec<super::super::contract::Routine> {
		routine_list(app.state(), conversation_id.to_owned()).await.expect("the routines read")
	}

	#[tokio::test]
	async fn a_created_routine_is_owned_by_the_conversation_and_the_bot_of_the_session() {
		let app = a_host("created").await;

		let created = serving(&app, "c1").answer(a_create(json!({}))).await.expect("it is created");

		assert_eq!(created["conversationId"], json!("c1"));
		assert_eq!(created["botId"], json!("b1"));
		assert_eq!(created["title"], json!("Nightly report"));

		cleaned(&app);
	}

	#[tokio::test]
	async fn a_field_the_operation_does_not_declare_is_named_and_nothing_is_written() {
		let app = a_host("undeclared").await;

		let refused =
			refusal(serving(&app, "c1").answer(a_create(json!({ "conversationId": "c2" }))).await);

		assert_eq!(refused["kind"], json!("unreadableRequest"));
		assert!(
			refused["detail"].as_str().is_some_and(|detail| detail.contains("conversationId")),
			"got {refused}"
		);
		assert!(listed(&app, "c1").await.is_empty());

		cleaned(&app);
	}

	#[tokio::test]
	async fn list_answers_every_routine_of_the_conversation_whatever_bot_owns_it() {
		let app = a_host("listed").await;
		let mine = a_routine_of(&app, "c1", "b1").await;
		let theirs = a_routine_of(&app, "c1", "b2").await;
		a_routine_of(&app, "c2", "b1").await;

		let answered = serving(&app, "c1")
			.answer(json!({ "subtype": "routine", "operation": "list" }))
			.await
			.expect("the routines are listed");

		let ids: Vec<&str> = answered
			.as_array()
			.expect("a list")
			.iter()
			.filter_map(|row| row["id"].as_str())
			.collect();
		assert_eq!(ids.len(), 2, "got {answered}");
		assert!(ids.contains(&mine.id.as_str()) && ids.contains(&theirs.id.as_str()));

		cleaned(&app);
	}

	#[tokio::test]
	async fn a_routine_of_another_conversation_is_refused_and_nothing_is_written() {
		let app = a_host("foreign-conversation").await;
		let held = a_routine_of(&app, "c2", "b1").await;
		let host = serving(&app, "c1");

		for asked in [an_edit(&held.id), naming("runNow", &held.id), naming("delete", &held.id)] {
			let refused = refusal(host.answer(asked).await);

			assert_eq!(refused["kind"], json!("routineOfAnotherConversation"));
			assert_eq!(refused["id"], json!(held.id));
		}
		assert_eq!(listed(&app, "c2").await, vec![held]);

		cleaned(&app);
	}

	#[tokio::test]
	async fn a_routine_of_another_bot_is_refused_and_nothing_is_written() {
		let app = a_host("foreign-bot").await;
		let held = a_routine_of(&app, "c1", "b2").await;
		let host = serving(&app, "c1");

		for asked in [an_edit(&held.id), naming("runNow", &held.id), naming("delete", &held.id)] {
			let refused = refusal(host.answer(asked).await);

			assert_eq!(refused["kind"], json!("routineOfAnotherBot"));
			assert_eq!(refused["id"], json!(held.id));
		}
		assert_eq!(listed(&app, "c1").await, vec![held]);

		cleaned(&app);
	}

	#[tokio::test]
	async fn a_solo_thread_refuses_every_routine_operation_and_writes_nothing() {
		let app = a_host("solo-thread").await;
		let held = a_routine_of(&app, "c1", "b1").await;
		let host = serving(&app, "m1");

		let asked = [
			json!({ "subtype": "routine", "operation": "list" }),
			a_create(json!({})),
			an_edit(&held.id),
			naming("runNow", &held.id),
			naming("delete", &held.id),
		];
		for asked in asked {
			let refused = refusal(host.answer(asked).await);

			assert_eq!(refused["kind"], json!("notInAConversation"));
			assert_eq!(refused["conversationId"], json!("m1"));
			assert!(
				refused["reason"]
					.as_str()
					.is_some_and(|reason| reason.contains("lives in a conversation")),
				"got {refused}"
			);
		}
		assert_eq!(listed(&app, "c1").await, vec![held]);

		cleaned(&app);
	}

	#[tokio::test]
	async fn every_write_announces_the_conversation_whose_routines_changed() {
		let app = a_host("announced").await;
		let (changed, arriving) = mpsc::channel();
		app.listen(CHANGED_EVENT, move |event| {
			changed.send(event.payload().to_owned()).expect("the test is listening");
		});
		let host = serving(&app, "c1");

		let created = host.answer(a_create(json!({}))).await.expect("it is created");
		let id = created["id"].as_str().expect("the routine is named").to_owned();
		host.answer(an_edit(&id)).await.expect("it is updated");
		host.answer(naming("runNow", &id)).await.expect("it runs now");
		host.answer(naming("delete", &id)).await.expect("it is deleted");

		for write in ["create", "update", "run now", "delete"] {
			let announced = arriving
				.recv_timeout(Duration::from_secs(5))
				.unwrap_or_else(|_| panic!("{write} announced nothing"));
			let announced: Value = serde_json::from_str(&announced).expect("the event is JSON");
			assert_eq!(announced["conversationId"], json!("c1"), "on {write}");
		}

		cleaned(&app);
	}
}
