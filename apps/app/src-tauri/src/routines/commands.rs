use std::path::PathBuf;

use serde_json::Value;
use tauri::{AppHandle, Emitter, Runtime, State};

use super::contract::{
	Filter, ReportedRun, Routine, RoutineDraft, RoutineEdit, RoutineError, RoutineKey, RoutineRun,
	RunClosing, RunRequested, TriggerDecision, TriggerSource,
};
use super::core::{self, Clock, RunSink, SystemClock};
use super::filter;
use super::schedule;
use super::sources;
use crate::bundles;
use crate::conversations::commands::{bot_row, ready};
use crate::conversations::contract::TranscriptStoreError;
use crate::db;

pub const RUN_REQUESTED_EVENT: &str = "routine://run-requested";

pub(crate) struct Announcer<'a, R: Runtime> {
	pub(crate) app: &'a AppHandle<R>,
}

impl<R: Runtime> RunSink for Announcer<'_, R> {
	fn requested(&self, event: RunRequested) -> Result<(), RoutineError> {
		self.app
			.emit(RUN_REQUESTED_EVENT, event)
			.map_err(|error| RoutineError::Undeliverable { detail: error.to_string() })
	}
}

#[tauri::command]
pub async fn routine_trigger_sources<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	bot_id: String,
) -> Result<Vec<TriggerSource>, TranscriptStoreError> {
	let bot = bot_row(ready(&state)?, &bot_id).await?;
	sources::stacked(&stacked_bundles(&app, &bot.space_id, &bot.id))
}

fn stacked_bundles<R: Runtime>(app: &AppHandle<R>, space_id: &str, bot_id: &str) -> Vec<PathBuf> {
	[
		bundles::system::laid_down(app),
		bundles::space::laid_down(app, space_id),
		bundles::root(app).map(|root| bundles::dir(&root, bot_id)),
	]
	.into_iter()
	.flatten()
	.collect()
}

pub(crate) async fn declared_source<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	bot_id: &str,
	trigger_source_id: &str,
) -> Result<TriggerSource, RoutineError> {
	let bot = bot_row(database, bot_id).await?;
	let stacked = sources::stacked(&stacked_bundles(app, &bot.space_id, &bot.id))?;
	stacked
		.into_iter()
		.find(|source| source.id == trigger_source_id)
		.ok_or_else(|| RoutineError::UnknownSource { id: trigger_source_id.to_owned() })
}

async fn refuse_unsupported_rows<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	bot_id: &str,
	trigger_source_id: &str,
	held: &Filter,
) -> Result<(), RoutineError> {
	let source = declared_source(app, database, bot_id, trigger_source_id).await?;
	filter::validate(&source.payload, held)
}

fn refuse_unreadable_expression(
	trigger_source_id: &str,
	trigger_config: &Value,
) -> Result<(), RoutineError> {
	if trigger_source_id != schedule::SOURCE_ID {
		return Ok(());
	}
	schedule::validated(trigger_config)
}

#[tauri::command]
pub async fn routine_create<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	draft: RoutineDraft,
) -> Result<Routine, RoutineError> {
	let database = ready(&state)?;
	core::refuse_blank_task(&draft.title, &draft.instruction)?;
	refuse_unsupported_rows(&app, database, &draft.bot_id, &draft.trigger_source_id, &draft.filter)
		.await?;
	refuse_unreadable_expression(&draft.trigger_source_id, &draft.trigger_config)?;
	let key = uuid::Uuid::new_v4().to_string();
	database.routines().create(draft, key, SystemClock.now_ms()).await
}

#[tauri::command]
pub async fn routine_update<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	id: String,
	edit: RoutineEdit,
) -> Result<Routine, RoutineError> {
	let database = ready(&state)?;
	core::refuse_blank_task(&edit.title, &edit.instruction)?;
	let held = routine_row(database, &id).await?;
	refuse_unsupported_rows(&app, database, &held.bot_id, &held.trigger_source_id, &edit.filter)
		.await?;
	refuse_unreadable_expression(&held.trigger_source_id, &edit.trigger_config)?;
	database.routines().update(id, edit).await
}

#[tauri::command]
pub async fn routine_delete(
	state: State<'_, db::DatabaseState>,
	id: String,
) -> Result<(), RoutineError> {
	ready(&state)?.routines().delete(id).await
}

#[tauri::command]
pub async fn routine_list(
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
) -> Result<Vec<Routine>, RoutineError> {
	ready(&state)?.routines().of_conversation(conversation_id).await
}

#[tauri::command]
pub async fn routine_runs(
	state: State<'_, db::DatabaseState>,
	routine_id: String,
	limit: u32,
) -> Result<Vec<RoutineRun>, RoutineError> {
	ready(&state)?.routines().runs(routine_id, limit).await
}

#[tauri::command]
pub async fn routine_reported_runs(
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
) -> Result<Vec<ReportedRun>, RoutineError> {
	ready(&state)?.routines().reported(conversation_id).await
}

