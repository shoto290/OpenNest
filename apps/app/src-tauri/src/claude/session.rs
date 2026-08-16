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
const SHUTDOWN_GRACE: Duration = Duration::from_secs(3);
const TERMINATE_GRACE: Duration = Duration::from_millis(500);

pub trait EventSink: Send + Sync + 'static {
	fn emit(&self, event: ClaudeEvent);
}

impl EventSink for mpsc::UnboundedSender<ClaudeEvent> {
	fn emit(&self, event: ClaudeEvent) {
		let _ = self.send(event);
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
	stdin_tx: mpsc::UnboundedSender<Value>,
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
		tokio::spawn(read_loop(stdout, shared.clone(), pending.clone(), sink.clone(), child.clone()));

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
				let code = wait_code(&self.child).await;
				Err(TransportError::Crashed { code, detail: Some("exited during startup".into()) })
			}
			Err(_) => {
				self.kill().await;
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
		self.stdin_tx
			.send(frame)
			.map_err(|_| TransportError::WriteFailed { detail: "stdin closed".into() })
	}

	pub async fn submit_prompt(&self, text: &str) -> Result<(), TransportError> {
		let entering = {
			let mut shared = self.shared.lock().await;
			if matches!(shared.turn, TurnState::Submitting | TurnState::Running | TurnState::Stopping) {
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

	/// Closes stdin, then escalates to the whole process group so no Claude
	/// child survives the shutdown.
	pub async fn shutdown(&self) {
		self.shared.lock().await.shutting_down = true;
		self.kill().await;
	}

	/// The bounded counterpart of [`Session::shutdown`], for a host that is
	/// already quitting. It skips the stdin handshake and never waits for
	/// reaping: blocking a quitting app for seconds risks the platform killing
	/// it before the escalation lands, which would leave behind exactly the
	/// orphan this call exists to prevent. `SIGKILL` needs no witness.
	pub async fn terminate(&self) {
		self.shared.lock().await.shutting_down = true;

		let mut slot = self.child.lock().await;
		let Some(child) = slot.as_mut() else { return };

		signal_group(self.pid, Signal::Term);
		let _ = tokio::time::timeout(TERMINATE_GRACE, child.wait()).await;
		signal_group(self.pid, Signal::Kill);
		*slot = None;
	}

	async fn kill(&self) {
		let mut slot = self.child.lock().await;
		let Some(child) = slot.as_mut() else { return };

		drop(child.stdin.take());
		if tokio::time::timeout(SHUTDOWN_GRACE, child.wait()).await.is_ok() {
			*slot = None;
			return;
		}

		signal_group(self.pid, Signal::Term);
		if tokio::time::timeout(SHUTDOWN_GRACE, child.wait()).await.is_ok() {
			*slot = None;
			return;
		}

		signal_group(self.pid, Signal::Kill);
		let _ = child.wait().await;
		*slot = None;
	}
}

/// Leaves the handle in place: the read loop and a failed handshake both want
/// the exit code, and `wait` on an already-reaped child returns the cached
/// status. Clearing the slot is `kill`'s job.
async fn wait_code(child: &Arc<Mutex<Option<Child>>>) -> Option<i32> {
	let mut slot = child.lock().await;
	let handle = slot.as_mut()?;
	handle.wait().await.ok().and_then(|status| status.code())
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
				error: TransportError::InvalidFrame { detail: format!("unreadable frame at line {index}") },
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
				TurnState::Submitting if is_turn_activity(&frame) => guard.set_turn(TurnState::Running),
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
	on_exit(shared, sink, child).await;
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

async fn on_exit(shared: Arc<Mutex<Shared>>, sink: Arc<dyn EventSink>, child: Arc<Mutex<Option<Child>>>) {
	let failing = {
		let mut guard = shared.lock().await;
		if guard.shutting_down {
			return;
		}
		guard.set_turn(TurnState::Failed)
	};

	let code = wait_code(&child).await;

	sink.emit(ClaudeEvent::ConnectionChanged { state: ConnectionState::Crashed });
	sink.emit(ClaudeEvent::Failed {
		error: TransportError::Crashed { code, detail: Some("claude exited unexpectedly".into()) },
	});
	if let Some(event) = failing {
		sink.emit(event);
	}
}
