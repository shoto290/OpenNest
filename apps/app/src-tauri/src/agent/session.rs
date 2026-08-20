//! One conversation, served by the shared agent sidecar.
//!
//! A session owns no process: it holds a lane on the one sidecar every session is
//! served from, writes commands into it, and reads the frames the sidecar routes
//! back. What ends a session is the lane closing — which happens when the sidecar
//! drops it, and when the sidecar itself dies.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use serde_json::Value;
use tokio::sync::{mpsc, oneshot, Mutex};

use super::contract::{
	AgentEvent, ConnectionState, PermissionDecision, TransportError, TurnOutcome, TurnState,
};
use super::protocol::{self, ClosedFrame, Frame, OpenRequest};
use super::sidecar::Sidecar;
use super::translate::Translator;

pub const DEFAULT_STARTUP_TIMEOUT: Duration = Duration::from_secs(30);

/// The capability a sidecar has to announce before the host asks it for deltas.
/// A build that does not name it is asked for whole messages only, and the reader
/// sees a reply arrive at once instead of a word at a time.
pub const PARTIAL_MESSAGES: &str = "partialMessages";

pub trait EventSink: Send + Sync + 'static {
	fn emit(&self, event: AgentEvent);
}

impl EventSink for mpsc::UnboundedSender<AgentEvent> {
	fn emit(&self, event: AgentEvent) {
		let _ = self.send(event);
	}
}

enum Gate {
	Buffering(Vec<AgentEvent>),
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

	/// Keeps swallowing afterwards: the attempt is spent, but the session behind
	/// it is still being taken down and still emitting.
	pub fn discard(&self) {
		*self.gate.lock().expect("gate") = Gate::Discarding;
	}
}

impl EventSink for GatedSink {
	fn emit(&self, event: AgentEvent) {
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
	pub cwd: PathBuf,
	pub resume: Option<String>,
	/// What the bot this session answers for was told to be, handed to the agent as
	/// an addition to its own system prompt. A session is given it once, when it is
	/// opened: there is no command that changes it afterwards, which is why editing
	/// it rotates the runtime instead of reaching into the one that is running.
	pub append_system_prompt: Option<String>,
	pub startup_timeout: Duration,
	/// Extra variables handed to the agent this session runs, and to it alone. The
	/// sidecar's own environment is left untouched.
	pub extra_env: Vec<(String, String)>,
}

impl SessionOptions {
	pub fn new(cwd: PathBuf) -> Self {
		Self {
			cwd,
			resume: None,
			append_system_prompt: None,
			startup_timeout: DEFAULT_STARTUP_TIMEOUT,
			extra_env: Vec::new(),
		}
	}

	pub fn resuming(mut self, session_id: Option<String>) -> Self {
		self.resume = session_id;
		self
	}

	/// A bot with nothing to say for itself is opened with no addition at all rather
	/// than with an empty one: an empty append is a value the agent has to read past,
	/// and a bot carrying only spaces has said nothing.
	pub fn instructed(mut self, instructions: Option<String>) -> Self {
		self.append_system_prompt = instructions.filter(|text| !text.trim().is_empty());
		self
	}

	pub fn with_env(mut self, key: &str, value: impl Into<String>) -> Self {
		self.extra_env.push((key.to_owned(), value.into()));
		self
	}

