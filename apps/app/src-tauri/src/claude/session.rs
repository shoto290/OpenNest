//! Supervises one Claude Code child process over NDJSON stdin/stdout.
//!
//! stderr is drained and discarded, never forwarded and never logged: it is the
//! one channel that could carry an environment value, so it stops here.
//! Transport failures are reported through the typed contract instead.

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot, Mutex};

use super::contract::{
	ClaudeEvent, ConnectionState, PermissionDecision, TransportError, TurnOutcome, TurnState,
};
use super::protocol::{self, Frame};
use super::translate::Translator;

pub const DEFAULT_STARTUP_TIMEOUT: Duration = Duration::from_secs(30);
/// How long a child handed EOF is given to leave on its own before the ladder
/// escalates. Public so a test can tell "the child took the EOF" apart from
/// "the escalation had to reach it".
pub const SHUTDOWN_GRACE: Duration = Duration::from_secs(3);
const TERMINATE_GRACE: Duration = Duration::from_millis(500);
/// A child that closed its stdout has all but always exited, so this is only
/// ever spent on one that has not — and no exit code is worth the child lock it
/// would otherwise hold forever.
const EXIT_CODE_GRACE: Duration = Duration::from_millis(500);

pub trait EventSink: Send + Sync + 'static {
	fn emit(&self, event: ClaudeEvent);
}

impl EventSink for mpsc::UnboundedSender<ClaudeEvent> {
	fn emit(&self, event: ClaudeEvent) {
		let _ = self.send(event);
	}
}

enum Gate {
	Buffering(Vec<ClaudeEvent>),
	Forwarding,
	Discarding,
}

/// Holds back what an attempt emits until the attempt is known to have worked.
/// A start that is allowed a second try is not a failure yet, and the reader is
/// owed the outcome rather than the first draft of it.
///
/// The gate is a `std::sync::Mutex` on purpose: `emit` is synchronous and is
/// called from inside the read loop, where awaiting a lock would stall the very
/// task feeding it.
pub struct GatedSink {
	inner: Arc<dyn EventSink>,
	gate: std::sync::Mutex<Gate>,
}

impl GatedSink {
	pub fn new(inner: Arc<dyn EventSink>) -> Self {
		Self { inner, gate: std::sync::Mutex::new(Gate::Buffering(Vec::new())) }
	}

	/// Flushes under the lock, so an event arriving mid-flush queues behind the
	/// buffer instead of overtaking it.
	pub fn promote(&self) {
		let mut gate = self.gate.lock().expect("gate");
		if let Gate::Buffering(buffered) = std::mem::replace(&mut *gate, Gate::Forwarding) {
			for event in buffered {
				self.inner.emit(event);
			}
		}
	}

	/// Keeps swallowing afterwards: the attempt is spent, but the child behind
	/// it is still dying and still emitting.
	pub fn discard(&self) {
		*self.gate.lock().expect("gate") = Gate::Discarding;
	}
}

impl EventSink for GatedSink {
	fn emit(&self, event: ClaudeEvent) {
		let mut gate = self.gate.lock().expect("gate");
		match &mut *gate {
			Gate::Buffering(buffered) => buffered.push(event),
			Gate::Forwarding => self.inner.emit(event),
			Gate::Discarding => {}
		}
	}
}

#[derive(Debug, Clone)]
pub struct SessionOptions {
	pub binary: PathBuf,
	pub cwd: PathBuf,
	pub resume: Option<String>,
	pub startup_timeout: Duration,
	/// Extra variables handed to the child only. The ambient environment is
	/// inherited untouched so Claude Code can reach its own credential store.
	pub extra_env: Vec<(String, String)>,
}

impl SessionOptions {
	pub fn new(binary: PathBuf, cwd: PathBuf) -> Self {
		Self {
			binary,
			cwd,
			resume: None,
			startup_timeout: DEFAULT_STARTUP_TIMEOUT,
			extra_env: Vec::new(),
		}
	}

	pub fn resuming(mut self, session_id: Option<String>) -> Self {
		self.resume = session_id;
		self
	}

	pub fn with_env(mut self, key: &str, value: impl Into<String>) -> Self {
		self.extra_env.push((key.to_owned(), value.into()));
		self
	}

