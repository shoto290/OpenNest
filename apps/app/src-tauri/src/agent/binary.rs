//! Resolves the local `claude` executable and confirms it is signed in.
//!
//! The connection probe alone, since sessions moved to the sidecar: it answers
//! what the install is and whether it can be used, and spawns nothing a turn
//! ever travels through.
//!
//! The probe inherits the ambient environment because Claude Code needs it to
//! reach its own credential store. Nothing read here — not the
//! environment, not the auth payload — is ever logged or returned upward: the
//! auth probe is reduced to a single boolean before it leaves this module.

use std::path::{Path, PathBuf};
use std::time::Duration;

use tokio::process::Command;

use super::contract::{CheckReport, ConnectionState, TransportError};
use super::protocol::AuthStatus;
use super::redact::{home_dir, path as redact};

pub const BINARY_OVERRIDE_ENV: &str = "OPENNEST_CLAUDE_BIN";

const PROBE_TIMEOUT: Duration = Duration::from_secs(20);

const UNIX_WELL_KNOWN_DIRS: &[&str] = &["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];

const HOME_DIRS: &[&str] = &[".local/bin", ".claude/local", "bin"];

/// Every name a `claude` executable can carry, the native install first. Windows
/// needs three: the official installer drops a `claude.exe`, npm and the other
/// package managers drop a `claude.cmd` shim, and only the extension tells them
/// apart. Deliberately narrower than `PATHEXT`, which also lists extensions no
/// installer uses and some this app could not spawn. The platform is an argument
/// rather than a `cfg!` so either host can test both lists.
fn binary_names(windows: bool) -> &'static [&'static str] {
	if windows {
		&["claude.exe", "claude.cmd", "claude.bat"]
	} else {
		&["claude"]
	}
}

/// Those names as one label, so an error names a directory once instead of once
/// per extension. Read off the list it describes, which cannot then go stale.
fn name_label(windows: bool) -> &'static str {
	match binary_names(windows) {
		[single] => single,
		_ => "claude.*",
	}
}

/// The directories probed beyond `PATH`, in order — one list, so the paths tried
/// and the locations reported cannot drift apart. The Windows entry is where npm
/// puts its shims: its installer does add it to `PATH`, but an app launched from
/// a session older than the install never sees that.
fn extra_dirs() -> Vec<PathBuf> {
	let mut dirs = Vec::new();

	if let Some(home) = home_dir() {
		dirs.extend(HOME_DIRS.iter().map(|dir| home.join(dir)));
	}
	if cfg!(windows) {
		dirs.extend(std::env::var_os("APPDATA").map(|dir| PathBuf::from(dir).join("npm")));
	} else {
		dirs.extend(UNIX_WELL_KNOWN_DIRS.iter().map(PathBuf::from));
	}
	dirs
}

fn is_executable(path: &Path) -> bool {
	if !path.is_file() {
		return false;
	}
	#[cfg(unix)]
	{
		use std::os::unix::fs::PermissionsExt;
		path.metadata().map(|meta| meta.permissions().mode() & 0o111 != 0).unwrap_or(false)
	}
	#[cfg(not(unix))]
	{
		true
	}
}

/// Where a `claude` may be, in the order it is looked for. Reachable across the
/// module so [`super::models`] can read the executable rather than only run it: the
/// first candidate that answers `--version` is not always the file that carries the
/// catalogue — a launcher script answers for one it execs. On Windows a candidate
/// may be such a script rather than a native executable, which is why every
/// directory is tried for `claude.exe` before the shims that stand in for it.
pub(super) fn candidates() -> Vec<PathBuf> {
	let mut found = Vec::new();

	if let Some(explicit) = std::env::var_os(BINARY_OVERRIDE_ENV) {
		found.push(PathBuf::from(explicit));
	}
	let mut dirs: Vec<PathBuf> = std::env::var_os("PATH")
		.map(|path| std::env::split_paths(&path).collect())
		.unwrap_or_default();
	dirs.extend(extra_dirs());
	for dir in dirs {
		found.extend(binary_names(cfg!(windows)).iter().map(|name| dir.join(name)));
	}
	found
}

/// The locations probed, as stable labels rather than raw `PATH` contents.
fn searched_labels() -> Vec<String> {
	let name = name_label(cfg!(windows));
	let mut labels = vec![format!("${BINARY_OVERRIDE_ENV}"), format!("$PATH/{name}")];
	labels.extend(extra_dirs().iter().map(|dir| redact(&dir.join(name))));
	labels
}

