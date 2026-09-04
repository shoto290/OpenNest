use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime, State};

use super::contract::{
	ConversationMissions, Mission, MissionDetail, MissionDraft, MissionEntry, MissionError,
	MissionEventKind, MissionNote, MissionOnBoard, MissionState,
};
use crate::avatars;
use crate::bundles;
use crate::conversations::commands::{bot_row, ready};
use crate::conversations::contract::Bot;
use crate::db;

pub const CHANGED_EVENT: &str = "mission://changed";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionChanged {
	pub mission_id: String,
	pub state: MissionState,
}

fn announce_change<R: Runtime>(app: &AppHandle<R>, mission: &Mission) -> Result<(), MissionError> {
	app.emit(CHANGED_EVENT, MissionChanged { mission_id: mission.id.clone(), state: mission.state })
		.map_err(|error| MissionError::Undeliverable { detail: error.to_string() })
}

fn refuse_blank(field: &str, held: &str) -> Result<(), MissionError> {
	match held.trim().is_empty() {
		true => Err(MissionError::BlankField { field: field.to_owned() }),
		false => Ok(()),
	}
}

fn refused_draft(draft: &MissionDraft) -> Result<(), MissionError> {
	refuse_blank("objective", &draft.objective)?;
	refuse_blank("ticket.platform", &draft.ticket.platform)?;
	refuse_blank("ticket.externalId", &draft.ticket.external_id)?;
	refuse_blank("source", &draft.source)
}

#[tauri::command]
pub async fn mission_open<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	draft: MissionDraft,
) -> Result<Mission, MissionError> {
	refused_draft(&draft)?;
	let opened = ready(&state)?.missions().open(draft).await?;
	announce_change(&app, &opened)?;
	Ok(opened)
}

#[tauri::command]
pub async fn mission_note<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	mission_id: String,
	entry: MissionEntry,
) -> Result<Mission, MissionError> {
	appended(&app, &state, mission_id, entry).await
}

#[tauri::command]
pub async fn mission_escalate<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	mission_id: String,
	note: MissionNote,
) -> Result<Mission, MissionError> {
	appended(&app, &state, mission_id, MissionEntry::of(MissionEventKind::Escalated, note)).await
}

#[tauri::command]
pub async fn mission_close<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	mission_id: String,
	note: MissionNote,
) -> Result<Mission, MissionError> {
	appended(&app, &state, mission_id, MissionEntry::of(MissionEventKind::Closed, note)).await
}

async fn appended<R: Runtime>(
	app: &AppHandle<R>,
	state: &State<'_, db::DatabaseState>,
	mission_id: String,
	entry: MissionEntry,
) -> Result<Mission, MissionError> {
	refuse_blank("source", &entry.source)?;
	let written = ready(state)?.missions().append(mission_id, entry).await?;
	announce_change(app, &written)?;
	Ok(written)
}

#[tauri::command]
pub async fn mission_list(
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
) -> Result<ConversationMissions, MissionError> {
	ready(&state)?.missions().of_conversation(conversation_id).await
}

#[tauri::command]
pub async fn mission_detail(
	state: State<'_, db::DatabaseState>,
	mission_id: String,
) -> Result<MissionDetail, MissionError> {
	ready(&state)?.missions().detail(mission_id).await
}

#[tauri::command]
pub async fn mission_board<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
) -> Result<Vec<MissionOnBoard>, MissionError> {
	let database = ready(&state)?;
	let dir = avatars::dir(&app);
	let bundle_root = bundles::root(&app);
	let mut board = Vec::new();
	for mission in database.missions().still_open().await? {
		let bot = bot_row(database, &mission.bot_id).await?;
		board.push(MissionOnBoard {
			mission,
			bot: Bot::of(bot, dir.as_deref(), bundle_root.as_deref()),
		});
	}
	Ok(board)
}

#[cfg(test)]
mod tests {
	use std::fs;
	use std::sync::mpsc::channel;

	use serde_json::json;
	use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
	use tauri::{App, Listener as _, Manager as _};

	use super::super::contract::Ticket;
	use super::*;

	const TWO_SPACES: &str = "
		INSERT INTO spaces (id, name, colour, position, created_at)
			VALUES ('work', 'Work', 'blue', 1, 1);
		INSERT INTO bots (id, space_id, name, model, created_at)
			VALUES ('b1', 'personal', 'First', 'sonnet', 1),
				('b2', 'work', 'Second', 'sonnet', 1);
		INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
			VALUES ('c1', 'topic', 'personal', 'First', 1, 1),
				('c2', 'topic', 'work', 'Second', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'lead', 1, 0), ('c2', 'b2', 'lead', 1, 0);
	";

