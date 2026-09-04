use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime, State};

use super::commands::{mission_close, mission_escalate, mission_note, mission_open, mission_row};
use super::contract::{
	MissionDraft, MissionEntry, MissionError, MissionEventKind, MissionNote, Ticket,
};
use crate::agent::protocol::HostAnswer;
use crate::agent::session::{Answering, HostRequests};
use crate::conversations::commands::ready;
use crate::db;

const SUBTYPE: &str = "mission";

const BOT: &str = "bot";

const NO_DATABASE: &str = "the store this session writes to is not open";

#[derive(Debug)]
pub struct MissionHost<R: Runtime> {
	app: AppHandle<R>,
	conversation_id: String,
	bot_id: String,
}

impl<R: Runtime> Clone for MissionHost<R> {
	fn clone(&self) -> Self {
		Self {
			app: self.app.clone(),
			conversation_id: self.conversation_id.clone(),
			bot_id: self.bot_id.clone(),
		}
	}
}

impl<R: Runtime> MissionHost<R> {
	pub fn new(app: AppHandle<R>, conversation_id: String, bot_id: String) -> Self {
		Self { app, conversation_id, bot_id }
	}

	pub async fn answer(&self, request: Value) -> HostAnswer {
		self.served(request).await.map_err(refused)
	}

	async fn served(&self, request: Value) -> Result<Value, MissionError> {
		let Asked::Mission { operation, payload } = read(request)?;
		let state = self.state()?;
		let database = ready(&state)?;
		match operation {
			Operation::Open => {
				let asked: Opened = read(payload)?;
				let draft = self.draft(asked);
				answered(mission_open(self.app.clone(), state, draft).await?)
			}
			Operation::Note => {
				let asked: Noted = read(payload)?;
				self.refuse_a_mission_it_does_not_own(database, &asked.id).await?;
				let entry = MissionEntry {
					kind: MissionEventKind::Note,
					source: BOT.to_owned(),
					payload: serde_json::json!({ "line": asked.line }),
				};
				answered(mission_note(self.app.clone(), state, asked.id, entry).await?)
			}
			Operation::Escalate => {
				let asked: Escalated = read(payload)?;
				self.refuse_a_mission_it_does_not_own(database, &asked.id).await?;
				let note = MissionNote {
					source: BOT.to_owned(),
					payload: serde_json::json!({
						"question": asked.question,
						"reason": asked.reason,
					}),
				};
				answered(mission_escalate(self.app.clone(), state, asked.id, note).await?)
			}
			Operation::Close => {
				let asked: Closed = read(payload)?;
				self.refuse_a_mission_it_does_not_own(database, &asked.id).await?;
				let note = MissionNote {
					source: BOT.to_owned(),
					payload: serde_json::json!({
						"outcome": asked.outcome,
						"summary": asked.summary,
					}),
				};
				answered(mission_close(self.app.clone(), state, asked.id, note).await?)
			}
		}
	}

	fn draft(&self, asked: Opened) -> MissionDraft {
		MissionDraft {
			origin_conversation_id: self.conversation_id.clone(),
			bot_id: self.bot_id.clone(),
			objective: asked.objective,
			ticket: asked.ticket,
			tools: asked.tools,
			source: BOT.to_owned(),
		}
	}

	fn state(&self) -> Result<State<'_, db::DatabaseState>, MissionError> {
		self.app
			.try_state::<db::DatabaseState>()
			.ok_or_else(|| MissionError::Unexpected { detail: NO_DATABASE.to_owned() })
	}

	async fn refuse_a_mission_it_does_not_own(
		&self,
		database: &db::Database,
		id: &str,
	) -> Result<(), MissionError> {
		let held = mission_row(database, id).await?;
		if held.origin_conversation_id != self.conversation_id {
			return Err(MissionError::MissionOfAnotherConversation {
				id: held.id,
				conversation_id: self.conversation_id.clone(),
			});
		}
		if held.bot_id != self.bot_id {
			return Err(MissionError::MissionOfAnotherBot {
				id: held.id,
				bot_id: self.bot_id.clone(),
			});
		}
		Ok(())
	}
}

