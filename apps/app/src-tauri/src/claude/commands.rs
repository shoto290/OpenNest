use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, Runtime, State};

use super::binary;
use super::contract::{
	CheckReport, ClaudeEvent, ConnectionState, PermissionDecision, RuntimeScope, ScopedEvent,
	SessionHandle, SessionSnapshot, TransportError,
};
use super::session::{self, EventSink, GatedSink, Session, SessionOptions};
use super::store;

pub const EVENT_CHANNEL: &str = "claude://event";

/// The one way anything reaches the frontend, and the reason every event on the
/// channel names a run: the envelope is built here, so no caller can emit without
/// saying which run it is speaking for.
fn announce<R: Runtime>(app: &AppHandle<R>, scope: Option<RuntimeScope>, event: ClaudeEvent) {
	let _ = app.emit(EVENT_CHANNEL, ScopedEvent { scope, event });
}

/// The run the host stands for and the child running it, behind one lock.
///
/// They are one question — which session a caller naming a run may act on — and
/// asking it in two steps is asking it at two moments: a caller that reads the run
/// before a handover and reaches for the child after one is handed the session that
/// replaced the one it asked about. So there is no moment between the two answers:
/// the pair is read, replaced and given up together.
///
/// A `std::sync::Mutex`, and never held across an `await`: [`EventSink::emit`] is
/// synchronous and runs inside the read loop, where waiting on a lock would stall
/// the task feeding it — and a check that suspends is a check with a gap in it.
///
/// Generic over what it holds so the rules above can be exercised on their own. A
/// session is a spawned child; the rule is not, and a test of it should not have to
/// be.
struct Live<S = Arc<Session>> {
	run: std::sync::Mutex<Run<S>>,
}

/// `session` is only ever the child of `scope`, which [`Live::install`] is what
/// enforces: a child built for a run the host has since left is never taken.
struct Run<S> {
	scope: Option<RuntimeScope>,
	session: Option<S>,
}

impl<S> Default for Live<S> {
	fn default() -> Self {
		Self { run: std::sync::Mutex::new(Run { scope: None, session: None }) }
	}
}

impl<S: Clone> Live<S> {
	/// The handover, whole: the host stands for `scope` from here, and the child of
	/// the run it replaces is handed back for the caller to shut down. One critical
	/// section, so the host never stands for one run while holding another's child —
	/// and everything the replaced session still has to say is, from this statement
	/// on, somebody else's account of a process already handed over.
	fn take_over(&self, scope: RuntimeScope) -> Option<S> {
		let mut run = self.run.lock().expect("live run");
		run.scope = Some(scope);
		run.session.take()
	}

	/// Takes the child a start built, unless the host has moved on meanwhile — a
	/// quit, or a handover this start lost. Answers whether it was taken, because a
	/// child nobody holds has to be ended by whoever built it.
	///
	/// This is the whole of that check, and it happens under the lock that installs:
	/// asked before it instead, a quit landing in between would leave a departing
	/// host holding a child nothing left running will ever shut down.
	fn install(&self, scope: &RuntimeScope, session: S) -> bool {
		let mut run = self.run.lock().expect("live run");
		if run.scope.as_ref() != Some(scope) {
			return false;
		}
		run.session = Some(session);
		true
	}

	/// Everything the host is holding, given up at once. Both callers — a shutdown
	/// and the exit — leave it standing for no run at all, so nothing a dying child
	/// still emits is forwarded and no command reaches past it.
	fn clear(&self) -> Option<S> {
		let mut run = self.run.lock().expect("live run");
		run.scope = None;
		run.session.take()
	}

	fn holds(&self, scope: &RuntimeScope) -> bool {
		self.run.lock().expect("live run").scope.as_ref() == Some(scope)
	}

	/// Whether the host stands for a *different* run. Standing for none is not a
	/// disagreement: the caller and the host agree there is nothing running, which
	/// is what makes a second shutdown a no-op rather than a refusal.
	fn is_foreign(&self, scope: &RuntimeScope) -> bool {
		matches!(&self.run.lock().expect("live run").scope, Some(live) if live != scope)
	}

	/// The child a caller naming `scope` may act on: the one the host is holding,
	/// and only while the run it named is still the one it is holding it for. Both
	/// halves are decided under a single lock, so an accepted caller is handed the
	/// session of its own run or nothing — never the one that replaced it.
	fn session_for(&self, scope: &RuntimeScope) -> Result<S, TransportError> {
		let run = self.run.lock().expect("live run");
		if run.scope.as_ref().is_some_and(|live| live != scope) {
			return Err(stale(scope));
		}
		run.session.clone().ok_or(TransportError::NotStarted)
	}
}

