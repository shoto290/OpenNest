use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, Runtime, State};

use super::binary;
use super::contract::{
	CheckReport, ClaudeEvent, ConnectionState, PermissionDecision, RuntimeScope, ScopedEvent,
	SessionHandle, SessionSnapshot, TransportError,
};
use super::models;
use super::redact;
use super::session::{self, EventSink, GatedSink, Session, SessionOptions};
use super::store;
use crate::db;

pub const EVENT_CHANNEL: &str = "claude://event";

/// The one way anything reaches the frontend, and the reason every event on the
/// channel names a run: the envelope is built here, so no caller can emit without
/// saying which run it is speaking for.
fn announce<R: Runtime>(app: &AppHandle<R>, scope: Option<RuntimeScope>, event: ClaudeEvent) {
	let _ = app.emit(EVENT_CHANNEL, ScopedEvent { scope, event });
}

/// The conversation and the bot a run answers for. Every command and every event
/// names both, and it is what the durable lineage keys a run by too.
type Participant = (String, String);

fn participant(scope: &RuntimeScope) -> Participant {
	(scope.conversation_id.clone(), scope.bot_id.clone())
}

/// The run each participant stands for and the child running it, behind one lock.
///
/// Keyed by the participant, because that is what a run belongs to: a bot answering
/// is a child of its own, and a reader walking off to another bot is not a reason to
/// end it. Two participants share nothing here but the lock.
///
/// Within one participant the run and its child stay one question — which session a
/// caller naming a run may act on — and asking it in two steps is asking it at two
/// moments: a caller that reads the run before a handover and reaches for the child
/// after one is handed the session that replaced the one it asked about. So there is
/// no moment between the two answers: the pair is read, replaced and given up
/// together.
///
/// A `std::sync::Mutex`, and never held across an `await`: [`EventSink::emit`] is
/// synchronous and runs inside the read loop, where waiting on a lock would stall
/// the task feeding it — and a check that suspends is a check with a gap in it.
///
/// Generic over what it holds so the rules above can be exercised on their own. A
/// session is a spawned child; the rule is not, and a test of it should not have to
/// be.
struct Live<S = Arc<Session>> {
	runs: std::sync::Mutex<HashMap<Participant, Run<S>>>,
}

/// `session` is only ever the child of `scope`, which [`Live::install`] is what
/// enforces: a child built for a run the host has since left is never taken.
struct Run<S> {
	scope: RuntimeScope,
	session: Option<S>,
}

impl<S> Default for Live<S> {
	fn default() -> Self {
		Self { runs: std::sync::Mutex::new(HashMap::new()) }
	}
}

impl<S: Clone> Live<S> {
	/// The handover, whole: the participant stands for `scope` from here, and the
	/// child of the run it replaces is handed back for the caller to shut down. One
	/// critical section, so a participant never stands for one run while holding
	/// another's child — and everything the replaced session still has to say is,
	/// from this statement on, somebody else's account of a process already handed
	/// over.
	fn take_over(&self, scope: RuntimeScope) -> Option<S> {
		let mut runs = self.runs.lock().expect("live runs");
		runs.insert(participant(&scope), Run { scope, session: None })
			.and_then(|replaced| replaced.session)
	}

	/// Takes the child a start built, unless the participant has moved on meanwhile
	/// — a quit, or a handover this start lost. Answers whether it was taken,
	/// because a child nobody holds has to be ended by whoever built it.
	///
	/// This is the whole of that check, and it happens under the lock that installs:
	/// asked before it instead, a quit landing in between would leave a departing
	/// host holding a child nothing left running will ever shut down.
	fn install(&self, scope: &RuntimeScope, session: S) -> bool {
		let mut runs = self.runs.lock().expect("live runs");
		let Some(run) = runs.get_mut(&participant(scope)) else {
			return false;
		};
		if &run.scope != scope {
			return false;
		}
		run.session = Some(session);
		true
	}

	/// One participant's run and its child, given up together. The host stands for
	/// no run of that participant afterwards, so nothing its dying child still emits
	/// is forwarded and no command reaches past it — and every other participant is
	/// left exactly as it was.
	fn clear(&self, scope: &RuntimeScope) -> Option<S> {
		self.runs.lock().expect("live runs").remove(&participant(scope)).and_then(|run| run.session)
	}

