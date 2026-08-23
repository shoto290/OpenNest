//! One conversation, served by the shared agent sidecar.
//!
//! A session owns no process: it holds a lane on the one sidecar every session is
//! served from, writes commands into it, and reads the frames the sidecar routes
//! back. What ends a session is the lane closing — which happens when the sidecar
//! drops it, and when the sidecar itself dies.

use std::collections::HashMap;
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

/// The plugin bundle a bot runs as, and the agent inside it the main thread is
/// promoted to. The bundle carries what the bot was told, as the body of that
/// agent — see [`crate::bundles`].
///
/// Both travel on every spawn, a resume included: neither is sticky, and a resume
/// that re-passed neither would replay the conversation without ever loading the
/// bot again. A session is given them once, when it is opened, which is why editing
/// a bot rotates the runtime instead of reaching into the one that is running.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Bundle {
	pub path: String,
	/// The app's own plugin, loaded beside the bot's for the same session and never
	/// promoted — see `PLUGINS.md`. It rides with the bot's bundle because it only
	/// travels with one: a session opened without a bot loads no plugin at all.
	/// `None` is a host that has none on the disk to name.
	pub system_path: Option<String>,
	pub agent: String,
	/// Who the bot is, rendered by the host from the bot's own name and title — see
	/// [`crate::bundles::identity`]. The sentences are the app's text, so they travel
	/// on the open request and reach the prompt layer rather than sitting in the bot's
	/// bundle. It rides with the bundle because a session opened without one is a
	/// session with no bot to name.
	pub identity: String,
	/// How the bot writes its answers, as the bundle's own agent file carries it —
	/// see [`crate::bundles::output_style`]. It travels on the open request rather
	/// than in the file, because the agent format acts on none of it.
	pub output_style: String,
}