	fn args(&self) -> Vec<String> {
		let mut args = vec![
			"-p".into(),
			"--input-format".into(),
			"stream-json".into(),
			"--output-format".into(),
			"stream-json".into(),
			"--verbose".into(),
			"--include-partial-messages".into(),
			"--permission-prompt-tool".into(),
			"stdio".into(),
		];
		if let Some(session_id) = &self.resume {
			args.push("--resume".into());
			args.push(session_id.clone());
		}
		args
	}
}

type PendingControls = Arc<Mutex<HashMap<String, oneshot::Sender<()>>>>;

/// Optional only so a shutdown can drop the sender: closing this channel is what
/// makes `write_loop` release the child's stdin, and that release is the EOF the
/// child needs to exit on its own. Nothing else can deliver it — the handle was
/// moved out of `Child` at startup.
type StdinChannel = std::sync::Mutex<Option<mpsc::UnboundedSender<Value>>>;

struct Shared {
	translator: Translator,
	turn: TurnState,
	shutting_down: bool,
}

impl Shared {
	/// The single place a turn changes state, so every transition emits exactly
	/// one event and a no-op transition emits none.
	fn set_turn(&mut self, next: TurnState) -> Option<ClaudeEvent> {
		if self.turn == next {
			return None;
		}
		self.turn = next;
		Some(ClaudeEvent::TurnChanged { state: next })
	}
}

pub struct Session {
	stdin_tx: StdinChannel,
	shared: Arc<Mutex<Shared>>,
	pending: PendingControls,
	child: Arc<Mutex<Option<Child>>>,
	sink: Arc<dyn EventSink>,
	pid: u32,
	resumed: bool,
}

impl Session {
	pub async fn start(
		options: SessionOptions,
		sink: Arc<dyn EventSink>,
	) -> Result<Self, TransportError> {
		let resumed = options.resume.is_some();
		let mut child = spawn(&options)?;

		let stdin = child.stdin.take().expect("stdin piped");
		let stdout = child.stdout.take().expect("stdout piped");
		let stderr = child.stderr.take().expect("stderr piped");
		let pid = child.id().unwrap_or_default();
		remember_group(pid);

		let shared = Arc::new(Mutex::new(Shared {
			translator: Translator::new(resumed),
			turn: TurnState::Idle,
			shutting_down: false,
		}));
		let pending: PendingControls = Arc::new(Mutex::new(HashMap::new()));
		let child = Arc::new(Mutex::new(Some(child)));

		let (stdin_tx, stdin_rx) = mpsc::unbounded_channel::<Value>();
		tokio::spawn(write_loop(stdin, stdin_rx));
		tokio::spawn(discard_stderr(stderr));
		tokio::spawn(read_loop(
			stdout,
			shared.clone(),
			pending.clone(),
			sink.clone(),
			child.clone(),
			pid,
		));

		let stdin_tx = StdinChannel::new(Some(stdin_tx));
		let session = Self { stdin_tx, shared, pending, child, sink, pid, resumed };
		session.handshake(options.startup_timeout).await?;
		Ok(session)
	}

	pub fn resumed(&self) -> bool {
		self.resumed
	}

	pub fn pid(&self) -> u32 {
		self.pid
	}

	pub async fn session_id(&self) -> Option<String> {
		self.shared.lock().await.translator.session_id().map(str::to_owned)
	}

	pub async fn turn_state(&self) -> TurnState {
		self.shared.lock().await.turn
	}

	async fn handshake(&self, timeout: Duration) -> Result<(), TransportError> {
		let request_id = format!("opennest-init-{}", uuid::Uuid::new_v4());
		let ack = self.expect_control(&request_id).await;
		self.write(protocol::initialize_request(&request_id))?;

		match tokio::time::timeout(timeout, ack).await {
			Ok(Ok(())) => Ok(()),
			Ok(Err(_)) => {
				let code = wait_code(&self.child, self.pid).await;
				// The child is gone, but a start reaches this far only after it
				// has had time to spawn its own children, and reaping it never
				// reaches those.
				self.shutdown().await;
				Err(TransportError::Crashed { code, detail: Some("exited during startup".into()) })
			}
			Err(_) => {
				self.shutdown().await;
				Err(TransportError::StartupTimeout { timeout_ms: timeout.as_millis() as u64 })
			}
		}
	}

