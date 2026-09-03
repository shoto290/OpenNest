
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::task::JoinHandle;

use super::contract::TransportError;
use super::protocol::{self, Catalogue, Checked, Ready, Titled, ToolCatalogue};

pub const SIDECAR_OVERRIDE_ENV: &str = "OPENNEST_AGENT_SIDECAR";

const SIDECAR_NAME: &str = "opennest-agent";

const BUILD_COMMAND: &str = "bun run --filter sidecar build";

pub const READY_TIMEOUT: Duration = Duration::from_secs(20);

const CHECK_TIMEOUT: Duration = Duration::from_secs(30);

const CATALOGUE_TIMEOUT: Duration = Duration::from_secs(60);

const TITLE_TIMEOUT: Duration = Duration::from_secs(60);

pub const SHUTDOWN_GRACE: Duration = Duration::from_secs(3);
const TERMINATE_GRACE: Duration = Duration::from_millis(500);

const STDERR_TAIL_BYTES: usize = 4000;

const STDERR_DRAIN_GRACE: Duration = Duration::from_millis(500);

const STARTUP_EXIT: &str = "the sidecar exited during startup";

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Debug, Clone)]
pub struct SidecarOptions {
	pub binary: PathBuf,
	pub extra_env: Vec<(String, String)>,
	pub ready_timeout: Duration,
}

impl SidecarOptions {
	pub fn new(binary: PathBuf) -> Self {
		Self { binary, extra_env: Vec::new(), ready_timeout: READY_TIMEOUT }
	}

	pub fn with_env(mut self, key: &str, value: impl Into<String>) -> Self {
		self.extra_env.push((key.to_owned(), value.into()));
		self
	}
}

fn bundled_name() -> String {
	if cfg!(windows) {
		format!("{SIDECAR_NAME}.exe")
	} else {
		SIDECAR_NAME.to_owned()
	}
}

fn in_the_build_tree() -> PathBuf {
	std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
		.join("binaries")
		.join(format!("{SIDECAR_NAME}-{}", env!("TAURI_ENV_TARGET_TRIPLE")))
}

fn candidates() -> Vec<(PathBuf, String)> {
	let mut found = Vec::new();

	let beside = std::env::current_exe()
		.ok()
		.and_then(|exe| exe.parent().map(|dir| dir.join(bundled_name())));
	if let Some(beside) = beside {
		let label = super::redact::path(&beside);
		found.push((beside, label));
	}

	let built = in_the_build_tree();
	let label = format!("{} ({BUILD_COMMAND})", super::redact::path(&built));
	found.push((built, label));

	found
}

pub fn resolve() -> Result<PathBuf, TransportError> {
	if let Some(explicit) = std::env::var_os(SIDECAR_OVERRIDE_ENV) {
		let path = PathBuf::from(explicit);
		if path.is_file() {
			return Ok(path);
		}
	}

	let mut searched = vec![format!("${SIDECAR_OVERRIDE_ENV}")];
	for (candidate, label) in candidates() {
		searched.push(label);
		if candidate.is_file() {
			return Ok(candidate);
		}
	}

	Err(TransportError::BinaryNotFound { searched })
}

type Routes = Arc<std::sync::Mutex<HashMap<String, mpsc::UnboundedSender<Value>>>>;

type Answers = Arc<std::sync::Mutex<HashMap<String, Vec<oneshot::Sender<Value>>>>>;

type StdinChannel = std::sync::Mutex<Option<mpsc::UnboundedSender<Value>>>;

pub struct Sidecar {
	stdin_tx: StdinChannel,
	routes: Routes,
	answers: Answers,
	child: Arc<Mutex<Option<Child>>>,
	pid: u32,
	version: String,
	capabilities: Vec<String>,
	gone: Arc<AtomicBool>,
}

