//! Supervises the one agent sidecar process every session is served from.
//!
//! stderr is drained and discarded, never forwarded and never logged: it is the
//! one channel that could carry an environment value, so it stops here.
//! Transport failures are reported through the typed contract instead.

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot, Mutex};

use super::contract::TransportError;
use super::protocol::{self, Catalogue, Checked, Ready, ToolCatalogue};

/// The executable the host spawns instead of the one it would find on `PATH`.
/// Reserved for a run that ships no bundle of its own — a test, or a developer
/// pointing the host at a build of the sidecar.
pub const SIDECAR_OVERRIDE_ENV: &str = "OPENNEST_AGENT_SIDECAR";

const SIDECAR_NAME: &str = "opennest-agent";

/// What puts the sidecar where a build tree keeps it. Named in the failure so a
/// host that found none says how to make one instead of only where it looked.
const BUILD_COMMAND: &str = "bun run --filter sidecar build";

/// How long the sidecar is given to announce itself before the host gives up on
/// it. A sidecar that has not said `ready` has not opened a session either, so
/// nothing is lost by refusing it.
pub const READY_TIMEOUT: Duration = Duration::from_secs(20);

/// How long the sidecar is given to answer the sign-in probe. It spawns the
/// provider's own executable to read its credential store, and this is the answer
/// the launch waits on.
const CHECK_TIMEOUT: Duration = Duration::from_secs(30);

/// How long the sidecar is given to answer either catalogue. Longer than the check
/// because the provider has to open a session to be asked at all, and nothing is
/// waiting on it: both lists are asked for when a bot is being edited.
const CATALOGUE_TIMEOUT: Duration = Duration::from_secs(60);

/// How long a sidecar handed EOF is given to leave on its own before the ladder
/// escalates. Public so a test can tell "it took the EOF" apart from "the
/// escalation had to reach it".
pub const SHUTDOWN_GRACE: Duration = Duration::from_secs(3);
const TERMINATE_GRACE: Duration = Duration::from_millis(500);

/// `CREATE_NO_WINDOW`. The host is a windows-subsystem binary with no console to
/// hand down, so Windows would open a visible one for a console-subsystem child.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// What one sidecar process is started as. The ambient environment is inherited
/// untouched so the agent can reach its own credential store.
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

/// The name Tauri gives the sidecar once it has bundled it: the target triple is
/// stripped, because a shipped app only ever carries the one it runs on.
fn bundled_name() -> String {
	if cfg!(windows) {
		format!("{SIDECAR_NAME}.exe")
	} else {
		SIDECAR_NAME.to_owned()
	}
}

/// Where the build drops the sidecar before anything bundles it, under the name
/// carrying the triple it was built for. The path is the crate's own, fixed when
/// the host was compiled: on a machine that never built it there is nothing
/// there, which is exactly what makes it safe to try last.
fn in_the_build_tree() -> PathBuf {
	std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
		.join("binaries")
		.join(format!("{SIDECAR_NAME}-{}", env!("TAURI_ENV_TARGET_TRIPLE")))
}

/// Every place the sidecar can be, in the order it is looked for, and how each is
/// named when none of them held one.
///
/// Tauri drops the external binary next to the host executable — both when it
/// bundles and when it runs `tauri dev` — so the host's own directory is what a
/// shipped app reads. A `cargo test` binary is neither of those: it lives in
/// `target/debug/deps`, which nothing ever copies a sidecar into, so the build
/// tree is read behind it rather than left to an environment variable the caller
/// has to remember.
///
/// The build tree's label carries the command that fills it: a host that found
/// nothing is owed what to run, not only where it looked.
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

/// Who is waiting for an answer that names no session, keyed by the type the
/// sidecar answers under. A list per key rather than one sender, so two callers
/// asking the same question at once are both answered instead of one replacing the
/// other's channel with its own.
type Answers = Arc<std::sync::Mutex<HashMap<String, Vec<oneshot::Sender<Value>>>>>;

/// Optional only so a shutdown can drop the sender: closing this channel is what
/// makes `write_loop` release the sidecar's stdin, and that release is the EOF it
/// needs to exit on its own. Nothing else can deliver it — the handle was moved
/// out of `Child` at startup.
type StdinChannel = std::sync::Mutex<Option<mpsc::UnboundedSender<Value>>>;