	/// Every run at once, for the exit — the one caller whose business is all of
	/// them. What comes back is every child the host was still holding, and what is
	/// left behind is a host standing for nothing at all.
	fn clear_all(&self) -> Vec<S> {
		std::mem::take(&mut *self.runs.lock().expect("live runs"))
			.into_values()
			.filter_map(|run| run.session)
			.collect()
	}

	/// Asked on every frame a session emits, so it never builds a key to throw away:
	/// a scope equal to a run's names that run's participant by construction, which
	/// makes looking for the scope itself the same question as a lookup by key.
	fn holds(&self, scope: &RuntimeScope) -> bool {
		self.runs.lock().expect("live runs").values().any(|run| &run.scope == scope)
	}

	/// Whether the participant this scope names is on a *different* run. Standing for
	/// none is not a disagreement: the caller and the host agree there is nothing
	/// running for it, which is what makes a second shutdown a no-op rather than a
	/// refusal.
	fn is_foreign(&self, scope: &RuntimeScope) -> bool {
		self.runs
			.lock()
			.expect("live runs")
			.get(&participant(scope))
			.is_some_and(|run| &run.scope != scope)
	}

	/// The child a caller naming `scope` may act on: the one its participant is
	/// holding, and only while the run it named is still the one being held. Both
	/// halves are decided under a single lock, so an accepted caller is handed the
	/// session of its own run or nothing — never the one that replaced it, and never
	/// another participant's.
	fn session_for(&self, scope: &RuntimeScope) -> Result<S, TransportError> {
		let runs = self.runs.lock().expect("live runs");
		let Some(run) = runs.get(&participant(scope)) else {
			return Err(TransportError::NotStarted);
		};
		if &run.scope != scope {
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

/// Which participants a lifecycle transition owns right now, and whether the host
/// is leaving. Start, restart and shutdown are exclusive per participant, and only
/// per participant: two of them on one bot is how a second child becomes its live
/// session while the first is still on its way up, and the one that loses the slot
/// is left running with nobody holding it. Two bots coming up together race over
/// nothing.
#[derive(Default)]
struct Gate {
	/// The host's exit, which is never refused and never undone: it is the
	/// platform's last uncancellable event, so there is nothing left to hold it back
	/// in favour of — and a start finishing afterwards would otherwise reopen a gate
	/// the host it belongs to has already left.
	quitting: bool,
	busy: HashSet<Participant>,
}

#[derive(Default)]
pub struct ClaudeState {
	/// A `std::sync::Mutex`, and never held across an `await`: it is locked only
	/// long enough to read the claim and take it. That is the whole point — the
	/// seconds a shutdown ladder spends waiting on a dying child must not be
	/// seconds spent holding a lock. What keeps the other callers out is the
	/// claim they fail to take, not a lock they would queue behind.
	gate: std::sync::Mutex<Gate>,
	/// The live process of every participant that has one, and the run each of them
	/// is. The run is named before the child exists — a start knows what it is
	/// building — and the child joins it only if that run is still its
	/// participant's when it comes up.
	live: Arc<Live>,
}

impl ClaudeState {
	/// Succeeds only for a participant no transition owns. A caller that finds the
	/// seat taken is refused on the spot rather than queued: a start made to wait
	/// would spawn its child the moment the transition ahead of it let go, which is
	/// the second session this gate exists to prevent.
	fn claim(&self, participant: Participant) -> Result<Claim<'_>, TransportError> {
		let mut gate = self.gate.lock().expect("gate");
		if gate.quitting || !gate.busy.insert(participant.clone()) {
			return Err(TransportError::TransitionInProgress);
		}
		Ok(Claim { state: self, participant })
	}

	fn enter_quit(&self) {
		self.gate.lock().expect("gate").quitting = true;
	}
}

/// Frees the participant's seat once the transition it stands for has ended.
struct Claim<'a> {
	state: &'a ClaudeState,
	participant: Participant,
}

impl Drop for Claim<'_> {
	fn drop(&mut self) {
		self.state.gate.lock().expect("gate").busy.remove(&self.participant);
	}
}

fn stale(scope: &RuntimeScope) -> TransportError {
	TransportError::StaleRuntimeSession { runtime_session_id: scope.runtime_session_id.clone() }
}