	pub fn open_request(&self, partial_messages: bool) -> OpenRequest {
		OpenRequest {
			cwd: self.cwd.to_string_lossy().into_owned(),
			resume: self.resume.clone(),
			append_system_prompt: self.append_system_prompt.clone(),
			partial_messages,
			env: self.extra_env.iter().cloned().collect(),
		}
	}
}

struct Shared {
	translator: Translator,
	turn: TurnState,
	shutting_down: bool,
}

impl Shared {
	/// The single place a turn changes state, so every transition emits exactly
	/// one event and a no-op transition emits none.
	fn set_turn(&mut self, next: TurnState) -> Option<AgentEvent> {
		if self.turn == next {
			return None;
		}
		self.turn = next;
		Some(AgentEvent::TurnChanged { state: next })
	}
}

pub struct Session {
	sidecar: Arc<Sidecar>,
	key: String,
	shared: Arc<Mutex<Shared>>,
	sink: Arc<dyn EventSink>,
	resumed: bool,
}

impl Session {
	pub async fn start(
		sidecar: Arc<Sidecar>,
		options: SessionOptions,
		sink: Arc<dyn EventSink>,
	) -> Result<Self, TransportError> {
		let resumed = options.resume.is_some();
		let key = uuid::Uuid::new_v4().to_string();
		let frames = sidecar.attach(&key);

		let shared = Arc::new(Mutex::new(Shared {
			translator: Translator::new(resumed),
			turn: TurnState::Idle,
			shutting_down: false,
		}));

		let (opened_tx, opened_rx) = oneshot::channel::<Result<(), TransportError>>();
		tokio::spawn(read_loop(frames, shared.clone(), sink.clone(), opened_tx));

		let request = options.open_request(sidecar.supports(PARTIAL_MESSAGES));
		let session = Self { sidecar, key, shared, sink, resumed };
		if let Err(error) = session.write(protocol::open_command(&session.key, &request)) {
			session.sidecar.detach(&session.key);
			return Err(error);
		}

		match tokio::time::timeout(options.startup_timeout, opened_rx).await {
			Ok(Ok(Ok(()))) => Ok(session),
			Ok(Ok(Err(error))) => {
				session.shutdown().await;
				Err(error)
			}
			Ok(Err(_)) => {
				session.shutdown().await;
				Err(TransportError::Crashed {
					code: None,
					detail: Some("the sidecar dropped the session during startup".into()),
				})
			}
			Err(_) => {
				session.shutdown().await;
				Err(TransportError::StartupTimeout {
					timeout_ms: options.startup_timeout.as_millis() as u64,
				})
			}
		}
	}

	pub fn resumed(&self) -> bool {
		self.resumed
	}

	pub async fn session_id(&self) -> Option<String> {
		self.shared.lock().await.translator.session_id().map(str::to_owned)
	}

	pub async fn turn_state(&self) -> TurnState {
		self.shared.lock().await.turn
	}

	fn write(&self, command: Value) -> Result<(), TransportError> {
		self.sidecar.send(command)
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
		self.write(protocol::prompt_command(&self.key, text))
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
		self.write(protocol::interrupt_command(&self.key))
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

		let command = match decision {
			PermissionDecision::AllowOnce => protocol::allow_command(&self.key, id, &input),
			PermissionDecision::Deny => {
				protocol::deny_command(&self.key, id, "User denied this action.")
			}
		};
		self.write(command)?;
		self.sink.emit(AgentEvent::PermissionResolved { id: id.to_owned(), decision });
		Ok(())
	}

	fn emit(&self, event: Option<AgentEvent>) {
		if let Some(event) = event {
			self.sink.emit(event);
		}
	}