pub fn resolve() -> Result<PathBuf, TransportError> {
	candidates()
		.into_iter()
		.find(|candidate| is_executable(candidate))
		.ok_or_else(|| TransportError::BinaryNotFound { searched: searched_labels() })
}

async fn run(binary: &Path, args: &[&str]) -> Result<(bool, String), TransportError> {
	let output = tokio::time::timeout(PROBE_TIMEOUT, Command::new(binary).args(args).output())
		.await
		.map_err(|_| TransportError::StartupTimeout {
			timeout_ms: PROBE_TIMEOUT.as_millis() as u64,
		})?
		.map_err(|error| TransportError::SpawnFailed { detail: error.to_string() })?;

	let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
	Ok((output.status.success(), stdout))
}

pub async fn version(binary: &Path) -> Option<String> {
	let (ok, stdout) = run(binary, &["--version"]).await.ok()?;
	if !ok {
		return None;
	}
	stdout.split_whitespace().next().map(str::to_owned)
}

/// Returns whether the local install is signed in. The probe payload also
/// carries an email, an org id and a subscription type: it is parsed into a
/// single boolean here and the rest is dropped on the floor.
pub async fn is_authenticated(binary: &Path) -> Result<bool, TransportError> {
	let (_, stdout) = run(binary, &["auth", "status"]).await?;
	let status: AuthStatus =
		serde_json::from_str(stdout.trim()).map_err(|_| TransportError::AuthCheckFailed {
			detail: "auth status returned an unreadable payload".into(),
		})?;
	Ok(status.logged_in)
}

pub async fn check() -> CheckReport {
	let binary = match resolve() {
		Ok(binary) => binary,
		Err(error) => {
			return CheckReport {
				connection: ConnectionState::Unavailable,
				binary_version: None,
				authenticated: false,
				error: Some(error),
			}
		}
	};

	// Each probe cold-starts the ~300 MB CLI and neither feeds the other, so
	// the check costs one spawn rather than two in sequence.
	let (binary_version, authenticated) = tokio::join!(version(&binary), is_authenticated(&binary));

	match authenticated {
		Ok(true) => CheckReport {
			connection: ConnectionState::Ready,
			binary_version,
			authenticated: true,
			error: None,
		},
		Ok(false) => CheckReport {
			connection: ConnectionState::Unavailable,
			binary_version,
			authenticated: false,
			error: Some(TransportError::NotAuthenticated),
		},
		Err(error) => CheckReport {
			connection: ConnectionState::Unavailable,
			binary_version,
			authenticated: false,
			error: Some(error),
		},
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	/// The bug this module carried: Windows probed only `claude.exe`, so the
	/// `claude.cmd` shim every package manager installs was invisible.
	#[test]
	fn windows_probes_the_shims_and_not_only_the_native_install() {
		assert_eq!(binary_names(true).first(), Some(&"claude.exe"), "native install must win");
		assert!(binary_names(true).contains(&"claude.cmd"), "npm shim never probed");
		assert_eq!(binary_names(false), ["claude"]);
		assert_eq!(name_label(true), "claude.*");
		assert_eq!(name_label(false), "claude");
	}

	/// Every probed directory is probed for every name a `claude` can carry, so an
	/// install is not missed in a directory that was only reached for another name.
	#[test]
	fn every_directory_is_probed_for_every_name() {
		let candidates = candidates();

		for dir in extra_dirs() {
			for name in binary_names(cfg!(windows)) {
				let expected = dir.join(name);
				assert!(candidates.contains(&expected), "never probed {}", expected.display());
			}
		}
	}

	/// Every reported location is a placeholder, a tilde path or a constant of
	/// this module, so `PATH` and the home directory never travel with the error.
	#[test]
	fn searched_labels_never_expose_the_environment() {
		let labels = searched_labels();

		for label in &labels {
			let known = label.starts_with('$')
				|| label.starts_with("~/")
				|| UNIX_WELL_KNOWN_DIRS.iter().any(|dir| label.starts_with(dir));
			assert!(known, "unexpected location reported: {label}");
		}

		let home = home_dir().expect("home").display().to_string();
		assert!(!labels.iter().any(|label| label.contains(&home)), "leaked the home directory");
		assert!(labels.iter().any(|label| label.starts_with("$PATH/")), "PATH probe not reported");
	}
}