impl<R: Runtime> HostRequests for MissionHost<R> {
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
	Mission {
		operation: Operation,
		#[serde(default = "nothing")]
		payload: Value,
	},
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
enum Operation {
	Open,
	Note,
	Escalate,
	Close,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum Outcome {
	Done,
	Failed,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Opened {
	objective: String,
	ticket: Ticket,
	tools: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Noted {
	id: String,
	line: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Escalated {
	id: String,
	question: String,
	reason: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Closed {
	id: String,
	outcome: Outcome,
	summary: String,
}

fn nothing() -> Value {
	Value::Object(serde_json::Map::new())
}

fn read<T: serde::de::DeserializeOwned>(payload: Value) -> Result<T, MissionError> {
	serde_json::from_value(payload)
		.map_err(|error| MissionError::UnreadableRequest { detail: error.to_string() })
}

fn answered<T: Serialize>(answer: T) -> Result<Value, MissionError> {
	serde_json::to_value(answer)
		.map_err(|error| MissionError::Unexpected { detail: error.to_string() })
}

fn refused(error: MissionError) -> Value {
	serde_json::to_value(&error).unwrap_or_else(
		|failure| serde_json::json!({ "kind": "unexpected", "detail": failure.to_string() }),
	)
}

#[cfg(test)]
mod tests {
	use std::fs;

	use serde_json::json;
	use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
	use tauri::{App, Manager as _};

	use super::super::commands::{mission_detail, mission_open as opened};
	use super::super::contract::{Mission, MissionEvent, MissionState};
	use super::*;

	const A_SPACE: &str = "
		INSERT INTO bots (id, space_id, name, model, created_at)
			VALUES ('b1', 'personal', 'First', 'sonnet', 1), ('b2', 'personal', 'Second', 'sonnet', 1);
		INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
			VALUES ('c1', 'topic', 'personal', 'First', 1, 1),
				('c2', 'topic', 'personal', 'Second', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'assistant', 1, 0), ('c1', 'b2', 'assistant', 1, 1),
				('c2', 'b1', 'assistant', 1, 0);
	";

	async fn a_host(name: &str) -> App<MockRuntime> {
		let mut context = mock_context(noop_assets());
		context.config_mut().identifier =
			format!("com.opennest.mission-host-{name}-{}", std::process::id()).into();
		let app = mock_builder().build(context).expect("the app builds");
		if let Ok(dir) = app.path().app_data_dir() {
			let _ = fs::remove_dir_all(&dir);
		}
		app.manage(db::bootstrap(app.handle()));
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

	fn serving(app: &App<MockRuntime>, conversation_id: &str) -> MissionHost<MockRuntime> {
		MissionHost::new(app.handle().clone(), conversation_id.to_owned(), "b1".to_owned())
	}

	fn asking(operation: &str, payload: Value) -> Value {
		json!({ "subtype": "mission", "operation": operation, "payload": payload })
	}

	fn an_open() -> Value {
		asking(
			"open",
			json!({
				"objective": "Ship the mission tools",
				"ticket": {
					"platform": "linear",
					"externalId": "OPE-26",
					"url": "https://linear.test/OPE-26",
					"title": "Mission tools"
				},
				"tools": ["gh"]
			}),
		)
	}

	async fn a_mission_of(app: &App<MockRuntime>, conversation_id: &str, bot_id: &str) -> Mission {
		opened(
			app.handle().clone(),
			app.state(),
			MissionDraft {
				origin_conversation_id: conversation_id.to_owned(),
				bot_id: bot_id.to_owned(),
				objective: "Held".to_owned(),
				ticket: Ticket {
					platform: "linear".to_owned(),
					external_id: "OPE-1".to_owned(),
					url: "https://linear.test/OPE-1".to_owned(),
					title: "Held".to_owned(),
				},
				tools: Vec::new(),
				source: "human".to_owned(),
			},
		)
		.await
		.expect("the mission opens")
	}

	async fn events(app: &App<MockRuntime>, id: &str) -> Vec<MissionEvent> {
		mission_detail(app.state(), id.to_owned()).await.expect("the mission reads").events
	}

	#[tokio::test]
	async fn a_mission_is_opened_noted_escalated_and_closed_by_the_bot_of_the_session() {
		let app = a_host("lifecycle").await;
		let host = serving(&app, "c1");

		let opened = host.answer(an_open()).await.expect("the mission opens");
		let id = opened["id"].as_str().expect("the mission is named").to_owned();
		let noted = host
			.answer(asking("note", json!({ "id": id, "line": "The host answers" })))
			.await
			.expect("the note lands");
		let escalated = host
			.answer(asking(
				"escalate",
				json!({
					"id": id,
					"question": "Which platform?",
					"reason": "The person decides"
				}),
			))
			.await
			.expect("the mission is escalated");
		let closed = host
			.answer(asking(
				"close",
				json!({ "id": id, "outcome": "done", "summary": "The tools are served" }),
			))
			.await
			.expect("the mission is closed");

		assert_eq!(opened["originConversationId"], json!("c1"));
		assert_eq!(opened["botId"], json!("b1"));
		assert_eq!(opened["state"], json!("working"));
		assert!(opened["threadConversationId"].is_string(), "got {opened}");
		assert_eq!(noted["state"], json!("working"));
		assert_eq!(escalated["state"], json!("waiting_human"));
		assert_eq!(closed["state"], json!("done"));
		assert_eq!(
			events(&app, &id)
				.await
				.into_iter()
				.map(|held| (held.kind, held.source, held.payload))
				.collect::<Vec<_>>(),
			vec![
				(MissionEventKind::Opened, BOT.to_owned(), json!({})),
				(MissionEventKind::Note, BOT.to_owned(), json!({ "line": "The host answers" })),
				(
					MissionEventKind::Escalated,
					BOT.to_owned(),
					json!({ "question": "Which platform?", "reason": "The person decides" })
				),
				(
					MissionEventKind::Closed,
					BOT.to_owned(),
					json!({ "outcome": "done", "summary": "The tools are served" })
				),
			]
		);

		cleaned(&app);
	}

	#[tokio::test]
	async fn a_mission_of_another_conversation_is_refused_and_nothing_is_appended() {
		let app = a_host("foreign-conversation").await;
		let held = a_mission_of(&app, "c2", "b1").await;
		let host = serving(&app, "c1");

		for asked in [
			asking("note", json!({ "id": held.id, "line": "Sneaking in" })),
			asking("escalate", json!({ "id": held.id, "question": "?", "reason": "?" })),
			asking("close", json!({ "id": held.id, "outcome": "done", "summary": "?" })),
		] {
			let refused = host.answer(asked).await.expect_err("the call is refused");

			assert_eq!(refused["kind"], json!("missionOfAnotherConversation"));
			assert_eq!(refused["id"], json!(held.id));
		}
		assert_eq!(
			events(&app, &held.id).await.into_iter().map(|event| event.kind).collect::<Vec<_>>(),
			vec![MissionEventKind::Opened]
		);

		cleaned(&app);
	}

	#[tokio::test]
	async fn a_mission_of_another_bot_is_refused_and_nothing_is_appended() {
		let app = a_host("foreign-bot").await;
		let held = a_mission_of(&app, "c1", "b2").await;
		let host = serving(&app, "c1");

		for asked in [
			asking("note", json!({ "id": held.id, "line": "Sneaking in" })),
			asking("escalate", json!({ "id": held.id, "question": "?", "reason": "?" })),
			asking("close", json!({ "id": held.id, "outcome": "done", "summary": "?" })),
		] {
			let refused = host.answer(asked).await.expect_err("the call is refused");

			assert_eq!(refused["kind"], json!("missionOfAnotherBot"));
			assert_eq!(refused["id"], json!(held.id));
		}
		assert_eq!(
			events(&app, &held.id).await.into_iter().map(|event| event.kind).collect::<Vec<_>>(),
			vec![MissionEventKind::Opened]
		);

		cleaned(&app);
	}

	#[tokio::test]
	async fn a_field_the_operation_does_not_declare_is_named_and_refused() {
		let app = a_host("undeclared").await;
		let host = serving(&app, "c1");

		let refused = host
			.answer(asking(
				"open",
				json!({
					"objective": "Ship it",
					"ticket": {
						"platform": "linear",
						"externalId": "OPE-26",
						"url": "https://linear.test/OPE-26",
						"title": "Mission tools"
					},
					"tools": [],
					"botId": "b2"
				}),
			))
			.await
			.expect_err("the call is refused");

		assert_eq!(refused["kind"], json!("unreadableRequest"));
		assert!(
			refused["detail"].as_str().is_some_and(|detail| detail.contains("botId")),
			"got {refused}"
		);

		cleaned(&app);
	}

	#[tokio::test]
	async fn a_closed_mission_answers_the_state_the_last_event_derives() {
		let app = a_host("derived").await;
		let host = serving(&app, "c1");
		let opened = host.answer(an_open()).await.expect("the mission opens");
		let id = opened["id"].as_str().expect("the mission is named").to_owned();

		host.answer(asking(
			"close",
			json!({ "id": id, "outcome": "failed", "summary": "Out of reach" }),
		))
		.await
		.expect("the mission is closed");

		let mission = mission_detail(app.state(), id).await.expect("the mission reads").mission;
		assert_eq!(mission.state, MissionState::Done);

		cleaned(&app);
	}
}