impl Sidecar {
	pub async fn start(options: SidecarOptions) -> Result<Arc<Self>, TransportError> {
		let mut child = spawn(&options)?;

		let stdin = child.stdin.take().expect("stdin piped");
		let stdout = child.stdout.take().expect("stdout piped");
		let stderr = child.stderr.take().expect("stderr piped");
		let pid = child.id().unwrap_or_default();
		remember_group(pid);

		let routes: Routes = Arc::new(std::sync::Mutex::new(HashMap::new()));
		let answers: Answers = Arc::new(std::sync::Mutex::new(HashMap::new()));
		let child = Arc::new(Mutex::new(Some(child)));

		let (stdin_tx, stdin_rx) = mpsc::unbounded_channel::<Value>();
		let (ready_tx, ready_rx) = oneshot::channel::<Ready>();
		let gone = Arc::new(AtomicBool::new(false));
		tokio::spawn(write_loop(stdin, stdin_rx));
		let kept_stderr = StderrTail::default();
		let stderr_reader = tokio::spawn(keep_stderr(stderr, kept_stderr.clone()));
		tokio::spawn(read_loop(
			stdout,
			routes.clone(),
			answers.clone(),
			ready_tx,
			gone.clone(),
			child.clone(),
			pid,
		));

		let announced = match tokio::time::timeout(options.ready_timeout, ready_rx).await {
			Ok(Ok(ready)) => ready,
			Ok(Err(_)) => {
				let code = reap(&child, pid).await;
				return Err(TransportError::Crashed {
					code,
					detail: Some(startup_detail(kept_stderr, stderr_reader).await),
				});
			}
			Err(_) => {
				sweep_group(pid);
				return Err(TransportError::StartupTimeout {
					timeout_ms: options.ready_timeout.as_millis() as u64,
				});
			}
		};

		Ok(Arc::new(Self {
			stdin_tx: StdinChannel::new(Some(stdin_tx)),
			routes,
			answers,
			child,
			pid,
			version: announced.version,
			capabilities: announced.capabilities,
			gone,
		}))
	}

	pub fn pid(&self) -> u32 {
		self.pid
	}

	pub fn version(&self) -> &str {
		&self.version
	}

	pub fn is_live(&self) -> bool {
		!self.gone.load(Ordering::Relaxed)
	}

	pub fn supports(&self, capability: &str) -> bool {
		self.capabilities.iter().any(|named| named == capability)
	}

	pub fn attach(&self, key: &str) -> mpsc::UnboundedReceiver<Value> {
		let (tx, rx) = mpsc::unbounded_channel();
		self.routes.lock().expect("routes").insert(key.to_owned(), tx);
		rx
	}

	pub fn detach(&self, key: &str) {
		self.routes.lock().expect("routes").remove(key);
	}

	pub async fn authenticated(&self) -> Result<bool, TransportError> {
		let answer = self.ask(protocol::CHECK, CHECK_TIMEOUT).await?;
		let checked: Checked = serde_json::from_value(answer)
			.map_err(|error| TransportError::AuthCheckFailed { detail: error.to_string() })?;
		match checked.detail {
			Some(detail) => Err(TransportError::AuthCheckFailed { detail }),
			None => Ok(checked.authenticated),
		}
	}

	pub async fn catalogue(&self) -> Result<Vec<String>, TransportError> {
		let answer = self.ask(protocol::MODELS, CATALOGUE_TIMEOUT).await?;
		let catalogue: Catalogue = serde_json::from_value(answer)
			.map_err(|error| TransportError::InvalidFrame { detail: error.to_string() })?;
		Ok(catalogue.models)
	}

	pub async fn tools(&self) -> Result<Vec<String>, TransportError> {
		let answer = self.ask(protocol::TOOLS, CATALOGUE_TIMEOUT).await?;
		let catalogue: ToolCatalogue = serde_json::from_value(answer)
			.map_err(|error| TransportError::InvalidFrame { detail: error.to_string() })?;
		Ok(catalogue.tools)
	}

	pub async fn title(&self, text: &str) -> Result<Option<String>, TransportError> {
		let answer =
			self.ask_with(protocol::TITLE, protocol::title_command(text), TITLE_TIMEOUT).await?;
		let titled: Titled = serde_json::from_value(answer)
			.map_err(|error| TransportError::InvalidFrame { detail: error.to_string() })?;
		Ok(titled.title)
	}

	async fn ask(&self, kind: &str, timeout: Duration) -> Result<Value, TransportError> {
		self.ask_with(kind, protocol::ask_command(kind), timeout).await
	}

	async fn ask_with(
		&self,
		kind: &str,
		command: Value,
		timeout: Duration,
	) -> Result<Value, TransportError> {
		let (tx, rx) = oneshot::channel();
		self.answers.lock().expect("answers").entry(kind.to_owned()).or_default().push(tx);
		self.send(command)?;

		match tokio::time::timeout(timeout, rx).await {
			Ok(Ok(value)) => Ok(value),
			Ok(Err(_)) => Err(TransportError::Crashed {
				code: None,
				detail: Some("the sidecar went away before it answered".into()),
			}),
			Err(_) => {
				Err(TransportError::StartupTimeout { timeout_ms: timeout.as_millis() as u64 })
			}
		}
	}