/// One session's stream, stamped with the run it comes from and cut off once that
/// run is no longer the host's. The cut is the half a session cannot make for
/// itself: a child that lost its slot is still alive, still streaming and still
/// answering, and every frame it emits from then on describes a process the reader
/// has already been handed a replacement for.
struct RunSink<R: Runtime> {
	app: AppHandle<R>,
	scope: RuntimeScope,
	live: Arc<Live>,
}

impl<R: Runtime> EventSink for RunSink<R> {
	fn emit(&self, event: ClaudeEvent) {
		if !self.live.holds(&self.scope) {
			return;
		}
		announce(&self.app, Some(self.scope.clone()), event);
	}
}

/// Which lifecycle transition owns the session right now. Start, restart,
/// shutdown and quit are exclusive: two of them in flight at once is how a
/// second child becomes the active session while the first is still on its way
/// up, and the one that loses the slot is left running with nobody holding it.
#[derive(Default, Clone, Copy, PartialEq, Eq)]
enum Transition {
	#[default]
	Settled,
	Starting,
	Stopping,
	Quit,
}

#[derive(Default)]
pub struct ClaudeState {
	/// A `std::sync::Mutex`, and never held across an `await`: it is locked only
	/// long enough to read the enum and swap it. That is the whole point — the
	/// seconds a shutdown ladder spends waiting on a dying child must not be
	/// seconds spent holding a lock. What keeps the other callers out is the
	/// claim they fail to take, not a lock they would queue behind.
	transition: std::sync::Mutex<Transition>,
	/// The single active process and the run it is: one value, because which
	/// session a caller may act on is one question. The run is named before the
	/// child exists — a start knows what it is building — and the child joins it
	/// only if that run is still the host's when it comes up.
	live: Arc<Live>,
}

impl ClaudeState {
	/// Succeeds only from `Settled`. A caller that finds the seat taken is
	/// refused on the spot rather than queued: a start made to wait would spawn
	/// its child the moment the transition ahead of it let go, which is the
	/// second session this gate exists to prevent.
	fn claim(&self, next: Transition) -> Result<Claim<'_>, TransportError> {
		let mut transition = self.transition.lock().expect("transition");
		if *transition != Transition::Settled {
			return Err(TransportError::TransitionInProgress);
		}
		*transition = next;
		Ok(Claim { state: self })
	}

	/// The host's exit, which is never refused: it is the platform's last
	/// uncancellable event, so there is nothing left to hold it back in favour
	/// of. It is absorbing too — see [`Claim`].
	fn enter_quit(&self) {
		*self.transition.lock().expect("transition") = Transition::Quit;
	}
}

/// Frees the seat once the transition it stands for has ended — unless the host
/// began quitting meanwhile. A quit is never undone: a start that finishes
/// afterwards would otherwise reopen a gate the host it belongs to has already
/// left.
struct Claim<'a> {
	state: &'a ClaudeState,
}

impl Drop for Claim<'_> {
	fn drop(&mut self) {
		let mut transition = self.state.transition.lock().expect("transition");
		if *transition != Transition::Quit {
			*transition = Transition::Settled;
		}
	}
}

fn stale(scope: &RuntimeScope) -> TransportError {
	TransportError::StaleRuntimeSession { runtime_session_id: scope.runtime_session_id.clone() }
}

fn run_sink<R: Runtime>(
	app: &AppHandle<R>,
	scope: RuntimeScope,
	live: Arc<Live>,
) -> Arc<dyn EventSink> {
	Arc::new(RunSink { app: app.clone(), scope, live })
}

/// The scope is the caller's own and is echoed rather than checked: a check asks
/// about the install, which is true whatever run is on the frontend's mind — and
/// the first check of a launch happens before there is a run at all.
#[tauri::command]
pub async fn claude_check<R: Runtime>(
	app: AppHandle<R>,
	scope: Option<RuntimeScope>,
) -> CheckReport {
	announce(
		&app,
		scope.clone(),
		ClaudeEvent::ConnectionChanged { state: ConnectionState::Checking },
	);
	let report = binary::check().await;
	announce(&app, scope, ClaudeEvent::ConnectionChanged { state: report.connection });
	report
}

