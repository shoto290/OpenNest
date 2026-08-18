//! Resolves the local `claude` executable and confirms it is signed in.
//!
//! The child process inherits the ambient environment because Claude Code needs
//! it to reach its own credential store. Nothing read here — not the
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

const WELL_KNOWN_DIRS: &[&str] = &["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];

fn binary_name() -> &'static str {
	if cfg!(windows) {
		"claude.exe"
	} else {
		"claude"
	}
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
/// catalogue — a launcher script answers for one it execs.
pub(super) fn candidates() -> Vec<PathBuf> {
	let name = binary_name();
	let mut found = Vec::new();

	if let Some(explicit) = std::env::var_os(BINARY_OVERRIDE_ENV) {
		found.push(PathBuf::from(explicit));
	}
	if let Some(path) = std::env::var_os("PATH") {
		found.extend(std::env::split_paths(&path).map(|dir| dir.join(name)));
	}
	if let Some(home) = home_dir() {
		found.push(home.join(".local/bin").join(name));
		found.push(home.join(".claude/local").join(name));
		found.push(home.join("bin").join(name));
	}
	found.extend(WELL_KNOWN_DIRS.iter().map(|dir| Path::new(dir).join(name)));
	found
}

/// The locations probed, as stable labels rather than raw `PATH` contents.
fn searched_labels() -> Vec<String> {
	let name = binary_name();
	let mut labels = vec![format!("${BINARY_OVERRIDE_ENV}"), format!("$PATH/{name}")];
	if let Some(home) = home_dir() {
		labels.push(redact(&home.join(".local/bin").join(name)));
		labels.push(redact(&home.join(".claude/local").join(name)));
		labels.push(redact(&home.join("bin").join(name)));
	}
	labels.extend(WELL_KNOWN_DIRS.iter().map(|dir| format!("{dir}/{name}")));
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

	/// Every reported location is a placeholder, a tilde path or a constant of
	/// this module, so `PATH` and the home directory never travel with the error.
	#[test]
	fn searched_labels_never_expose_the_environment() {
		let labels = searched_labels();

		for label in &labels {
			let known = label.starts_with('$')
				|| label.starts_with("~/")
				|| WELL_KNOWN_DIRS.iter().any(|dir| label.starts_with(dir));
			assert!(known, "unexpected location reported: {label}");
		}

		let home = home_dir().expect("home").display().to_string();
		assert!(!labels.iter().any(|label| label.contains(&home)), "leaked the home directory");
		assert!(labels.iter().any(|label| label.starts_with("$PATH/")), "PATH probe not reported");
	}
}