	async fn expect_control(&self, request_id: &str) -> oneshot::Receiver<()> {
		let (tx, rx) = oneshot::channel();
		self.pending.lock().await.insert(request_id.to_owned(), tx);
		rx
	}

	fn write(&self, frame: Value) -> Result<(), TransportError> {
		let delivered = self
			.stdin_tx
			.lock()
			.expect("stdin channel")
			.as_ref()
			.is_some_and(|tx| tx.send(frame).is_ok());

		delivered
			.then_some(())
			.ok_or_else(|| TransportError::WriteFailed { detail: "stdin closed".into() })
	}

	fn close_stdin(&self) {
		self.stdin_tx.lock().expect("stdin channel").take();
	}

	pub async fn submit_prompt(&self, text: &str) -> Result<(), TransportError> {
		let entering = {
			let mut shared = self.shared.lock().await;
			if matches!(
				shared.turn,
				TurnState::Submitting | TurnState::Running | TurnState::Stopping
			) {
				return Err(TransportError::TurnAlreadyRunning);
			}
			shared.set_turn(TurnState::Submitting)
		};
		self.emit(entering);
		self.write(protocol::user_message(text))
	}

	pub async fn cancel_turn(&self) -> Result<(), TransportError> {
		let stopping = {
			let mut shared = self.shared.lock().await;
			if !matches!(shared.turn, TurnState::Submitting | TurnState::Running) {
				return Err(TransportError::NoActiveTurn);
			}
			shared.translator.mark_cancelling();
			shared.set_turn(TurnState::Stopping)
		};
		self.emit(stopping);

		let request_id = format!("opennest-interrupt-{}", uuid::Uuid::new_v4());
		self.write(protocol::interrupt_request(&request_id))
	}

	pub async fn respond_to_permission(
		&self,
		id: &str,
		decision: PermissionDecision,
	) -> Result<(), TransportError> {
		let input = {
			let mut shared = self.shared.lock().await;
			shared
				.translator
				.take_permission_input(id)
				.ok_or_else(|| TransportError::UnknownPermission { id: id.to_owned() })?
		};

		let frame = match decision {
			PermissionDecision::AllowOnce => protocol::allow_response(id, &input),
			PermissionDecision::Deny => protocol::deny_response(id, "User denied this action."),
		};
		self.write(frame)?;
		self.sink.emit(ClaudeEvent::PermissionResolved { id: id.to_owned(), decision });
		Ok(())
	}

	fn emit(&self, event: Option<ClaudeEvent>) {
		if let Some(event) = event {
			self.sink.emit(event);
		}
	}

	/// Hands the child EOF first and only escalates on a child that ignores it,
	/// up to the whole process group so no Claude child survives. The group is
	/// swept either way: a clean exit reaps the child, never the grandchildren it
	/// left behind, and those are the orphans this call exists to prevent.
	///
	/// Every rung is bounded, the last one included: a group signal reaches
	/// nothing on a child that left the group, and nothing at all on a platform
	/// that has no groups. An unbounded wait there would hold the child lock for
	/// good, and with it the command that owns the shutdown.
	///
	/// The dying child is disowned here rather than by the caller, because a
	/// failed start ends this way too and the reader is owed one account of it:
	/// the read loop reaching `on_exit` on a session nobody is shutting down
	/// reports a crash of its own, on a different task, and which of the two
	/// lands first is a race.
	pub async fn shutdown(&self) {
		self.shared.lock().await.shutting_down = true;
		self.close_stdin();

		let mut slot = self.child.lock().await;
		let Some(child) = slot.as_mut() else { return };

		if tokio::time::timeout(SHUTDOWN_GRACE, child.wait()).await.is_err() {
			signal_group(self.pid, Signal::Term);
			if tokio::time::timeout(SHUTDOWN_GRACE, child.wait()).await.is_err() {
				signal_group(self.pid, Signal::Kill);
				let _ = tokio::time::timeout(SHUTDOWN_GRACE, child.wait()).await;
			}
		}

		sweep_group(self.pid);
		*slot = None;
	}

