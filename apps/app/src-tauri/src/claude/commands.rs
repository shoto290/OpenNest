use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tokio::sync::Mutex;

use super::binary;
use super::contract::{
	CheckReport, ClaudeEvent, ConnectionState, PermissionDecision, SessionHandle, TransportError,
};
use super::session::{EventSink, Session, SessionOptions};

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
	let options = SessionOptions::new(binary, working_dir).resuming(resume.clone());

	let session = match Session::start(options, sink.clone()).await {
		Ok(session) => session,
		Err(error) => {
			sink.emit(ClaudeEvent::ConnectionChanged { state: ConnectionState::Unavailable });
			sink.emit(ClaudeEvent::Failed { error: error.clone() });
			return Err(error);
		}
	};

	let handle = SessionHandle { resumed: session.resumed() };
	*state.session.lock().await = Some(Arc::new(session));
	sink.emit(ClaudeEvent::ConnectionChanged { state: ConnectionState::Ready });
	Ok(handle)
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
