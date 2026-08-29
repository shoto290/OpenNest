
use std::collections::{BTreeMap, HashMap};
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

pub struct GatedSink {
	inner: Arc<dyn EventSink>,
	gate: std::sync::Mutex<Gate>,
}

impl GatedSink {
	pub fn new(inner: Arc<dyn EventSink>) -> Self {
		Self { inner, gate: std::sync::Mutex::new(Gate::Buffering(Vec::new())) }
	}

	pub fn promote(&self) {
		let mut gate = self.gate.lock().expect("gate");
		if let Gate::Buffering(buffered) = std::mem::replace(&mut *gate, Gate::Forwarding) {
			for event in buffered {
				self.inner.emit(event);
			}
		}
	}

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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Bundle {
	pub path: String,
	pub system_path: Option<String>,
	pub user_path: Option<String>,
	pub space_path: Option<String>,
	pub agent: String,
	pub identity: String,
	pub output_style: String,
	pub settings_path: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SessionOptions {
	pub cwd: PathBuf,
	pub resume: Option<String>,
	pub bundle: Option<Bundle>,
	pub app_data_dir: Option<PathBuf>,
	pub startup_timeout: Duration,
	pub extra_env: Vec<(String, String)>,
	pub secrets: BTreeMap<String, String>,
	pub server_secrets: protocol::SecretsByServer,
}

impl SessionOptions {
	pub fn new(cwd: PathBuf) -> Self {
		Self {
			cwd,
			resume: None,
			bundle: None,
			app_data_dir: None,
			startup_timeout: DEFAULT_STARTUP_TIMEOUT,
			extra_env: Vec::new(),
			secrets: BTreeMap::new(),
			server_secrets: protocol::SecretsByServer::new(),
		}
	}

	pub fn resuming(mut self, session_id: Option<String>) -> Self {
		self.resume = session_id;
		self
	}

	pub fn bundled(mut self, bundle: Option<Bundle>) -> Self {
		self.bundle = bundle;
		self
	}

	pub fn with_app_data(mut self, dir: Option<PathBuf>) -> Self {
		self.app_data_dir = dir;
		self
	}

	pub fn with_secrets(mut self, secrets: BTreeMap<String, String>) -> Self {
		self.secrets = secrets;
		self
	}

	pub fn with_server_secrets(mut self, by_server: protocol::SecretsByServer) -> Self {
		self.server_secrets = by_server;
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
			user_plugin_path: self.bundle.as_ref().and_then(|bundle| bundle.user_path.clone()),
			space_plugin_path: self.bundle.as_ref().and_then(|bundle| bundle.space_path.clone()),
			agent: self.bundle.as_ref().map(|bundle| bundle.agent.clone()),
			identity: self.bundle.as_ref().map(|bundle| bundle.identity.clone()),
			output_style: self.bundle.as_ref().map(|bundle| bundle.output_style.clone()),
			settings_path: self.bundle.as_ref().and_then(|bundle| bundle.settings_path.clone()),
			app_data_dir: self.app_data_dir.as_ref().map(|dir| dir.to_string_lossy().into_owned()),
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
		if let Err(error) =
			session.hand_over_secrets_then_open(&request, &options.secrets, &options.server_secrets)
		{
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

	fn hand_over_secrets_then_open(
		&self,
		request: &OpenRequest,
		secrets: &BTreeMap<String, String>,
		by_server: &protocol::SecretsByServer,
	) -> Result<(), TransportError> {
		if !secrets.is_empty() || !by_server.is_empty() {
			self.write(protocol::secrets_command(&self.key, secrets, by_server))?;
		}
		self.write(protocol::open_command(&self.key, request))
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

	#[test]
	fn a_bot_opens_on_the_bundle_it_runs_as() {
		let bundle = Bundle {
			path: "/bots/b1".to_owned(),
			system_path: Some("/system/opennest".to_owned()),
			user_path: Some("/user/me".to_owned()),
			space_path: Some("/spaces/s1".to_owned()),
			agent: "bean".to_owned(),
			identity: "You are Bean, the baker.".to_owned(),
			output_style: "Concise".to_owned(),
			settings_path: None,
		};
		let request = options().bundled(Some(bundle)).open_request(true);

		assert_eq!(request.plugin_path.as_deref(), Some("/bots/b1"));
		assert_eq!(request.space_plugin_path.as_deref(), Some("/spaces/s1"));
		assert_eq!(request.agent.as_deref(), Some("bean"));
		assert_eq!(request.identity.as_deref(), Some("You are Bean, the baker."));
	}

	#[test]
	fn a_run_carries_the_directory_the_host_keeps_its_own_data_in() {
		let request =
			options().with_app_data(Some(PathBuf::from("/app-data/opennest"))).open_request(true);

		assert_eq!(request.app_data_dir.as_deref(), Some("/app-data/opennest"));
		assert_eq!(options().open_request(true).app_data_dir, None);
	}

	#[test]
	fn a_resumed_run_carries_the_bundle_again() {
		let bundle = Bundle {
			path: "/bots/b1".to_owned(),
			system_path: Some("/system/opennest".to_owned()),
			user_path: Some("/user/me".to_owned()),
			space_path: Some("/spaces/s1".to_owned()),
			agent: "bean".to_owned(),
			identity: "You are Bean, the baker.".to_owned(),
			output_style: "Concise".to_owned(),
			settings_path: None,
		};
		let request =
			options().bundled(Some(bundle)).resuming(Some("s1".to_owned())).open_request(true);

		assert_eq!(request.resume.as_deref(), Some("s1"));
		assert_eq!(request.plugin_path.as_deref(), Some("/bots/b1"));
		assert_eq!(request.agent.as_deref(), Some("bean"));
	}

	#[test]
	fn a_bot_opens_on_the_style_its_bundle_carries() {
		let bundle = Bundle {
			path: "/bots/b1".to_owned(),
			system_path: Some("/system/opennest".to_owned()),
			user_path: Some("/user/me".to_owned()),
			space_path: Some("/spaces/s1".to_owned()),
			agent: "bean".to_owned(),
			identity: "You are Bean, the baker.".to_owned(),
			output_style: "default".to_owned(),
			settings_path: None,
		};
		let request = options().bundled(Some(bundle)).open_request(true);

		assert_eq!(request.output_style.as_deref(), Some("default"));
	}

	#[test]
	fn a_bot_opens_on_the_settings_file_its_bundle_carries() {
		let bundle = Bundle {
			path: "/bots/b1".to_owned(),
			system_path: None,
			user_path: None,
			space_path: None,
			agent: "bean".to_owned(),
			identity: "You are Bean, the baker.".to_owned(),
			output_style: "default".to_owned(),
			settings_path: Some("/bots/b1/settings.json".to_owned()),
		};
		let request = options().bundled(Some(bundle)).open_request(true);

		assert_eq!(request.settings_path.as_deref(), Some("/bots/b1/settings.json"));
	}

	#[test]
	fn a_bot_carrying_no_bundle_names_none() {
		let plain = options().bundled(None).open_request(true);

		assert_eq!(plain.plugin_path, None);
		assert_eq!(plain.space_plugin_path, None);
		assert_eq!(plain.agent, None);
		assert_eq!(plain.identity, None);
		assert_eq!(plain.output_style, None);
		assert_eq!(plain.settings_path, None);
	}

	#[test]
	fn a_sidecar_that_names_no_deltas_is_asked_for_whole_messages() {
		assert!(!options().open_request(false).partial_messages);
		assert!(options().open_request(true).partial_messages);
	}
}
