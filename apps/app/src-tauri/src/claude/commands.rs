use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tokio::sync::Mutex;

use super::binary;
use super::contract::{
	CheckReport, ClaudeEvent, ConnectionState, PermissionDecision, SessionHandle, SessionSnapshot,
	TransportError,
};
use super::session::{self, EventSink, GatedSink, Session, SessionOptions};
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
	// Taken out of the scrutinee on purpose: in edition 2021 a guard there lives
	// to the end of the block, which would hold every other command behind the
	// seconds the previous child is allowed to die in.
	let previous = state.session.lock().await.take();
	if let Some(previous) = previous {
		previous.shutdown().await;
	}

	let binary = binary::resolve()?;
	let working_dir = cwd
		.map(PathBuf::from)
		.or_else(|| app.path().home_dir().ok())
		.unwrap_or_else(|| PathBuf::from("."));

	let sink = sink(&app);
	let options = SessionOptions::new(binary, working_dir);

	let started = match start_with_fallback(options, resume, sink.clone()).await {
		Ok(started) => started,
		Err(error) => {
			sink.emit(ClaudeEvent::ConnectionChanged { state: ConnectionState::Unavailable });
			sink.emit(ClaudeEvent::Failed { error: error.clone() });
			return Err(error);
		}
	};

	if let Some(refusal) = &started.resume_refusal {
		let forgot_session_id =
			forget_the_id_a_refusal_blames(store::file(&app).as_deref(), refusal);
		sink.emit(ClaudeEvent::Failed {
			error: TransportError::ResumeFailed { forgot_session_id },
		});
	}

	let session = started.session;
	let handle = SessionHandle { resumed: session.resumed() };
	*state.session.lock().await = Some(Arc::new(session));
	sink.emit(ClaudeEvent::ConnectionChanged { state: ConnectionState::Ready });
	Ok(handle)
}

/// A crash is the only refusal that implicates the id itself. A startup timeout
/// says the handshake was slow, which is what resuming a long conversation
/// looks like — Claude replays the transcript before it acknowledges anything —
/// and dropping the id there would cost a reader the very conversation whose
/// size caused the wait.
///
/// Answers whether the id was given up on, because the frontend holds a copy of
/// it and only the two dropped together stay in step: a frontend that drops one
/// the host kept writes `null` straight back over it on the next prompt. The
/// verdict does not depend on the store being reachable — an unreachable one
/// leaves the id no less spent.
fn forget_the_id_a_refusal_blames(path: Option<&Path>, refusal: &TransportError) -> bool {
	if !matches!(refusal, TransportError::Crashed { .. }) {
		return false;
	}
	if let Some(path) = path {
		store::forget_session_id(path);
	}
	true
}

/// A launch, and what it spent on the way. `resume_refusal` carries why a
/// stored id was given up on, because a fresh session says only that one was.
pub struct Started {
	pub session: Session,
	pub resume_refusal: Option<TransportError>,
}

/// A dead stored id and a broken install both surface as the same startup
/// failure, and stderr — the one channel that would tell them apart — is
/// discarded on purpose. So a refusal is only ever reported alongside the
/// session that replaced it, and never on its own: when the resume-free start
/// fails too, `--resume` was never the variable, and the failure that travels
/// upward is the fresh attempt's — the newer account, and the one that
/// describes the install rather than the id.
///
/// For the same reason the resume attempt emits behind a gate: its crash is a
/// step in a launch still expected to succeed, so the reader sees it only if it
/// turns out to be the answer.
pub async fn start_with_fallback(
	options: SessionOptions,
	resume: Option<String>,
	sink: Arc<dyn EventSink>,
) -> Result<Started, TransportError> {
	if resume.is_none() {
		let session = Session::start(options, sink).await?;
		return Ok(Started { session, resume_refusal: None });
	}

	let gated = Arc::new(GatedSink::new(sink.clone()));
	let refusal = match Session::start(options.clone().resuming(resume), gated.clone()).await {
		Ok(session) => {
			gated.promote();
			return Ok(Started { session, resume_refusal: None });
		}
		Err(error) => error,
	};

	gated.discard();
	let session = Session::start(options, sink).await?;
	Ok(Started { session, resume_refusal: Some(refusal) })
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

pub async fn shutdown_session(state: &ClaudeState) {
	let session = state.session.lock().await.take();
	if let Some(session) = session {
		session.shutdown().await;
	}
}

/// For the host's own exit, where the graceful ladder's seconds of waiting
/// would block the platform's quit sequence. The sweep runs whether or not a
/// session was reachable: a start that has not returned yet is not in the state
/// and has a live process group all the same.
pub async fn terminate_session(state: &ClaudeState) {
	let session = state.session.lock().await.take();
	if let Some(session) = session {
		session.terminate().await;
	}
	session::sweep_live_groups();
}

#[tauri::command]
pub async fn claude_shutdown<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, ClaudeState>,
) -> Result<(), TransportError> {
	shutdown_session(&state).await;
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

#[cfg(test)]
mod tests {
	use super::*;

	fn stored_id(path: &Path) -> Option<String> {
		store::load(path).session_id
	}

	/// The fallback runs on both, and only one of the two says anything about
	/// the id it gave up on.
	#[test]
	fn a_timed_out_resume_keeps_the_stored_id_and_a_crashed_one_spends_it() {
		let dir = std::env::temp_dir().join(format!("opennest-refusal-{}", uuid::Uuid::new_v4()));
		let path = dir.join(store::FILE_NAME);
		let snapshot =
			SessionSnapshot { session_id: Some("session-1".into()), ..SessionSnapshot::default() };
		store::save(&path, &snapshot);

		let spent = forget_the_id_a_refusal_blames(
			Some(&path),
			&TransportError::StartupTimeout { timeout_ms: 30_000 },
		);
		assert!(!spent, "a slow resume was reported to the frontend as a spent id");
		assert_eq!(stored_id(&path).as_deref(), Some("session-1"), "a slow resume cost the id");

		let spent = forget_the_id_a_refusal_blames(
			Some(&path),
			&TransportError::Crashed { code: Some(4), detail: None },
		);
		assert!(spent, "the frontend was left holding an id the host gave up on");
		assert_eq!(stored_id(&path), None, "a refused id outlived the crash that proved it dead");

		std::fs::remove_dir_all(&dir).expect("cleanup");
	}
}