	/// Ends the session on the sidecar and takes its lane away, so nothing it is
	/// still emitting is read afterwards. The sidecar process itself outlives this:
	/// it serves every other session too, and taking it down is the quit's business
	/// rather than any one session's.
	///
	/// The one ending a session has, which is why a failed start ends this way too:
	/// disowning the lane is what keeps the start's error from racing an account of
	/// the same failure coming up the reader's channel.
	pub async fn shutdown(&self) {
		self.shared.lock().await.shutting_down = true;
		let _ = self.write(protocol::close_command(&self.key));
		self.sidecar.detach(&self.key);
	}
}

impl From<TurnOutcome> for TurnState {
	fn from(outcome: TurnOutcome) -> Self {
		match outcome {
			TurnOutcome::Failed => TurnState::Failed,
			TurnOutcome::Completed | TurnOutcome::Cancelled => TurnState::Idle,
		}
	}
}

fn turn_outcome(events: &[AgentEvent]) -> Option<TurnOutcome> {
	events.iter().find_map(|event| match event {
		AgentEvent::TurnEnded { ended } => Some(ended.outcome),
		_ => None,
	})
}

fn is_turn_activity(frame: &Frame) -> bool {
	matches!(frame, Frame::StreamEvent(_) | Frame::Assistant(_) | Frame::ControlRequest(_))
}

fn crashed(closed: &ClosedFrame) -> TransportError {
	TransportError::Crashed { code: None, detail: closed.detail.clone() }
}

async fn read_loop(
	mut frames: mpsc::UnboundedReceiver<Value>,
	shared: Arc<Mutex<Shared>>,
	sink: Arc<dyn EventSink>,
	opened_tx: oneshot::Sender<Result<(), TransportError>>,
) {
	let mut opened_tx = Some(opened_tx);
	let mut seen: u64 = 0;

	while let Some(raw) = frames.recv().await {
		seen += 1;
		let Ok(frame) = serde_json::from_value::<Frame>(raw) else {
			sink.emit(AgentEvent::Failed {
				error: TransportError::InvalidFrame {
					detail: format!("unreadable frame {seen} of this session"),
				},
			});
			continue;
		};

		match &frame {
			Frame::Opened => {
				if let Some(tx) = opened_tx.take() {
					let _ = tx.send(Ok(()));
				}
				continue;
			}
			Frame::Closed(closed) => {
				if let Some(tx) = opened_tx.take() {
					let _ = tx.send(Err(crashed(closed)));
					return;
				}
				on_exit(shared, sink, Some(crashed(closed))).await;
				return;
			}
			_ => {}
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

	if let Some(tx) = opened_tx.take() {
		let _ = tx.send(Err(TransportError::Crashed {
			code: None,
			detail: Some("the sidecar exited during startup".into()),
		}));
		return;
	}
	on_exit(shared, sink, None).await;
}

async fn on_exit(
	shared: Arc<Mutex<Shared>>,
	sink: Arc<dyn EventSink>,
	reason: Option<TransportError>,
) {
	let failing = {
		let mut guard = shared.lock().await;
		if guard.shutting_down {
			return;
		}
		guard.set_turn(TurnState::Failed)
	};

	sink.emit(AgentEvent::ConnectionChanged { state: ConnectionState::Crashed });
	sink.emit(AgentEvent::Failed {
		error: reason.unwrap_or(TransportError::Crashed {
			code: None,
			detail: Some("the agent exited unexpectedly".into()),
		}),
	});
	if let Some(event) = failing {
		sink.emit(event);
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn options() -> SessionOptions {
		SessionOptions::new(PathBuf::from("/tmp"))
	}

	/// The bot's own instructions reach the agent as an addition to the Claude Code
	/// system prompt, never as a replacement for it.
	#[test]
	fn a_bot_with_instructions_opens_with_them_appended() {
		let told = options().instructed(Some("Answer briefly.".to_owned()));
		let request = told.open_request(true);
		assert_eq!(request.append_system_prompt.as_deref(), Some("Answer briefly."));
	}

	/// Nothing to say for itself is nothing on the wire either: a bot with no
	/// instructions is opened exactly as every bot was opened before there were any.
	#[test]
	fn a_bot_carrying_no_instructions_appends_nothing() {
		for nothing in [None, Some(String::new()), Some("  \n ".to_owned())] {
			let plain = options().instructed(nothing);
			assert_eq!(
				plain.open_request(true).append_system_prompt,
				None,
				"an empty addition reached the agent"
			);
		}
	}

	/// A sidecar that never announced deltas is never asked for them, so the reader
	/// is shown whole messages instead of a stream that would never arrive.
	#[test]
	fn a_sidecar_that_names_no_deltas_is_asked_for_whole_messages() {
		assert!(!options().open_request(false).partial_messages);
		assert!(options().open_request(true).partial_messages);
	}
}
