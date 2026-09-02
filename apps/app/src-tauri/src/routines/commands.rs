use std::path::PathBuf;

use tauri::{AppHandle, Emitter, Runtime, State};

use super::contract::{
	Filter, Routine, RoutineDraft, RoutineEdit, RoutineError, RoutineKey, RoutineRun, RunClosing,
	RunRequested, TriggerDecision, TriggerSource,
};
use super::core::{self, Clock, RunSink, SystemClock};
use super::filter;
use super::sources;
use crate::bundles;
use crate::conversations::commands::{bot_row, ready};
use crate::conversations::contract::TranscriptStoreError;
use crate::db;

pub const RUN_REQUESTED_EVENT: &str = "routine://run-requested";

struct Announcer<'a, R: Runtime> {
	app: &'a AppHandle<R>,
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

async fn declared_source<R: Runtime>(
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