	pub fn send(&self, command: Value) -> Result<(), TransportError> {
		let delivered = self
			.stdin_tx
			.lock()
			.expect("stdin channel")
			.as_ref()
			.is_some_and(|tx| tx.send(command).is_ok());

		delivered
			.then_some(())
			.ok_or_else(|| TransportError::WriteFailed { detail: "the sidecar is gone".into() })
	}

	fn stop_talking(&self) {
		self.gone.store(true, Ordering::Relaxed);
		self.routes.lock().expect("routes").clear();
		self.answers.lock().expect("answers").clear();
		self.stdin_tx.lock().expect("stdin channel").take();
	}

	pub async fn shutdown(&self) {
		self.stop_talking();

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

	pub async fn terminate(&self) {
		self.stop_talking();

		let mut slot = self.child.lock().await;
		let Some(child) = slot.as_mut() else { return };

		if !matches!(child.try_wait(), Ok(Some(_))) {
			signal_group(self.pid, Signal::Term);
			let _ = tokio::time::timeout(TERMINATE_GRACE, child.wait()).await;
		}
		sweep_group(self.pid);
		*slot = None;
	}
}

static LIVE_GROUPS: std::sync::Mutex<Vec<u32>> = std::sync::Mutex::new(Vec::new());

fn remember_group(pid: u32) {
	LIVE_GROUPS.lock().expect("live groups").push(pid);
}

fn sweep_group(pid: u32) {
	if forget_group(pid) {
		signal_group(pid, Signal::Kill);
	}
}

fn forget_group(pid: u32) -> bool {
	let mut live = LIVE_GROUPS.lock().expect("live groups");
	let Some(index) = live.iter().position(|entry| *entry == pid) else {
		return false;
	};
	live.swap_remove(index);
	true
}

pub fn sweep_live_groups() {
	let live = std::mem::take(&mut *LIVE_GROUPS.lock().expect("live groups"));
	for pid in live {
		signal_group(pid, Signal::Kill);
	}
}

pub fn live_groups() -> Vec<u32> {
	LIVE_GROUPS.lock().expect("live groups").clone()
}

async fn reap(child: &Arc<Mutex<Option<Child>>>, pid: u32) -> Option<i32> {
	let mut slot = child.lock().await;
	let handle = slot.as_mut()?;
	let waited = tokio::time::timeout(TERMINATE_GRACE, handle.wait()).await.ok()?;
	sweep_group(pid);
	waited.ok().and_then(|status| status.code())
}

fn spawn(options: &SidecarOptions) -> Result<Child, TransportError> {
	let mut command = Command::new(&options.binary);
	command
		.arg("--serve")
		.envs(options.extra_env.iter().map(|(key, value)| (key.as_str(), value.as_str())))
		.stdin(Stdio::piped())
		.stdout(Stdio::piped())
		.stderr(Stdio::piped())
		.kill_on_drop(true);

	#[cfg(unix)]
	command.process_group(0);

	#[cfg(windows)]
	command.creation_flags(CREATE_NO_WINDOW);

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
	while let Some(command) = rx.recv().await {
		let mut line = command.to_string();
		line.push('\n');
		if stdin.write_all(line.as_bytes()).await.is_err() || stdin.flush().await.is_err() {
			return;
		}
	}
}

#[derive(Clone, Default)]
struct StderrTail(Arc<std::sync::Mutex<Vec<u8>>>);

impl StderrTail {
	fn push(&self, chunk: &[u8]) {
		let mut kept = self.0.lock().expect("stderr tail");
		kept.extend_from_slice(chunk);
		let over = kept.len().saturating_sub(STDERR_TAIL_BYTES);
		kept.drain(..over);
	}