/// The one process every session is served from, and the table that says which
/// session each frame belongs to.
pub struct Sidecar {
	stdin_tx: StdinChannel,
	routes: Routes,
	answers: Answers,
	child: Arc<Mutex<Option<Child>>>,
	pid: u32,
	version: String,
	capabilities: Vec<String>,
	/// Set the moment the sidecar stops talking, so the next session opens a new
	/// process instead of writing into a pipe nobody reads.
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
		tokio::spawn(discard_stderr(stderr));
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
					detail: Some("the sidecar exited during startup".into()),
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

	/// What this build of the sidecar announced itself as. The host reports it as
	/// the version of the install, and never asks how the provider spells it.
	pub fn version(&self) -> &str {
		&self.version
	}

	pub fn is_live(&self) -> bool {
		!self.gone.load(Ordering::Relaxed)
	}

	/// What this build of the sidecar announced it can do. A capability it does
	/// not name is one the host must not ask for.
	pub fn supports(&self, capability: &str) -> bool {
		self.capabilities.iter().any(|named| named == capability)
	}

	/// Opens a lane for one session. The receiver closes when the sidecar drops
	/// the session or dies, which is what tells the session's reader it is over.
	pub fn attach(&self, key: &str) -> mpsc::UnboundedReceiver<Value> {
		let (tx, rx) = mpsc::unbounded_channel();
		self.routes.lock().expect("routes").insert(key.to_owned(), tx);
		rx
	}

	pub fn detach(&self, key: &str) {
		self.routes.lock().expect("routes").remove(key);
	}

	/// Whether the provider's own credentials are good for a session right now. A
	/// sidecar that could not answer at all reports why, so a broken install is not
	/// read as an account that is signed out.
	pub async fn authenticated(&self) -> Result<bool, TransportError> {
		let answer = self.ask(protocol::CHECK, CHECK_TIMEOUT).await?;
		let checked: Checked = serde_json::from_value(answer)
			.map_err(|error| TransportError::AuthCheckFailed { detail: error.to_string() })?;
		match checked.detail {
			Some(detail) => Err(TransportError::AuthCheckFailed { detail }),
			None => Ok(checked.authenticated),
		}
	}

	/// Every model label the provider offers, in the order it offers them. Empty is
	/// an answer: what to offer instead is the frontend's to decide.
	pub async fn catalogue(&self) -> Result<Vec<String>, TransportError> {
		let answer = self.ask(protocol::MODELS, CATALOGUE_TIMEOUT).await?;
		let catalogue: Catalogue = serde_json::from_value(answer)
			.map_err(|error| TransportError::InvalidFrame { detail: error.to_string() })?;
		Ok(catalogue.models)
	}

	/// Every built-in tool a session of this install can be given, in the order the
	/// provider names them. Empty is an answer for the same reason the model
	/// catalogue's is: what to offer instead is the frontend's to decide.
	pub async fn tools(&self) -> Result<Vec<String>, TransportError> {
		let answer = self.ask(protocol::TOOLS, CATALOGUE_TIMEOUT).await?;
		let catalogue: ToolCatalogue = serde_json::from_value(answer)
			.map_err(|error| TransportError::InvalidFrame { detail: error.to_string() })?;
		Ok(catalogue.tools)
	}