#[derive(Debug, Clone)]
pub struct SessionOptions {
	pub cwd: PathBuf,
	pub resume: Option<String>,
	pub bundle: Option<Bundle>,
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
			bundle: None,
			startup_timeout: DEFAULT_STARTUP_TIMEOUT,
			extra_env: Vec::new(),
		}
	}

	pub fn resuming(mut self, session_id: Option<String>) -> Self {
		self.resume = session_id;
		self
	}

	/// A bot whose bundle could not be written or read is opened as a session with no
	/// plugin and no agent at all, which is how every process was started before a bot
	/// could be described: the reader gets an agent rather than nothing.
	pub fn bundled(mut self, bundle: Option<Bundle>) -> Self {
		self.bundle = bundle;
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
			plugin_path: self.bundle.as_ref().map(|bundle| bundle.path.clone()),
			system_plugin_path: self.bundle.as_ref().and_then(|bundle| bundle.system_path.clone()),
			agent: self.bundle.as_ref().map(|bundle| bundle.agent.clone()),
			identity: self.bundle.as_ref().map(|bundle| bundle.identity.clone()),
			output_style: self.bundle.as_ref().map(|bundle| bundle.output_style.clone()),
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

	/// The tool input the ask was made on, taken once: whichever answer arrives
	/// first owns it, and a second one finds nothing pending under that id.
	async fn take_pending_input(&self, id: &str) -> Result<Value, TransportError> {
		let mut shared = self.shared.lock().await;
		shared
			.translator
			.take_permission_input(id)
			.ok_or_else(|| TransportError::UnknownPermission { id: id.to_owned() })
	}

	pub async fn respond_to_permission(
		&self,
		id: &str,
		decision: PermissionDecision,
	) -> Result<(), TransportError> {
		let input = self.take_pending_input(id).await?;

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

	/// The answer travels as the tool input the child would have run with, with the
	/// reader's replies written into it: the tool is allowed, and what it reads is
	/// what they said. Every string is carried as it was given — one label, several
	/// joined, or words typed instead.
	pub async fn answer_question(
		&self,
		id: &str,
		answers: HashMap<String, String>,
		annotations: Option<Value>,
	) -> Result<(), TransportError> {
		let input = self.take_pending_input(id).await?;

		let answered = answered_input(input, answers, annotations);
		self.write(protocol::allow_command(&self.key, id, &answered))?;
		self.sink.emit(AgentEvent::PermissionResolved {
			id: id.to_owned(),
			decision: PermissionDecision::AllowOnce,
		});
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

fn answered_input(
	input: Value,
	answers: HashMap<String, String>,
	annotations: Option<Value>,
) -> Value {
	let mut fields = match input {
		Value::Object(fields) => fields,
		_ => serde_json::Map::new(),
	};
	fields.insert("answers".to_owned(), serde_json::json!(answers));
	if let Some(annotations) = annotations {
		fields.insert("annotations".to_owned(), annotations);
	}
	Value::Object(fields)
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

	/// The bot reaches the agent as a bundle to load and an agent to be promoted to,
	/// and both are on the wire — a spawn that named one without the other would load
	/// a plugin nothing uses, or name an agent nothing defines.
	#[test]
	fn a_bot_opens_on_the_bundle_it_runs_as() {
		let bundle = Bundle {
			path: "/bots/b1".to_owned(),
			system_path: Some("/system/opennest".to_owned()),
			agent: "bean".to_owned(),
			identity: "You are Bean, the baker.".to_owned(),
			output_style: "Concise".to_owned(),
		};
		let request = options().bundled(Some(bundle)).open_request(true);

		assert_eq!(request.plugin_path.as_deref(), Some("/bots/b1"));
		assert_eq!(request.agent.as_deref(), Some("bean"));
		assert_eq!(request.identity.as_deref(), Some("You are Bean, the baker."));
	}

	/// Resuming re-passes both: neither survives a resume on its own, and a run that
	/// dropped them would replay the transcript with no bot loaded behind it.
	#[test]
	fn a_resumed_run_carries_the_bundle_again() {
		let bundle = Bundle {
			path: "/bots/b1".to_owned(),
			system_path: Some("/system/opennest".to_owned()),
			agent: "bean".to_owned(),
			identity: "You are Bean, the baker.".to_owned(),
			output_style: "Concise".to_owned(),
		};
		let request =
			options().bundled(Some(bundle)).resuming(Some("s1".to_owned())).open_request(true);

		assert_eq!(request.resume.as_deref(), Some("s1"));
		assert_eq!(request.plugin_path.as_deref(), Some("/bots/b1"));
		assert_eq!(request.agent.as_deref(), Some("bean"));
	}

	/// The style the bundle carries is on the wire, because the agent format acts on
	/// none of it: a request that dropped the key would open every session on whatever
	/// the provider defaults to, whatever the reader picked.
	#[test]
	fn a_bot_opens_on_the_style_its_bundle_carries() {
		let bundle = Bundle {
			path: "/bots/b1".to_owned(),
			system_path: Some("/system/opennest".to_owned()),
			agent: "bean".to_owned(),
			identity: "You are Bean, the baker.".to_owned(),
			output_style: "default".to_owned(),
		};
		let request = options().bundled(Some(bundle)).open_request(true);

		assert_eq!(request.output_style.as_deref(), Some("default"));
	}

	/// A bot with no bundle to load is opened exactly as every bot was opened before
	/// there were any: no plugin, no agent, and a process the reader can still talk to.
	#[test]
	fn a_bot_carrying_no_bundle_names_none() {
		let plain = options().bundled(None).open_request(true);

		assert_eq!(plain.plugin_path, None);
		assert_eq!(plain.agent, None);
		assert_eq!(plain.identity, None);
		assert_eq!(plain.output_style, None);
	}

	/// A sidecar that never announced deltas is never asked for them, so the reader
	/// is shown whole messages instead of a stream that would never arrive.
	#[test]
	fn a_sidecar_that_names_no_deltas_is_asked_for_whole_messages() {
		assert!(!options().open_request(false).partial_messages);
		assert!(options().open_request(true).partial_messages);
	}
}