/// Every model label the installed executable knows how to name, in the order it is
/// offered — see [`super::models`]. Answered from one read of the file per launch, so
/// a caller may ask whenever it likes and the second ask costs nothing.
///
/// An empty answer is a host that found no catalogue: no executable, or one that
/// carries none. It is not a failure and does not say the install is broken — what to
/// offer instead is the frontend's to decide, and a bot's model was never restricted
/// to what this list holds.
#[tauri::command]
pub async fn claude_models() -> Vec<String> {
	models::read().await
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

/// What the bot a run answers for is started as: its own instructions, and the
/// directory it works in. Both are fixed for the life of a process, so both are
/// read at the moment one is spawned.
#[derive(Default)]
struct RuntimeIdentity {
	instructions: Option<String>,
	working_dir: Option<String>,
}

/// Read from the record rather than taken from the caller: the file is what the
/// context is rebuilt from too, and a start that trusted whatever the frontend was
/// holding when it asked would put a bot's old self behind its new one.
///
/// A host with no database, or a bot the file no longer holds, is started as a bot
/// carrying nothing — which is the runtime this app started every process in before
/// a bot could be described at all.
async fn runtime_identity(state: &db::DatabaseState, bot_id: &str) -> RuntimeIdentity {
	let Ok(database) = state.as_ref() else {
		return RuntimeIdentity::default();
	};
	let Ok(Some(bot)) = database.conversations().bot(bot_id.to_owned()).await else {
		return RuntimeIdentity::default();
	};
	RuntimeIdentity { instructions: Some(bot.instructions), working_dir: bot.working_dir }
}

/// Where the child is started, and the directory that was refused if one was. A
/// stored directory that is no longer a directory is not a reason to leave a reader
/// without a process: the run starts where a bot naming none starts, and the path it
/// asked for travels back so the reader is told which one this is not.
///
/// The refusal is reported with the home prefix collapsed, like every other path
/// that crosses to the frontend.
fn where_it_runs(stored: Option<String>, anywhere: PathBuf) -> (PathBuf, Option<String>) {
	let Some(stored) = stored.filter(|path| !path.trim().is_empty()) else {
		return (anywhere, None);
	};
	let asked = PathBuf::from(&stored);
	if asked.is_dir() {
		return (asked, None);
	}
	(anywhere, Some(redact::path(&asked)))
}

/// The scope is opened by the frontend against the durable lineage before this is
/// called, so the run has a row and a number before it has a process: a child that
/// crashes on its first breath is still a run somebody can name afterwards.
///
/// The scope also says which bot the child is, and that is read off the record here
/// rather than asked of the caller: the process is spawned with the bot's
/// instructions as its system prompt and in the directory the bot works in, and
/// neither can be changed in a child that is already running.
#[tauri::command]
pub async fn claude_start_or_resume_session<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, ClaudeState>,
	database: State<'_, db::DatabaseState>,
	scope: RuntimeScope,
	resume: Option<String>,
	cwd: Option<String>,
) -> Result<SessionHandle, TransportError> {
	// The first statement, so this one claim spans the previous session's
	// shutdown and the new start alike: a restart is a single exclusive
	// transition, with no gap between its two halves for a concurrent start to
	// win. Claimed for this participant alone — another bot starting, or already
	// answering, has nothing to do with this one. A refused start returns without
	// emitting anything — announcing `Unavailable` there would be a lie, since a
	// session is on its way up.
	let _claim = state.claim(participant(&scope))?;

	// The handover itself, under the claim and before anything is torn down: the
	// participant stands for this run from here and hands back the child of the one
	// it replaces. Both in one statement, so no command and no frame can find it
	// holding the previous session under the new run's name — and the seconds that
	// child is allowed to die in are spent holding no lock at all.
	let previous = state.live.take_over(scope.clone());
	if let Some(previous) = previous {
		previous.shutdown().await;
	}

	let binary = binary::resolve()?;
	let identity = runtime_identity(&database, &scope.bot_id).await;
	let anywhere = cwd
		.map(PathBuf::from)
		.or_else(|| app.path().home_dir().ok())
		.unwrap_or_else(|| PathBuf::from("."));
	let (working_dir, refused_dir) = where_it_runs(identity.working_dir, anywhere);

	let sink: Arc<dyn EventSink> =
		Arc::new(RunSink { app: app.clone(), scope: scope.clone(), live: state.live.clone() });
	let options = SessionOptions::new(binary, working_dir).instructed(identity.instructions);

	let started = match start_with_fallback(options, resume, sink.clone()).await {
		Ok(started) => started,
		Err(error) => {
			sink.emit(ClaudeEvent::ConnectionChanged { state: ConnectionState::Unavailable });
			sink.emit(ClaudeEvent::Failed { error: error.clone() });
			return Err(error);
		}
	};

	// Said once the process is up, the way a refused resume is: both are a launch
	// that succeeded with something less than it was asked for, and neither is worth
	// telling a reader about ahead of the session it happened in.
	if let Some(path) = refused_dir {
		sink.emit(ClaudeEvent::Failed { error: TransportError::WorkingDirectoryRefused { path } });
	}

	if let Some(refusal) = &started.resume_refusal {
		let forgot_session_id =
			forget_the_id_a_refusal_blames(store::file(&app).as_deref(), refusal);
		sink.emit(ClaudeEvent::Failed {
			error: TransportError::ResumeFailed { forgot_session_id },
		});
	}

	let session = Arc::new(started.session);
	let handle = SessionHandle { resumed: session.resumed() };
	// The participant let this run go while the start was in flight — the host began
	// quitting, or something else took the seat. Installing now would hand a
	// departing host a child that nothing left running will ever shut down, so the
	// fresh one is ended here instead: at most one live session per bot and no
	// orphan group, by construction rather than by luck. Asked inside the install rather than before it, because a
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

/// The unguarded primitive, for one participant. The lifecycle gate belongs to the
/// command layer, so reaching this directly is reserved for a caller that already
/// holds the claim — or a test standing in for one.
pub async fn shutdown_session(state: &ClaudeState, scope: &RuntimeScope) {
	let session = state.live.clear(scope);
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
/// Every live runtime, not the reader's last one: a bot the reader walked away from
/// is still answering, and a quit that ended one of several would leave the rest as
/// orphans. They are ended side by side rather than one after another — the grace
/// each child is given is a bound on the whole quit that way, instead of a bound
/// multiplied by however many bots were running.
///
/// The sweep runs whether or not a session was reachable: a start that has not
/// returned yet is not in the state and has a live process group all the same.
pub async fn terminate_session(state: &ClaudeState) {
	state.enter_quit();
	// Every run and its child are given up together: the host stands for nothing
	// from here on, so nothing a dying child still has to say reaches a frontend
	// that is going away with it, and a start still building one finds no seat to
	// install into when it comes back.
	let ending: Vec<_> = state
		.live
		.clear_all()
		.into_iter()
		.map(|session| tauri::async_runtime::spawn(async move { session.terminate().await }))
		.collect();
	for termination in ending {
		let _ = termination.await;
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
	let _claim = state.claim(participant(&scope))?;
	if state.live.is_foreign(&scope) {
		return Err(stale(&scope));
	}
	shutdown_session(&state, &scope).await;
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

	/// A directory the bot names and the machine still has is where its child runs,
	/// whatever the caller would have picked.
	#[test]
	fn a_bot_that_names_a_directory_runs_in_it() {
		let asked = std::env::temp_dir();
		let (running_in, refused) = where_it_runs(
			Some(asked.to_string_lossy().into_owned()),
			PathBuf::from("/somewhere/else"),
		);

		assert_eq!(running_in, asked);
		assert_eq!(refused, None, "a directory that is there was refused");
	}

	/// A bot naming nothing — and one naming only spaces, which is what an emptied
	/// field can leave behind — is started exactly where one was started before a
	/// bot could name a directory at all.
	#[test]
	fn a_bot_that_names_none_runs_where_one_always_did() {
		let anywhere = PathBuf::from("/somewhere/else");
		for nothing in [None, Some(String::new()), Some("   ".to_owned())] {
			let (running_in, refused) = where_it_runs(nothing, anywhere.clone());
			assert_eq!(running_in, anywhere);
			assert_eq!(refused, None);
		}
	}

	/// The directory is gone — renamed, unmounted, deleted since the bot was
	/// described. The run still happens, and the reader is told which directory it
	/// did not happen in.
	#[test]
	fn a_directory_that_is_gone_is_reported_and_the_run_happens_anyway() {
		let anywhere = std::env::temp_dir();
		let missing = anywhere.join("opennest-no-such-directory-3f2b");
		let _ = std::fs::remove_dir_all(&missing);

		let (running_in, refused) =
			where_it_runs(Some(missing.to_string_lossy().into_owned()), anywhere.clone());

		assert_eq!(running_in, anywhere, "a missing directory left the reader without a process");
		assert_eq!(refused.as_deref(), Some(redact::path(&missing).as_str()));
	}

	/// A file is not a directory, and a child cannot be started in one.
	#[test]
	fn a_path_that_is_not_a_directory_is_refused_like_one_that_is_gone() {
		let anywhere = std::env::temp_dir();
		let file = anywhere.join("opennest-not-a-directory-3f2b");
		std::fs::write(&file, b"i am a file").expect("the file is written");

		let (running_in, refused) =
			where_it_runs(Some(file.to_string_lossy().into_owned()), anywhere.clone());

		assert_eq!(running_in, anywhere);
		assert_eq!(refused.as_deref(), Some(redact::path(&file).as_str()));
		std::fs::remove_file(&file).expect("cleanup");
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

	/// Another bot, in a chat of its own: a whole other participant, and the run this
	/// host may hold at the same time as the first.
	fn another_bots_run() -> RuntimeScope {
		RuntimeScope {
			conversation_id: "c2".into(),
			bot_id: "b2".into(),
			runtime_session_id: "r9".into(),
			epoch: 1,
		}
	}

	const ANOTHER_BOTS_SESSION: &str = "the session of the bot next door";

	fn is_stale(outcome: &Result<&str, TransportError>) -> bool {
		matches!(outcome, Err(TransportError::StaleRuntimeSession { .. }))
	}

	fn is_unheld(outcome: &Result<&str, TransportError>) -> bool {
		matches!(outcome, Err(TransportError::NotStarted))
	}

	/// A scope names a participant and a run of it. Differing on the run — the same
	/// lineage a turn later — is a caller the participant has moved past, and it is
	/// told so. Differing on the participant is not a disagreement at all: it names
	/// a bot this one knows nothing about, and the one thing it may never be handed
	/// is the session in front of it.
	#[test]
	fn a_scope_differing_on_the_run_is_stale_and_one_naming_another_bot_is_not_held() {
		let live = Live::<&str>::default();
		live.take_over(a_scope());
		live.install(&a_scope(), REPLACED_SESSION);

		assert!(live.holds(&a_scope()), "the host stopped recognising the run it holds");
		assert!(!live.is_foreign(&a_scope()), "the live run was refused as somebody else's");
		for other in [
			RuntimeScope { epoch: 2, ..a_scope() },
			RuntimeScope { runtime_session_id: "r2".into(), ..a_scope() },
		] {
			assert!(
				live.is_foreign(&other),
				"a run the participant had moved past was taken for the live one: {other:?}"
			);
			assert!(!live.holds(&other), "a run the host never held was taken for it: {other:?}");
			assert!(
				is_stale(&live.session_for(&other)),
				"a run the host never held was handed the session it is holding: {other:?}"
			);
		}
		for other in [
			RuntimeScope { bot_id: "b2".into(), ..a_scope() },
			RuntimeScope { conversation_id: "c2".into(), ..a_scope() },
		] {
			assert!(
				!live.holds(&other),
				"another participant's run was taken for this one: {other:?}"
			);
			assert!(
				!live.is_foreign(&other),
				"a participant with no run of its own was refused as a stale one: {other:?}"
			);
			assert!(
				is_unheld(&live.session_for(&other)),
				"a bot with no session of its own was handed another's: {other:?}"
			);
		}
	}

	/// The whole point of keying by participant: a second bot is a second live child,
	/// and each caller reaches its own. Neither start disturbs the other — no session
	/// is handed back to be shut down, and both keep answering.
	#[test]
	fn two_bots_each_hold_their_own_session_at_the_same_time() {
		let live = Live::<&str>::default();

		assert_eq!(live.take_over(a_scope()), None);
		assert!(live.install(&a_scope(), REPLACED_SESSION));
		assert_eq!(
			live.take_over(another_bots_run()),
			None,
			"starting one bot handed back another bot's child to be shut down"
		);
		assert!(live.install(&another_bots_run(), ANOTHER_BOTS_SESSION));

		assert_eq!(live.session_for(&a_scope()).ok(), Some(REPLACED_SESSION));
		assert_eq!(live.session_for(&another_bots_run()).ok(), Some(ANOTHER_BOTS_SESSION));
		assert!(live.holds(&a_scope()) && live.holds(&another_bots_run()));

		assert_eq!(live.clear(&a_scope()), Some(REPLACED_SESSION));
		assert!(
			live.holds(&another_bots_run()),
			"ending one bot's run ended the run of the bot beside it"
		);
		assert_eq!(
			live.session_for(&another_bots_run()).ok(),
			Some(ANOTHER_BOTS_SESSION),
			"a bot lost its own session when another bot's was shut down"
		);
	}

	/// The exit is the one caller whose business is every participant at once: what
	/// it hands back is every child still running, and what it leaves behind is a
	/// host holding none of them.
	#[test]
	fn the_exit_gives_up_every_bots_child_at_once() {
		let live = Live::<&str>::default();
		live.take_over(a_scope());
		live.install(&a_scope(), REPLACED_SESSION);
		live.take_over(another_bots_run());
		live.install(&another_bots_run(), ANOTHER_BOTS_SESSION);
		// A run whose child never came up. It is on the record and has nothing to end.
		live.take_over(RuntimeScope {
			conversation_id: "c3".into(),
			bot_id: "b3".into(),
			..a_scope()
		});

		let mut ended = live.clear_all();
		ended.sort_unstable();
		assert_eq!(
			ended,
			vec![ANOTHER_BOTS_SESSION, REPLACED_SESSION],
			"the exit left a live child behind"
		);
		assert!(!live.holds(&a_scope()) && !live.holds(&another_bots_run()));
		assert!(
			is_unheld(&live.session_for(&another_bots_run())),
			"a command reached a session after the exit gave it up"
		);
	}

	/// The handover, and the silence after it: the replaced run is refused from the
	/// moment its successor is named, and once the participant holds nothing at all
	/// there is no other run left for a late caller to reach past.
	#[test]
	fn a_replaced_run_is_refused_and_a_participant_holding_none_refuses_nobody() {
		let replaced = a_scope();
		let live = Live::<&str>::default();
		live.take_over(replaced.clone());

		live.take_over(the_next_run());
		assert!(live.is_foreign(&replaced), "a replaced run still reached the host");

		live.clear(&replaced);
		assert!(
			!live.is_foreign(&replaced),
			"a participant holding no run refused a caller anyway"
		);
		assert!(!live.holds(&replaced), "a participant holding no run claimed to hold one");
	}

	/// The interleaving a two-step check let through, written out in the order it
	/// happens: a caller reads which run the participant is holding, a whole handover
	/// lands, and only then does it reach for the session. The second answer alone has
	/// to refuse it — read from a slot of its own instead, it hands the replacement to
	/// a caller that asked about the run before it, which is a cancel, an approval or
	/// a prompt landing on the process that took over.
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

	/// The other half of the coupling: a child is only ever the child of the run its
	/// participant stands for. A start that comes back to a participant which has let
	/// its run go — the exit is the one that does that — installs nothing, and is
	/// told so, because a child nobody holds has to be ended by whoever built it.
	#[test]
	fn a_child_built_for_a_run_the_host_has_left_is_never_installed() {
		let live = Live::<&str>::default();
		live.take_over(a_scope());

		live.clear_all();

		assert!(
			!live.install(&a_scope(), REPLACED_SESSION),
			"a start installed its child into a host that had let its run go"
		);
		assert!(
			matches!(live.session_for(&a_scope()), Err(TransportError::NotStarted)),
			"a host standing for no run answered with a session all the same"
		);
	}

	/// The gate is the participant's, not the host's: one bot restarting must not
	/// keep another from coming up, and one bot may still only be in one transition
	/// at a time.
	#[test]
	fn a_transition_holds_one_bot_and_lets_every_other_bot_through() {
		let state = ClaudeState::default();

		let held = state.claim(participant(&a_scope())).expect("the first claim is free");
		assert!(
			matches!(
				state.claim(participant(&the_next_run())),
				Err(TransportError::TransitionInProgress)
			),
			"one bot took two transitions at once"
		);
		assert!(
			state.claim(participant(&another_bots_run())).is_ok(),
			"one bot's transition refused another bot's"
		);

		drop(held);
		assert!(state.claim(participant(&a_scope())).is_ok(), "a spent transition kept its seat");
	}

	/// The quit is absorbing and reaches every participant: nothing starts after it,
	/// whichever bot asks.
	#[test]
	fn nothing_starts_for_any_bot_once_the_host_is_quitting() {
		let state = ClaudeState::default();
		state.enter_quit();

		for scope in [a_scope(), another_bots_run()] {
			assert!(
				matches!(
					state.claim(participant(&scope)),
					Err(TransportError::TransitionInProgress)
				),
				"a start was let through after the quit: {scope:?}"
			);
		}
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