	async fn a_host(name: &str) -> App<MockRuntime> {
		let mut context = mock_context(noop_assets());
		context.config_mut().identifier =
			format!("com.opennest.mission-commands-{name}-{}", std::process::id()).into();
		let app = mock_builder().build(context).expect("the app builds");
		if let Ok(dir) = app.path().app_data_dir() {
			let _ = fs::remove_dir_all(&dir);
		}
		app.manage(db::bootstrap(app.handle()));
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.call_mut(|connection| Ok(connection.execute_batch(TWO_SPACES)?))
			.await
			.expect("the spaces are planted");
		app
	}

	fn a_draft(conversation_id: &str, bot_id: &str, objective: &str) -> MissionDraft {
		MissionDraft {
			origin_conversation_id: conversation_id.to_owned(),
			bot_id: bot_id.to_owned(),
			objective: objective.to_owned(),
			ticket: Ticket {
				platform: "github".to_owned(),
				external_id: "42".to_owned(),
				url: "https://opennest.test/tickets/42".to_owned(),
				title: "Crash on open".to_owned(),
			},
			tools: vec!["gh".to_owned()],
			source: "bot".to_owned(),
		}
	}

	fn a_note() -> MissionNote {
		MissionNote { source: "human".to_owned(), payload: json!({}) }
	}

	fn cleaned(app: &App<MockRuntime>) {
		if let Ok(dir) = app.path().app_data_dir() {
			let _ = fs::remove_dir_all(&dir);
		}
	}

	#[tokio::test]
	async fn the_board_holds_every_open_mission_of_every_space_with_its_bot_and_its_state() {
		let app = a_host("board").await;
		let here = mission_open(app.handle().clone(), app.state(), a_draft("c1", "b1", "Fix it"))
			.await
			.expect("the mission opens");
		let there = mission_open(app.handle().clone(), app.state(), a_draft("c2", "b2", "Ship it"))
			.await
			.expect("the mission opens");
		let done = mission_open(app.handle().clone(), app.state(), a_draft("c2", "b2", "Old work"))
			.await
			.expect("the mission opens");
		mission_escalate(app.handle().clone(), app.state(), here.id.clone(), a_note())
			.await
			.expect("the mission is escalated");
		mission_close(app.handle().clone(), app.state(), done.id, a_note())
			.await
			.expect("the mission is closed");

		let board =
			mission_board(app.handle().clone(), app.state()).await.expect("the board reads");

		assert_eq!(
			board
				.iter()
				.map(|held| (held.mission.id.clone(), held.bot.name.clone(), held.mission.state))
				.collect::<Vec<_>>(),
			vec![
				(here.id, "First".to_owned(), MissionState::WaitingHuman),
				(there.id, "Second".to_owned(), MissionState::Working),
			],
			"the board lost an open mission, its bot or its state"
		);

		cleaned(&app);
	}

	#[tokio::test]
	async fn a_write_tells_the_front_which_mission_moved_and_where_it_stands() {
		let app = a_host("announced").await;
		let (sender, received) = channel();
		app.handle().listen(CHANGED_EVENT, move |event| {
			let _ = sender.send(event.payload().to_owned());
		});

		let opened = mission_open(app.handle().clone(), app.state(), a_draft("c1", "b1", "Fix it"))
			.await
			.expect("the mission opens");
		mission_escalate(app.handle().clone(), app.state(), opened.id.clone(), a_note())
			.await
			.expect("the mission is escalated");

		let announced: Vec<serde_json::Value> = received
			.try_iter()
			.map(|payload| serde_json::from_str(&payload).expect("the payload is JSON"))
			.collect();
		assert_eq!(
			announced,
			vec![
				json!({ "missionId": opened.id, "state": "working" }),
				json!({ "missionId": opened.id, "state": "waiting_human" }),
			],
			"the front was not told which mission moved and where it stands"
		);

		cleaned(&app);
	}

	#[tokio::test]
	async fn a_command_naming_a_mission_no_row_holds_refuses_and_writes_nothing() {
		let app = a_host("unknown").await;

		let refused = mission_close(app.handle().clone(), app.state(), "x9".to_owned(), a_note())
			.await
			.expect_err("the close is refused");

		assert_eq!(refused, MissionError::UnknownMission { id: "x9".to_owned() });
		let board =
			mission_board(app.handle().clone(), app.state()).await.expect("the board reads");
		assert!(board.is_empty(), "got {board:?}");

		cleaned(&app);
	}
}