#[tauri::command]
pub async fn routine_run_now<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	id: String,
) -> Result<TriggerDecision, RoutineError> {
	core::run_now(ready(&state)?, &Announcer { app: &app }, &SystemClock, id).await
}

#[tauri::command]
pub async fn routine_renew_lease(
	state: State<'_, db::DatabaseState>,
	run_id: String,
) -> Result<(), RoutineError> {
	ready(&state)?.routines().renew_lease(run_id, SystemClock.now_ms()).await
}

#[tauri::command]
pub async fn routine_close_run(
	state: State<'_, db::DatabaseState>,
	run_id: String,
	closing: RunClosing,
) -> Result<RoutineRun, RoutineError> {
	ready(&state)?.routines().close_run(run_id, closing, SystemClock.now_ms()).await
}

#[tauri::command]
pub async fn routine_key<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	id: String,
) -> Result<RoutineKey, RoutineError> {
	let database = ready(&state)?;
	let held = routine_row(database, &id).await?;
	let source = declared_source(&app, database, &held.bot_id, &held.trigger_source_id).await?;
	let key = database.routines().key_of(id).await?;
	Ok(RoutineKey { key, header: source.header })
}

async fn routine_row(database: &db::Database, id: &str) -> Result<Routine, RoutineError> {
	database
		.routines()
		.held(id.to_owned())
		.await?
		.ok_or_else(|| RoutineError::UnknownRoutine { id: id.to_owned() })
}

#[cfg(test)]
mod tests {
	use std::fs;

	use serde_json::json;
	use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
	use tauri::{App, Manager as _};

	use super::*;
	use crate::routines::contract::{FilterMatchMode, RoutineDraft};

	const A_PARTICIPANT: &str = "
		INSERT INTO bots (id, space_id, name, model, created_at)
			VALUES ('b1', 'personal', 'First', 'sonnet', 1);
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('c1', 'main', 'First', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'assistant', 1, 0);
	";

	async fn a_host(name: &str) -> App<MockRuntime> {
		let mut context = mock_context(noop_assets());
		context.config_mut().identifier =
			format!("com.opennest.routine-commands-{name}-{}", std::process::id()).into();
		let app = mock_builder().build(context).expect("the app builds");
		if let Ok(dir) = app.path().app_data_dir() {
			let _ = fs::remove_dir_all(&dir);
		}
		app.manage(db::bootstrap(app.handle()));
		let system = bundles::system::path(app.handle()).expect("the system bundle is named");
		bundles::system::write(&system).expect("the system bundle lands");
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.call_mut(|connection| Ok(connection.execute_batch(A_PARTICIPANT)?))
			.await
			.expect("the participant is planted");
		app
	}

	fn a_draft(expression: &str) -> RoutineDraft {
		RoutineDraft {
			conversation_id: "c1".to_owned(),
			bot_id: "b1".to_owned(),
			title: "Nightly report".to_owned(),
			instruction: "Read the shift log and report what changed.".to_owned(),
			trigger_source_id: "schedule".to_owned(),
			filter: Filter { match_mode: FilterMatchMode::All, rows: Vec::new() },
			trigger_config: json!({ "expression": expression }),
		}
	}

	fn cleaned(app: &App<MockRuntime>) {
		if let Ok(dir) = app.path().app_data_dir() {
			let _ = fs::remove_dir_all(&dir);
		}
	}

	#[tokio::test]
	async fn a_schedule_whose_expression_croner_refuses_is_named_and_never_stored() {
		let app = a_host("refused").await;

		let failure = routine_create(app.handle().clone(), app.state(), a_draft("every tuesday"))
			.await
			.expect_err("the routine is refused");

		let RoutineError::UnreadableExpression { expression, reason } = failure else {
			panic!("got {failure:?}");
		};
		assert_eq!(expression, "every tuesday");
		assert!(!reason.is_empty(), "the reason is carried");
		let stored = routine_list(app.state(), "c1".to_owned()).await.expect("the routines read");
		assert!(stored.is_empty(), "got {stored:?}");

		cleaned(&app);
	}

	#[tokio::test]
	async fn an_expression_croner_reads_is_stored_and_can_be_edited_but_not_broken() {
		let app = a_host("stored").await;

		let stored = routine_create(app.handle().clone(), app.state(), a_draft("0 * * * *"))
			.await
			.expect("the routine is created");

		let broken = routine_update(
			app.handle().clone(),
			app.state(),
			stored.id.clone(),
			RoutineEdit {
				title: stored.title.clone(),
				instruction: stored.instruction.clone(),
				filter: stored.filter.clone(),
				trigger_config: json!({ "expression": "not a cron" }),
				is_enabled: true,
			},
		)
		.await
		.expect_err("the edit is refused");

		assert!(
			matches!(broken, RoutineError::UnreadableExpression { ref expression, .. }
				if expression == "not a cron"),
			"got {broken:?}"
		);
		let held = routine_list(app.state(), "c1".to_owned()).await.expect("the routines read");
		assert_eq!(held.len(), 1, "got {held:?}");
		assert_eq!(held[0].trigger_config, json!({ "expression": "0 * * * *" }));

		cleaned(&app);
	}
}
