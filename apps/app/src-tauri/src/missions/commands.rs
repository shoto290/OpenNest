use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

use super::contract::{
	ConversationMissions, Mission, MissionClosing, MissionDetail, MissionDraft, MissionEntry,
	MissionError, MissionEventKind, MissionNote, MissionOnBoard, MissionState, MissionWatch,
	MissionWatching,
};
use super::hook;
use crate::avatars;
use crate::bundles;
use crate::conversations::commands::{bot_row, ready};
use crate::conversations::contract::Bot;
use crate::db;
use crate::routines::webhook::{Webhook, HEADER};

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
	closing: MissionClosing,
) -> Result<Mission, MissionError> {
	refuse_blank("source", &closing.source)?;
	let written = ready(&state)?.missions().close(mission_id, closing).await?;
	announce_change(&app, &written)?;
	Ok(written)
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
pub async fn mission_watch<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	mission_id: String,
	watch: MissionWatch,
) -> Result<MissionWatching, MissionError> {
	let watch = normalised(watch);
	refused_watch(&watch)?;
	let url = hook_url(&app)?;
	let (mission, key) = ready(&state)?
		.missions()
		.arm(mission_id, watch.clone(), uuid::Uuid::new_v4().to_string())
		.await?;
	if let Some(workspace) = watch.workspace_path.as_deref() {
		hook::installed(&hook::dir(&app, &mission.id)?, workspace, &url, &key)?;
	}
	Ok(MissionWatching { mission, url, key, header: HEADER.to_owned() })
}

fn normalised(watch: MissionWatch) -> MissionWatch {
	MissionWatch {
		branch: watch.branch.trim().to_owned(),
		repository: watch.repository.trim().to_owned(),
		workspace_path: watch
			.workspace_path
			.map(|path| path.trim().to_owned())
			.filter(|path| !path.is_empty()),
	}
}

fn refused_watch(watch: &MissionWatch) -> Result<(), MissionError> {
	refuse_blank("branch", &watch.branch)?;
	refuse_blank("repository", &watch.repository)?;
	refuse_unnamed(&watch.repository)?;
	match watch.workspace_path.as_deref() {
		Some(workspace) => hook::checkout(workspace).map(|_| ()),
		None => Ok(()),
	}
}

fn refuse_unnamed(repository: &str) -> Result<(), MissionError> {
	match repository.split('/').collect::<Vec<_>>().as_slice() {
		[owner, name] if !owner.is_empty() && !name.is_empty() => Ok(()),
		_ => Err(MissionError::Undeliverable {
			detail: "a repository is named owner then slash then name".to_owned(),
		}),
	}
}

fn hook_url<R: Runtime>(app: &AppHandle<R>) -> Result<String, MissionError> {
	app.try_state::<Webhook>().and_then(|webhook| webhook.mission_url()).ok_or_else(|| {
		MissionError::Undeliverable { detail: "the local server answers no call".to_owned() }
	})
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
	with_their_bots(&app, database, database.missions().still_open().await?).await
}

#[tauri::command]
pub async fn mission_unreported<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
) -> Result<Vec<MissionOnBoard>, MissionError> {
	let database = ready(&state)?;
	with_their_bots(&app, database, database.missions().closed_without_report().await?).await
}

#[tauri::command]
pub async fn mission_reported(
	state: State<'_, db::DatabaseState>,
	mission_id: String,
	turn_id: Option<String>,
) -> Result<Mission, MissionError> {
	ready(&state)?.missions().report(mission_id, turn_id).await
}

async fn with_their_bots<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	missions: Vec<Mission>,
) -> Result<Vec<MissionOnBoard>, MissionError> {
	let dir = avatars::dir(app);
	let bundle_root = bundles::root(app);
	let mut board = Vec::new();
	for mission in missions {
		let bot = bot_row(database, &mission.bot_id).await?;
		board.push(MissionOnBoard {
			mission,
			bot: Bot::of(bot, dir.as_deref(), bundle_root.as_deref()),
		});
	}
	Ok(board)
}