/// The scope is opened by the frontend against the durable lineage before this is
/// called, so the run has a row and a number before it has a process: a child that
/// crashes on its first breath is still a run somebody can name afterwards.
#[tauri::command]
pub async fn claude_start_or_resume_session<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, ClaudeState>,
	scope: RuntimeScope,
	resume: Option<String>,
	cwd: Option<String>,
) -> Result<SessionHandle, TransportError> {
	// The first statement, so this one claim spans the previous session's
	// shutdown and the new start alike: a restart is a single exclusive
	// transition, with no gap between its two halves for a concurrent start to
	// win. A refused start returns without emitting anything — announcing
	// `Unavailable` there would be a lie, since a session is on its way up.
	let _claim = state.claim(Transition::Starting)?;

	// The handover itself, under the claim and before anything is torn down: the
	// host stands for this run from here and hands back the child of the one it
	// replaces. Both in one statement, so no command and no frame can find the host
	// holding the previous session under the new run's name — and the seconds that
	// child is allowed to die in are spent holding no lock at all.
	let previous = state.live.take_over(scope.clone());
	if let Some(previous) = previous {
		previous.shutdown().await;
	}

	let binary = binary::resolve()?;
	let working_dir = cwd
		.map(PathBuf::from)
		.or_else(|| app.path().home_dir().ok())
		.unwrap_or_else(|| PathBuf::from("."));

	let sink = run_sink(&app, scope.clone(), state.live.clone());
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

	let session = Arc::new(started.session);
	let handle = SessionHandle { resumed: session.resumed() };
	// The host let this run go while the start was in flight — it began quitting, or
	// something else took the seat. Installing now would hand a departing host a
	// child that nothing left running will ever shut down, so the fresh one is ended
	// here instead: at most one active session and no orphan group, by construction
	// rather than by luck. Asked inside the install rather than before it, because a
	// quit landing between the two questions is the case this is about.
	if !state.live.install(&scope, session.clone()) {
		session.terminate().await;
		return Err(TransportError::TransitionInProgress);
	}
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

/// Which session each of the three is for is decided before the first `await` and
/// never revisited: the session is taken out of the state whole, so what the
/// command goes on to act on is the child it was handed and cannot become the one
/// that replaced it while the call is in flight.
#[tauri::command]
pub async fn claude_submit_prompt(
	state: State<'_, ClaudeState>,
	scope: RuntimeScope,
	text: String,
) -> Result<(), TransportError> {
	state.live.session_for(&scope)?.submit_prompt(&text).await
}

#[tauri::command]
pub async fn claude_cancel_turn(
	state: State<'_, ClaudeState>,
	scope: RuntimeScope,
) -> Result<(), TransportError> {
	state.live.session_for(&scope)?.cancel_turn().await
}

#[tauri::command]
pub async fn claude_respond_to_permission(
	state: State<'_, ClaudeState>,
	scope: RuntimeScope,
	id: String,
	decision: PermissionDecision,
) -> Result<(), TransportError> {
	state.live.session_for(&scope)?.respond_to_permission(&id, decision).await
}

/// The unguarded primitive. The lifecycle gate belongs to the command layer, so
/// reaching this directly is reserved for a caller that already holds the claim
/// — or a test standing in for one.
pub async fn shutdown_session(state: &ClaudeState) {
	let session = state.live.clear();
	if let Some(session) = session {
		session.shutdown().await;
	}
}

/// For the host's own exit, where the graceful ladder's seconds of waiting
/// would block the platform's quit sequence. The quit is taken before anything
/// else: it outranks whatever transition it interrupts, and it stays taken, so
/// a start still in flight finds the gate shut when it comes back rather than
/// installing a child into a host that is already gone.
///
/// The sweep runs whether or not a session was reachable: a start that has not
/// returned yet is not in the state and has a live process group all the same.
pub async fn terminate_session(state: &ClaudeState) {
	state.enter_quit();
	// The run and its child are given up together: the host stands for nothing from
	// here on, so nothing a dying child still has to say reaches a frontend that is
	// going away with it, and a start still building one finds no seat to install
	// into when it comes back.
	let session = state.live.clear();
	if let Some(session) = session {
		session.terminate().await;
	}
	session::sweep_live_groups();
}

/// Refused for a run the host has already replaced: a shutdown is the one command
/// whose whole effect is on the session it does not name, and a late one would end
/// the run that took its place. Asking to shut down when the host holds nothing is
/// not that — there is no other run to end, so it says so and stays a no-op, which
/// is what makes a second shutdown as safe as the first.
///
/// The announcement is stamped with the run it is about and emitted after the
/// child is gone, straight to the channel: it is the host speaking about the
/// session, not the session speaking, and the sink that carried the latter has
/// stopped forwarding by then.
#[tauri::command]
pub async fn claude_shutdown<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, ClaudeState>,
	scope: RuntimeScope,
) -> Result<(), TransportError> {
	let _claim = state.claim(Transition::Stopping)?;
	if state.live.is_foreign(&scope) {
		return Err(stale(&scope));
	}
	shutdown_session(&state).await;
	announce(
		&app,
		Some(scope),
		ClaudeEvent::ConnectionChanged { state: ConnectionState::Checking },
	);
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

	/// A session stands in for the child a start would have built: what the rules
	/// under test do with it is hand it back or refuse to, never run it.
	const REPLACED_SESSION: &str = "the session that was replaced";
	const REPLACEMENT_SESSION: &str = "the session that replaced it";

	fn a_scope() -> RuntimeScope {
		RuntimeScope {
			conversation_id: "c1".into(),
			bot_id: "b1".into(),
			runtime_session_id: "r1".into(),
			epoch: 1,
		}
	}

	fn the_next_run() -> RuntimeScope {
		RuntimeScope { runtime_session_id: "r2".into(), epoch: 2, ..a_scope() }
	}

	fn is_stale(outcome: &Result<&str, TransportError>) -> bool {
		matches!(outcome, Err(TransportError::StaleRuntimeSession { .. }))
	}

	/// Every field is part of which run this is, so each one alone is enough to
	/// make a scope somebody else's: the same lineage a turn later, the same number
	/// under another bot, the same row named by another conversation. A scope
	/// compared on its id alone would take all three for the live run.
	#[test]
	fn a_scope_differing_anywhere_is_a_run_the_host_is_not_holding() {
		let live = Live::<&str>::default();
		live.take_over(a_scope());
		live.install(&a_scope(), REPLACED_SESSION);

		assert!(live.holds(&a_scope()), "the host stopped recognising the run it holds");
		assert!(!live.is_foreign(&a_scope()), "the live run was refused as somebody else's");
		for other in [
			RuntimeScope { epoch: 2, ..a_scope() },
			RuntimeScope { runtime_session_id: "r2".into(), ..a_scope() },
			RuntimeScope { bot_id: "b2".into(), ..a_scope() },
			RuntimeScope { conversation_id: "c2".into(), ..a_scope() },
		] {
			assert!(
				live.is_foreign(&other),
				"a run the host never held was taken for it: {other:?}"
			);
			assert!(!live.holds(&other), "a run the host never held was taken for it: {other:?}");
			assert!(
				is_stale(&live.session_for(&other)),
				"a run the host never held was handed the session it is holding: {other:?}"
			);
		}
	}

	/// The handover, and the silence after it: the replaced run is refused from the
	/// moment its successor is named, and once the host holds nothing at all there
	/// is no other run left for a late caller to reach past.
	#[test]
	fn a_replaced_run_is_refused_and_a_host_holding_none_refuses_nobody() {
		let replaced = a_scope();
		let live = Live::<&str>::default();
		live.take_over(replaced.clone());

		live.take_over(the_next_run());
		assert!(live.is_foreign(&replaced), "a replaced run still reached the host");

		live.clear();
		assert!(!live.is_foreign(&replaced), "a host holding no run refused a caller anyway");
		assert!(!live.holds(&replaced), "a host holding no run claimed to hold one");
	}

	/// The interleaving a two-step check let through, written out in the order it
	/// happens: a caller reads which run the host is holding, a whole handover lands,
	/// and only then does it reach for the session. The second answer alone has to
	/// refuse it — read from a slot of its own instead, it hands the replacement to a
	/// caller that asked about the run before it, which is a cancel, an approval or a
	/// prompt landing on the process that took over.
	#[test]
	fn a_caller_that_read_the_run_before_a_handover_is_refused_at_the_session() {
		let replaced = a_scope();
		let live = Live::<&str>::default();
		live.take_over(replaced.clone());
		assert!(live.install(&replaced, REPLACED_SESSION));

		assert!(!live.is_foreign(&replaced), "the caller's first question was already refused");

		let handed_back = live.take_over(the_next_run());
		assert_eq!(handed_back, Some(REPLACED_SESSION), "the handover kept the child it replaced");
		assert!(live.install(&the_next_run(), REPLACEMENT_SESSION));

		let answered = live.session_for(&replaced);

		assert!(
			is_stale(&answered),
			"a caller naming the replaced run was handed the session that replaced it: {answered:?}"
		);
		assert_eq!(
			live.session_for(&the_next_run()).ok(),
			Some(REPLACEMENT_SESSION),
			"the run the host is holding was refused its own session"
		);
	}

	/// The other half of the coupling: a child is only ever the child of the run the
	/// host stands for. A start that comes back to a host which has let its run go —
	/// the exit is the one that does that — installs nothing, and is told so, because
	/// a child nobody holds has to be ended by whoever built it.
	#[test]
	fn a_child_built_for_a_run_the_host_has_left_is_never_installed() {
		let live = Live::<&str>::default();
		live.take_over(a_scope());

		live.clear();

		assert!(
			!live.install(&a_scope(), REPLACED_SESSION),
			"a start installed its child into a host that had let its run go"
		);
		assert!(
			matches!(live.session_for(&a_scope()), Err(TransportError::NotStarted)),
			"a host standing for no run answered with a session all the same"
		);
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