	/// The short counterpart of [`Session::shutdown`], for a host that is
	/// already quitting. It hands the child EOF without ever waiting to see it
	/// taken, and never waits for reaping: blocking a quitting app for seconds
	/// risks the platform killing it before the escalation lands, which would
	/// leave behind exactly the orphan this call exists to prevent. `SIGKILL`
	/// needs no witness.
	pub async fn terminate(&self) {
		self.shared.lock().await.shutting_down = true;
		// Before the child lock, never after: whoever holds it is waiting on a
		// child that may itself be waiting for this.
		self.close_stdin();

		let mut slot = self.child.lock().await;
		let Some(child) = slot.as_mut() else { return };

		// A reaped child no longer vouches for its pid, and the system may have
		// handed that pid to somebody else by now.
		if !matches!(child.try_wait(), Ok(Some(_))) {
			signal_group(self.pid, Signal::Term);
			let _ = tokio::time::timeout(TERMINATE_GRACE, child.wait()).await;
		}
		sweep_group(self.pid);
		*slot = None;
	}
}

/// Every process group this run has spawned and not yet swept. A session only
/// becomes reachable through the app's state once its handshake has returned,
/// and the host quits through `std::process::exit`, which runs no destructor —
/// so for the length of a startup nothing else knows the group exists.
static LIVE_GROUPS: std::sync::Mutex<Vec<u32>> = std::sync::Mutex::new(Vec::new());

fn remember_group(pid: u32) {
	LIVE_GROUPS.lock().expect("live groups").push(pid);
}

/// The one place a group is signalled for good, so it stops being tracked in
/// the same breath: the system reuses pids, and a stale one left on the list
/// would hand a later sweep somebody else's processes. Only whoever takes it off
/// the list signals it, which is what keeps a second sweep of the same pid from
/// reaching whoever holds it by then.
fn sweep_group(pid: u32) {
	if forget_group(pid) {
		signal_group(pid, Signal::Kill);
	}
}

/// Answers whether this call is the one that dropped the group.
fn forget_group(pid: u32) -> bool {
	let mut live = LIVE_GROUPS.lock().expect("live groups");
	let Some(index) = live.iter().position(|entry| *entry == pid) else {
		return false;
	};
	live.swap_remove(index);
	true
}

/// Sweeps what the host's exit would otherwise abandon, a session still
/// starting up included.
pub fn sweep_live_groups() {
	let live = std::mem::take(&mut *LIVE_GROUPS.lock().expect("live groups"));
	for pid in live {
		signal_group(pid, Signal::Kill);
	}
}

/// The groups a sweep would still reach. Public because the list is otherwise
/// only observable by signalling it, and a test proving a reaped group stops
/// being tracked cannot afford to.
pub fn live_groups() -> Vec<u32> {
	LIVE_GROUPS.lock().expect("live groups").clone()
}

/// Leaves the handle in place: the read loop and a failed handshake both want
/// the exit code, and `wait` on an already-reaped child returns the cached
/// status. Clearing the slot is the shutdown's job.
///
/// The group is not left in place. Reaping is what frees the pid for the system
/// to hand out again, so this is the last moment the group is still
/// unmistakably this session's — and the grandchildren the reaping never
/// reached are still in it.
///
/// Bounded because both callers reach here on stdout EOF, which says the child
/// stopped talking and nothing about whether it stopped running. Waiting on one
/// that kept running would hold the child lock for good, and the shutdown that
/// needs that lock is the only thing left that could end it.
async fn wait_code(child: &Arc<Mutex<Option<Child>>>, pid: u32) -> Option<i32> {
	let mut slot = child.lock().await;
	let handle = slot.as_mut()?;
	let waited = tokio::time::timeout(EXIT_CODE_GRACE, handle.wait()).await.ok()?;
	sweep_group(pid);
	waited.ok().and_then(|status| status.code())
}

fn spawn(options: &SessionOptions) -> Result<Child, TransportError> {
	let mut command = Command::new(&options.binary);
	command
		.args(options.args())
		.envs(options.extra_env.iter().map(|(key, value)| (key.as_str(), value.as_str())))
		.current_dir(&options.cwd)
		.stdin(Stdio::piped())
		.stdout(Stdio::piped())
		.stderr(Stdio::piped())
		.kill_on_drop(true);

	#[cfg(unix)]
	command.process_group(0);

	command.spawn().map_err(|error| TransportError::SpawnFailed { detail: error.to_string() })
}

