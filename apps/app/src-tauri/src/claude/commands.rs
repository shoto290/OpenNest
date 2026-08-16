use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tokio::sync::Mutex;

use super::binary;
use super::contract::{
	CheckReport, ClaudeEvent, ConnectionState, PermissionDecision, SessionHandle, SessionSnapshot,
	TransportError,
};
use super::session::{EventSink, Session, SessionOptions};
use super::store;

pub const EVENT_CHANNEL: &str = "claude://event";

pub fn invoke_handler<R: Runtime>() -> impl Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync + 'static
{
	tauri::generate_handler![
		claude_check,
		claude_start_or_resume_session,
		claude_submit_prompt,
		claude_cancel_turn,
		claude_respond_to_permission,
		claude_shutdown,
		claude_load_session,
		claude_save_session,
	]
}

struct AppSink<R: Runtime>(AppHandle<R>);

impl<R: Runtime> EventSink for AppSink<R> {
	fn emit(&self, event: ClaudeEvent) {
		let _ = self.0.emit(EVENT_CHANNEL, event);
	}
}

#[derive(Default)]
pub struct ClaudeState {
	session: Mutex<Option<Arc<Session>>>,
}

impl ClaudeState {
	async fn current(&self) -> Result<Arc<Session>, TransportError> {
		self.session.lock().await.clone().ok_or(TransportError::NotStarted)
	}
}

fn sink<R: Runtime>(app: &AppHandle<R>) -> Arc<dyn EventSink> {
	Arc::new(AppSink(app.clone()))
}

#[tauri::command]
pub async fn claude_check<R: Runtime>(app: AppHandle<R>) -> CheckReport {
	let sink = sink(&app);
	sink.emit(ClaudeEvent::ConnectionChanged { state: ConnectionState::Checking });
	let report = binary::check().await;
	sink.emit(ClaudeEvent::ConnectionChanged { state: report.connection });
	report
}

#[tauri::command]
pub async fn claude_start_or_resume_session<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, ClaudeState>,
	resume: Option<String>,
	cwd: Option<String>,
) -> Result<SessionHandle, TransportError> {
	if let Some(previous) = state.session.lock().await.take() {
		previous.shutdown().await;
	}

	let binary = binary::resolve()?;
	let working_dir = cwd
		.map(PathBuf::from)
		.or_else(|| app.path().home_dir().ok())
		.unwrap_or_else(|| PathBuf::from("."));

	let sink = sink(&app);
	let options = SessionOptions::new(binary, working_dir);
	let has_stored_id = resume.is_some();

	let session = match start_with_fallback(options, resume, sink.clone()).await {
		Ok(session) => session,
		Err(error) => {
			sink.emit(ClaudeEvent::ConnectionChanged { state: ConnectionState::Unavailable });
			sink.emit(ClaudeEvent::Failed { error: error.clone() });
			return Err(error);
		}
	};

	if has_stored_id && !session.resumed() {
		if let Some(path) = store::file(&app) {
			store::forget_session_id(&path);
		}
		sink.emit(ClaudeEvent::Failed { error: TransportError::ResumeFailed });
	}

	let handle = SessionHandle { resumed: session.resumed() };
	*state.session.lock().await = Some(Arc::new(session));
	sink.emit(ClaudeEvent::ConnectionChanged { state: ConnectionState::Ready });
	Ok(handle)
}

/// A dead stored id and a broken install both surface as the same startup
/// failure, and stderr — the one channel that would tell them apart — is
/// discarded on purpose. So the id is only blamed once a resume-free start has
/// proven it wrong: a second failure means `--resume` was never the variable,
/// and the stored id is kept rather than costing the reader their transcript.
pub async fn start_with_fallback(
	options: SessionOptions,
	resume: Option<String>,
	sink: Arc<dyn EventSink>,
) -> Result<Session, TransportError> {
	if resume.is_none() {
		return Session::start(options, sink).await;
	}

	let refused = match Session::start(options.clone().resuming(resume), sink.clone()).await {
		Ok(session) => return Ok(session),
		Err(error) => error,
	};
	Session::start(options, sink).await.map_err(|_| refused)
}

#[tauri::command]
pub async fn claude_submit_prompt(
	state: State<'_, ClaudeState>,
	text: String,
) -> Result<(), TransportError> {
	state.current().await?.submit_prompt(&text).await
}

#[tauri::command]
pub async fn claude_cancel_turn(state: State<'_, ClaudeState>) -> Result<(), TransportError> {
	state.current().await?.cancel_turn().await
}

#[tauri::command]
pub async fn claude_respond_to_permission(
	state: State<'_, ClaudeState>,
	id: String,
	decision: PermissionDecision,
) -> Result<(), TransportError> {
	state.current().await?.respond_to_permission(&id, decision).await
}

#[tauri::command]
pub async fn claude_shutdown<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, ClaudeState>,
) -> Result<(), TransportError> {
	if let Some(session) = state.session.lock().await.take() {
		session.shutdown().await;
	}
	sink(&app).emit(ClaudeEvent::ConnectionChanged { state: ConnectionState::Checking });
	Ok(())
}

/// Both persistence commands are infallible: an unreachable store leaves the
/// frontend with an empty transcript, which is exactly what it would show a
/// first-time user, and there is no recovery it could offer.
#[tauri::command]
pub async fn claude_load_session<R: Runtime>(app: AppHandle<R>) -> SessionSnapshot {
	store::file(&app).map(|path| store::load(&path)).unwrap_or_default()
}

#[tauri::command]
pub async fn claude_save_session<R: Runtime>(app: AppHandle<R>, snapshot: SessionSnapshot) {
	if let Some(path) = store::file(&app) {
		store::save(&path, &snapshot);
	}
}