	fn kept(&self) -> Option<String> {
		let kept = self.0.lock().expect("stderr tail");
		let written = String::from_utf8_lossy(&kept).trim().to_owned();
		(!written.is_empty()).then_some(written)
	}
}

async fn startup_detail(tail: StderrTail, reader: JoinHandle<()>) -> String {
	if tokio::time::timeout(STDERR_DRAIN_GRACE, reader).await.is_err() {
		eprintln!("the sidecar left its stderr open past the drain grace");
	}
	tail.kept().unwrap_or_else(|| STARTUP_EXIT.to_owned())
}

async fn keep_stderr(mut stderr: tokio::process::ChildStderr, tail: StderrTail) {
	let mut chunk = [0u8; 4096];
	while let Ok(read) = stderr.read(&mut chunk).await {
		if read == 0 {
			return;
		}
		tail.push(&chunk[..read]);
	}
}

async fn read_loop(
	stdout: tokio::process::ChildStdout,
	routes: Routes,
	answers: Answers,
	ready_tx: oneshot::Sender<Ready>,
	gone: Arc<AtomicBool>,
	child: Arc<Mutex<Option<Child>>>,
	pid: u32,
) {
	let mut lines = BufReader::new(stdout).lines();
	let mut ready_tx = Some(ready_tx);

	while let Ok(Some(line)) = lines.next_line().await {
		if line.trim().is_empty() {
			continue;
		}
		if let Some(sender) = ready_tx.take() {
			match serde_json::from_str::<Ready>(&line) {
				Ok(ready) => {
					let _ = sender.send(ready);
					continue;
				}
				Err(_) => break,
			}
		}
		let Ok(envelope) = serde_json::from_str::<super::protocol::Envelope>(&line) else {
			settle_answer(&answers, &line);
			continue;
		};
		let lane = routes.lock().expect("routes").get(&envelope.session).cloned();
		if let Some(lane) = lane {
			let _ = lane.send(envelope.frame);
		}
	}

	gone.store(true, Ordering::Relaxed);
	routes.lock().expect("routes").clear();
	answers.lock().expect("answers").clear();
	reap(&child, pid).await;
}

fn settle_answer(answers: &Answers, line: &str) {
	let Ok(value) = serde_json::from_str::<Value>(line) else {
		return;
	};
	let Some(kind) = value.get("type").and_then(Value::as_str) else {
		return;
	};
	let waiting = answers.lock().expect("answers").remove(kind).unwrap_or_default();
	for waiter in waiting {
		let _ = waiter.send(value.clone());
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn the_build_tree_is_read_under_the_name_the_build_wrote() {
		let built = in_the_build_tree();

		assert_eq!(
			built.file_name().and_then(|name| name.to_str()),
			Some(format!("{SIDECAR_NAME}-{}", env!("TAURI_ENV_TARGET_TRIPLE")).as_str())
		);
		assert_eq!(built.parent().and_then(|dir| dir.file_name()), Some("binaries".as_ref()));
	}

	#[test]
	fn the_kept_stderr_holds_the_last_bytes_the_sidecar_wrote() {
		let tail = StderrTail::default();

		tail.push(&vec![b'x'; STDERR_TAIL_BYTES]);
		tail.push(b"panicked: the port is taken");

		let kept = tail.kept().expect("kept stderr");

		assert_eq!(kept.len(), STDERR_TAIL_BYTES);
		assert!(kept.ends_with("panicked: the port is taken"), "the newest bytes were dropped: {kept}");
	}

	#[test]
	fn a_sidecar_that_wrote_nothing_keeps_nothing() {
		assert!(StderrTail::default().kept().is_none());
	}

	#[tokio::test]
	async fn the_startup_detail_waits_for_what_the_reader_kept() {
		let tail = StderrTail::default();
		let writing = tail.clone();
		let reader = tokio::spawn(async move {
			tokio::task::yield_now().await;
			writing.push(b"refusing to start: the port is taken\n");
		});

		let detail = startup_detail(tail, reader).await;

		assert_eq!(detail, "refusing to start: the port is taken");
	}

	#[tokio::test]
	async fn a_startup_the_reader_saw_nothing_of_still_says_when_it_failed() {
		let reader = tokio::spawn(async {});

		let detail = startup_detail(StderrTail::default(), reader).await;

		assert_eq!(detail, STARTUP_EXIT);
	}

	#[test]
	fn a_host_that_finds_no_sidecar_is_told_what_builds_one() {
		let named: Vec<String> = candidates().into_iter().map(|(_, label)| label).collect();

		assert!(
			named.iter().any(|label| label.contains(BUILD_COMMAND)),
			"the failure named no way to build a sidecar: {named:?}"
		);
	}
}