pub(crate) async fn mission_row(
	database: &db::Database,
	id: &str,
) -> Result<Mission, MissionError> {
	database
		.missions()
		.held(id.to_owned())
		.await?
		.ok_or_else(|| MissionError::UnknownMission { id: id.to_owned() })
}

#[cfg(test)]
mod tests {
	use std::fs;
	use std::sync::mpsc::channel;

	use serde_json::json;
	use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
	use tauri::{App, Listener as _, Manager as _};

	use super::super::contract::{MissionOutcome, Ticket};
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

	fn a_closing(outcome: MissionOutcome) -> MissionClosing {
		MissionClosing {
			source: "human".to_owned(),
			outcome,
			summary: "The objective is settled".to_owned(),
		}
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
		mission_close(app.handle().clone(), app.state(), done.id, a_closing(MissionOutcome::Done))
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
	async fn a_closed_mission_owes_a_report_until_one_is_recorded_and_recording_stays_silent() {
		let app = a_host("unreported").await;
		let opened = mission_open(app.handle().clone(), app.state(), a_draft("c1", "b1", "Fix it"))
			.await
			.expect("the mission opens");
		let open = mission_open(app.handle().clone(), app.state(), a_draft("c1", "b1", "Ship it"))
			.await
			.expect("the mission opens");
		mission_close(
			app.handle().clone(),
			app.state(),
			opened.id.clone(),
			a_closing(MissionOutcome::Done),
		)
		.await
		.expect("the mission closes");
		a_turn_in(&app, "t1", "c1").await;
		let (sender, received) = channel();
		app.handle().listen(CHANGED_EVENT, move |event| {
			let _ = sender.send(event.payload().to_owned());
		});

		let owed = mission_unreported(app.handle().clone(), app.state())
			.await
			.expect("the missions owing a report read");
		let recorded = mission_reported(app.state(), opened.id.clone(), Some("t1".to_owned()))
			.await
			.expect("the report is recorded");
		let settled = mission_unreported(app.handle().clone(), app.state())
			.await
			.expect("the missions owing a report read");

		assert_eq!(
			owed.iter().map(|held| held.mission.id.clone()).collect::<Vec<_>>(),
			vec![opened.id.clone()],
			"the closed mission is not the only one owing a report"
		);
		assert_eq!(owed[0].bot.name, "First", "the mission owing a report came without its bot");
		assert_eq!(recorded.reported_turn_id, Some("t1".to_owned()));
		assert!(recorded.reported_at.is_some(), "the recorded report carries no moment");
		assert!(settled.is_empty(), "a mission that reported still owes one");
		assert!(
			received.try_recv().is_err(),
			"recording a report told the front the mission moved"
		);
		let board =
			mission_board(app.handle().clone(), app.state()).await.expect("the board reads");
		assert_eq!(
			board.iter().map(|held| held.mission.id.clone()).collect::<Vec<_>>(),
			vec![open.id],
			"the board stopped answering open missions only"
		);

		cleaned(&app);
	}

	async fn a_turn_in(app: &App<MockRuntime>, id: &str, conversation_id: &str) {
		let statement = format!(
			"INSERT INTO turns (id, conversation_id, seq, started_at)
				VALUES ('{id}', '{conversation_id}', 1, 1)"
		);
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.call_mut(move |connection| Ok(connection.execute_batch(&statement)?))
			.await
			.expect("the turn is planted");
	}

	#[tokio::test]
	async fn closing_on_a_failed_outcome_appends_failed_carries_the_summary_and_shuts_the_mission()
	{
		let app = a_host("failed-close").await;
		let opened = mission_open(app.handle().clone(), app.state(), a_draft("c1", "b1", "Fix it"))
			.await
			.expect("the mission opens");

		let closed = mission_close(
			app.handle().clone(),
			app.state(),
			opened.id.clone(),
			a_closing(MissionOutcome::Failed),
		)
		.await
		.expect("the mission closes");

		assert_eq!(closed.state, MissionState::Failed, "got {:?}", closed.state);
		assert!(closed.closed_at.is_some(), "the failed close left the mission open");
		let detail =
			mission_detail(app.state(), opened.id.clone()).await.expect("the mission detail reads");
		assert_eq!(detail.mission.closed_at, closed.closed_at, "the moment it closed moved");
		let last = detail.events.last().expect("the close event is there");
		assert_eq!(last.kind, MissionEventKind::Failed, "got {:?}", last.kind);
		assert_eq!(
			last.payload,
			json!({ "outcome": "failed", "summary": "The objective is settled" }),
			"the failed close lost its outcome or its summary"
		);

		let refused = mission_note(
			app.handle().clone(),
			app.state(),
			opened.id.clone(),
			MissionEntry::of(MissionEventKind::Note, a_note()),
		)
		.await
		.expect_err("the closed mission refuses an event");
		assert_eq!(refused, MissionError::MissionAlreadyClosed { id: opened.id });

		cleaned(&app);
	}

	#[tokio::test]
	async fn closing_on_a_done_outcome_appends_closed_and_carries_the_summary() {
		let app = a_host("done-close").await;
		let opened = mission_open(app.handle().clone(), app.state(), a_draft("c1", "b1", "Fix it"))
			.await
			.expect("the mission opens");

		let closed = mission_close(
			app.handle().clone(),
			app.state(),
			opened.id.clone(),
			a_closing(MissionOutcome::Done),
		)
		.await
		.expect("the mission closes");

		assert_eq!(closed.state, MissionState::Done, "got {:?}", closed.state);
		assert!(closed.closed_at.is_some(), "the done close left the mission open");
		let detail =
			mission_detail(app.state(), opened.id).await.expect("the mission detail reads");
		let last = detail.events.last().expect("the close event is there");
		assert_eq!(last.kind, MissionEventKind::Closed, "got {:?}", last.kind);
		assert_eq!(
			last.payload,
			json!({ "outcome": "done", "summary": "The objective is settled" }),
			"the done close lost its outcome or its summary"
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

	fn a_workspace(name: &str) -> std::path::PathBuf {
		let path = std::env::temp_dir()
			.join(format!("opennest-mission-watch-{name}-{}", std::process::id()));
		let _ = fs::remove_dir_all(&path);
		fs::create_dir_all(&path).expect("the workspace is there");
		path
	}

	fn a_checkout(name: &str) -> std::path::PathBuf {
		let path = a_workspace(name);
		fs::write(path.join(".git"), "gitdir: /elsewhere/.git/worktrees/one")
			.expect("the git file lands");
		path
	}

	fn a_watch(branch: &str, workspace: Option<&std::path::Path>) -> MissionWatch {
		MissionWatch {
			branch: branch.to_owned(),
			repository: "shoto290/OpenNest".to_owned(),
			workspace_path: workspace.map(|path| path.to_string_lossy().into_owned()),
		}
	}

	#[tokio::test]
	async fn arming_a_mission_answers_where_the_hook_calls_and_installs_it_in_the_workspace() {
		let app = a_host("watched").await;
		app.manage(crate::routines::webhook::start(app.handle().clone()));
		let workspace = a_checkout("watched");
		let opened = mission_open(app.handle().clone(), app.state(), a_draft("c1", "b1", "Fix it"))
			.await
			.expect("the mission opens");

		let armed = mission_watch(
			app.handle().clone(),
			app.state(),
			opened.id.clone(),
			a_watch("feature/ope-27", Some(&workspace)),
		)
		.await
		.expect("the mission is armed");

		assert_eq!(armed.header, crate::routines::webhook::HEADER);
		assert!(armed.url.starts_with("http://127.0.0.1:"), "got {}", armed.url);
		assert!(armed.url.ends_with(crate::missions::call::PATH), "got {}", armed.url);
		assert!(!armed.key.is_empty());
		assert_eq!(armed.mission.id, opened.id);
		let settings = fs::read_to_string(workspace.join(".claude").join("settings.local.json"))
			.expect("the settings of the workspace read");
		assert!(settings.contains("opennest-agent-hook.sh"), "got {settings}");

		let again = mission_watch(
			app.handle().clone(),
			app.state(),
			opened.id.clone(),
			a_watch("feature/ope-27", None),
		)
		.await
		.expect("the mission is armed again");

		assert_eq!(again.key, armed.key, "the second arming minted another key");

		if let Some(webhook) = app.try_state::<crate::routines::webhook::Webhook>() {
			webhook.stop();
		}
		fs::remove_dir_all(&workspace).expect("cleanup");
		cleaned(&app);
	}

	#[tokio::test]
	async fn arming_refuses_an_unknown_mission_a_closed_one_and_a_repository_without_an_owner() {
		let app = a_host("refused").await;
		app.manage(crate::routines::webhook::start(app.handle().clone()));
		let opened = mission_open(app.handle().clone(), app.state(), a_draft("c1", "b1", "Fix it"))
			.await
			.expect("the mission opens");
		let done = mission_open(app.handle().clone(), app.state(), a_draft("c1", "b1", "Old work"))
			.await
			.expect("the mission opens");
		mission_close(
			app.handle().clone(),
			app.state(),
			done.id.clone(),
			a_closing(MissionOutcome::Done),
		)
		.await
		.expect("the mission closes");

		let unknown = mission_watch(
			app.handle().clone(),
			app.state(),
			"x9".to_owned(),
			a_watch("feature/ope-27", None),
		)
		.await
		.expect_err("the unknown mission is refused");
		let closed = mission_watch(
			app.handle().clone(),
			app.state(),
			done.id.clone(),
			a_watch("feature/ope-27", None),
		)
		.await
		.expect_err("the closed mission is refused");
		let unnamed = mission_watch(
			app.handle().clone(),
			app.state(),
			opened.id,
			MissionWatch {
				branch: "feature/ope-27".to_owned(),
				repository: "OpenNest".to_owned(),
				workspace_path: None,
			},
		)
		.await
		.expect_err("the repository without an owner is refused");

		assert_eq!(unknown, MissionError::UnknownMission { id: "x9".to_owned() });
		assert_eq!(closed, MissionError::MissionAlreadyClosed { id: done.id });
		assert!(matches!(unnamed, MissionError::Undeliverable { .. }), "got {unnamed:?}");

		if let Some(webhook) = app.try_state::<crate::routines::webhook::Webhook>() {
			webhook.stop();
		}
		cleaned(&app);
	}

	#[tokio::test]
	async fn arming_on_a_workspace_that_is_no_git_checkout_writes_nothing_and_arms_nothing() {
		let app = a_host("no-git").await;
		app.manage(crate::routines::webhook::start(app.handle().clone()));
		let workspace = a_workspace("no-git");
		let opened = mission_open(app.handle().clone(), app.state(), a_draft("c1", "b1", "Fix it"))
			.await
			.expect("the mission opens");

		let refused = mission_watch(
			app.handle().clone(),
			app.state(),
			opened.id.clone(),
			a_watch("feature/ope-42", Some(&workspace)),
		)
		.await
		.expect_err("the workspace that is no git checkout is refused");

		assert!(matches!(refused, MissionError::Undeliverable { .. }), "got {refused:?}");
		assert!(!workspace.join(".claude").exists(), "the refused workspace was written in");
		let watched = ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.missions()
			.watched()
			.await
			.expect("the watched missions read");
		assert!(watched.is_empty(), "got {watched:?}");

		if let Some(webhook) = app.try_state::<crate::routines::webhook::Webhook>() {
			webhook.stop();
		}
		fs::remove_dir_all(&workspace).expect("cleanup");
		cleaned(&app);
	}

	#[tokio::test]
	async fn a_command_naming_a_mission_no_row_holds_refuses_and_writes_nothing() {
		let app = a_host("unknown").await;

		let refused = mission_close(
			app.handle().clone(),
			app.state(),
			"x9".to_owned(),
			a_closing(MissionOutcome::Done),
		)
		.await
		.expect_err("the close is refused");

		assert_eq!(refused, MissionError::UnknownMission { id: "x9".to_owned() });
		let board =
			mission_board(app.handle().clone(), app.state()).await.expect("the board reads");
		assert!(board.is_empty(), "got {board:?}");

		cleaned(&app);
	}
}