	/// One ask about the install, and the one line that answers it. The waiter is
	/// registered before the command is written, so an answer that comes back
	/// between the two statements is never dropped for having nobody to go to.
	///
	/// A sidecar that dies with the ask outstanding drops the sender, which is what
	/// tells the caller the process is gone rather than slow.
	async fn ask(&self, kind: &str, timeout: Duration) -> Result<Value, TransportError> {
		let (tx, rx) = oneshot::channel();
		self.answers.lock().expect("answers").entry(kind.to_owned()).or_default().push(tx);
		self.send(protocol::ask_command(kind))?;

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

	/// What both endings start with: nothing is routed to a session any more, and
	/// the sidecar is handed the EOF that lets it leave on its own. Dropping the
	/// sender is the only way to deliver that EOF — the stdin handle was moved out
	/// of `Child` at startup.
	fn stop_talking(&self) {
		self.gone.store(true, Ordering::Relaxed);
		self.routes.lock().expect("routes").clear();
		self.answers.lock().expect("answers").clear();
		self.stdin_tx.lock().expect("stdin channel").take();
	}

	/// Hands the sidecar EOF first and only escalates on one that ignores it, up
	/// to the whole process group so no agent child survives. The group is swept
	/// either way: a clean exit reaps the sidecar, never the agents it left
	/// behind, and those are the orphans this call exists to prevent.
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

	/// The short counterpart of [`Sidecar::shutdown`], for a host that is already
	/// quitting. It hands EOF without ever waiting to see it taken: blocking a
	/// quitting app for seconds risks the platform killing it before the
	/// escalation lands, which would leave behind exactly the orphan this call
	/// exists to prevent. `SIGKILL` needs no witness.
	pub async fn terminate(&self) {
		self.stop_talking();

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

/// Every process group this run has spawned and not yet swept. The host quits
/// through `std::process::exit`, which runs no destructor, so this list is the
/// only thing that still knows about a sidecar still starting up.
static LIVE_GROUPS: std::sync::Mutex<Vec<u32>> = std::sync::Mutex::new(Vec::new());

fn remember_group(pid: u32) {
	LIVE_GROUPS.lock().expect("live groups").push(pid);
}

/// The one place a group is signalled for good, so it stops being tracked in the
/// same breath: the system reuses pids, and a stale one left on the list would
/// hand a later sweep somebody else's processes.
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

/// Sweeps what the host's exit would otherwise abandon, a sidecar still starting
/// up included.
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

/// Leaves the handle in place: a failed start still wants the exit code, and
/// `wait` on an already-reaped child returns the cached status. Clearing the slot
/// is the shutdown's job.
///
/// The group is not left in place. Reaping is what frees the pid for the system to
/// hand out again, so this is the last moment the group is still unmistakably this
/// sidecar's — and the agents the reaping never reached are still in it.
///
/// Bounded because the caller reaches here on a sidecar that stopped talking,
/// which says nothing about whether it stopped running. An unbounded wait would
/// hold the child lock for good, and the shutdown that needs that lock is the only
/// thing left that could end it.
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

/// Read so the pipe never fills, then thrown away unread.
async fn discard_stderr(mut stderr: tokio::process::ChildStderr) {
	let _ = tokio::io::copy(&mut stderr, &mut tokio::io::sink()).await;
}

/// Hands every frame to the session it names and nothing to a session the host
/// has already let go. Dropping the table on the way out closes every lane at
/// once, which is how one dead sidecar becomes a crash on each of its sessions.
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

/// A line naming no session answers something the host asked about the install, under
/// the type it was asked. Every waiter for that type is served from the one line, and
/// a line nobody is waiting for is dropped: an unsolicited answer is not a frame any
/// session is owed.
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

	/// The build drops the sidecar under the triple of the machine it was built
	/// for, and nothing strips that name until Tauri bundles it. A host reading the
	/// build tree has to ask for it the way the build wrote it.
	#[test]
	fn the_build_tree_is_read_under_the_name_the_build_wrote() {
		let built = in_the_build_tree();

		assert_eq!(
			built.file_name().and_then(|name| name.to_str()),
			Some(format!("{SIDECAR_NAME}-{}", env!("TAURI_ENV_TARGET_TRIPLE")).as_str())
		);
		assert_eq!(built.parent().and_then(|dir| dir.file_name()), Some("binaries".as_ref()));
	}

	/// Nothing found is a caller owed an instruction rather than an inventory: the
	/// place the build fills is named next to the command that fills it.
	#[test]
	fn a_host_that_finds_no_sidecar_is_told_what_builds_one() {
		let named: Vec<String> = candidates().into_iter().map(|(_, label)| label).collect();

		assert!(
			named.iter().any(|label| label.contains(BUILD_COMMAND)),
			"the failure named no way to build a sidecar: {named:?}"
		);
	}
}