enum Signal {
	Term,
	Kill,
}

#[cfg(unix)]
fn signal_group(pid: u32, signal: Signal) {
	if pid == 0 {
		return;
	}
	let number = match signal {
		Signal::Term => libc::SIGTERM,
		Signal::Kill => libc::SIGKILL,
	};
	unsafe { libc::killpg(pid as libc::pid_t, number) };
}

#[cfg(not(unix))]
fn signal_group(_pid: u32, _signal: Signal) {}

async fn write_loop(mut stdin: tokio::process::ChildStdin, mut rx: mpsc::UnboundedReceiver<Value>) {
	while let Some(frame) = rx.recv().await {
		let mut line = frame.to_string();
		line.push('\n');
		if stdin.write_all(line.as_bytes()).await.is_err() || stdin.flush().await.is_err() {
			return;
		}
	}
}

/// Read so the pipe never fills, then thrown away unread.
async fn discard_stderr(mut stderr: tokio::process::ChildStderr) {
	let _ = tokio::io::copy(&mut stderr, &mut tokio::io::sink()).await;
}

async fn read_loop(
	stdout: tokio::process::ChildStdout,
	shared: Arc<Mutex<Shared>>,
	pending: PendingControls,
	sink: Arc<dyn EventSink>,
	child: Arc<Mutex<Option<Child>>>,
	pid: u32,
) {
	let mut lines = BufReader::new(stdout).lines();
	let mut index: u64 = 0;

	while let Ok(Some(line)) = lines.next_line().await {
		index += 1;
		if line.trim().is_empty() {
			continue;
		}

		let Ok(frame) = serde_json::from_str::<Frame>(&line) else {
			sink.emit(ClaudeEvent::Failed {
				error: TransportError::InvalidFrame {
					detail: format!("unreadable frame at line {index}"),
				},
			});
			continue;
		};

		if let Frame::ControlResponse(response) = &frame {
			if let Some(request_id) = &response.response.request_id {
				if let Some(ack) = pending.lock().await.remove(request_id) {
					let _ = ack.send(());
				}
			}
		}

		let (entering, events, ending) = {
			let mut guard = shared.lock().await;
			let entering = match guard.turn {
				TurnState::Submitting if is_turn_activity(&frame) => {
					guard.set_turn(TurnState::Running)
				}
				_ => None,
			};
			let events = guard.translator.ingest(frame);
			let ending = turn_outcome(&events).and_then(|outcome| guard.set_turn(outcome.into()));
			(entering, events, ending)
		};

		for event in entering.into_iter().chain(events).chain(ending) {
			sink.emit(event);
		}
	}

	// Dropping the acks turns any in-flight control request into a failure
	// instead of leaving the caller to time out on a process that is gone.
	pending.lock().await.clear();
	on_exit(shared, sink, child, pid).await;
}

impl From<TurnOutcome> for TurnState {
	fn from(outcome: TurnOutcome) -> Self {
		match outcome {
			TurnOutcome::Failed => TurnState::Failed,
			TurnOutcome::Completed | TurnOutcome::Cancelled => TurnState::Idle,
		}
	}
}

fn turn_outcome(events: &[ClaudeEvent]) -> Option<TurnOutcome> {
	events.iter().find_map(|event| match event {
		ClaudeEvent::TurnEnded { ended } => Some(ended.outcome),
		_ => None,
	})
}

fn is_turn_activity(frame: &Frame) -> bool {
	matches!(frame, Frame::StreamEvent(_) | Frame::Assistant(_) | Frame::ControlRequest(_))
}

async fn on_exit(
	shared: Arc<Mutex<Shared>>,
	sink: Arc<dyn EventSink>,
	child: Arc<Mutex<Option<Child>>>,
	pid: u32,
) {
	let failing = {
		let mut guard = shared.lock().await;
		if guard.shutting_down {
			return;
		}
		guard.set_turn(TurnState::Failed)
	};

	let code = wait_code(&child, pid).await;

	sink.emit(ClaudeEvent::ConnectionChanged { state: ConnectionState::Crashed });
	sink.emit(ClaudeEvent::Failed {
		error: TransportError::Crashed { code, detail: Some("claude exited unexpectedly".into()) },
	});
	if let Some(event) = failing {
		sink.emit(event);
	}
}
