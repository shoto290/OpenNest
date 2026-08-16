//! Keeps the last session snapshot on disk so a restart reopens the transcript.
//!
//! Only what the frontend already displays is written: no permission payload,
//! no transport error, nothing the contract keeps out of the UI. The file is
//! created `0600` because the redaction discipline this crate applies on the
//! way to the frontend stops at RAM — on disk the transcript is plain text.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

use super::contract::SessionSnapshot;

pub const FILE_NAME: &str = "session.json";

const VERSION: u32 = 1;

#[derive(Serialize, Deserialize)]
struct StoredSession {
	version: u32,
	snapshot: SessionSnapshot,
}

/// `app_data_dir()` only computes a path, so the directory is created here: on
/// a fresh install the first write would otherwise fail.
pub fn file<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
	let dir = app.path().app_data_dir().ok()?;
	fs::create_dir_all(&dir).ok()?;
	Some(dir.join(FILE_NAME))
}

/// Any unreadable file yields the default snapshot and is left untouched: a
/// half-restored transcript is worse than an empty one, and a file this build
/// cannot parse may still belong to another.
pub fn load(path: &Path) -> SessionSnapshot {
	let Ok(raw) = fs::read_to_string(path) else {
		return SessionSnapshot::default();
	};
	match serde_json::from_str::<StoredSession>(&raw) {
		Ok(stored) if stored.version == VERSION => stored.snapshot,
		_ => SessionSnapshot::default(),
	}
}

pub fn save(path: &Path, snapshot: &SessionSnapshot) {
	let stored = StoredSession { version: VERSION, snapshot: snapshot.clone() };
	let Ok(body) = serde_json::to_vec(&stored) else {
		return;
	};
	let temp = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
	if write_atomically(path, &temp, &body).is_err() {
		let _ = fs::remove_file(&temp);
	}
}

pub fn forget_session_id(path: &Path) {
	let mut snapshot = load(path);
	snapshot.session_id = None;
	save(path, &snapshot);
}

/// A crash mid-write must cost the last turn, not the whole transcript, so the
/// target is only ever replaced by a fully flushed sibling. That sibling is
/// named uniquely: two overlapping saves sharing one would interleave into it.
fn write_atomically(path: &Path, temp: &Path, body: &[u8]) -> std::io::Result<()> {
	if let Some(parent) = path.parent() {
		fs::create_dir_all(parent)?;
	}
	let mut file = fs::File::create(temp)?;
	restrict_to_owner(&file)?;
	file.write_all(body)?;
	file.sync_all()?;
	fs::rename(temp, path)
}

#[cfg(unix)]
fn restrict_to_owner(file: &fs::File) -> std::io::Result<()> {
	use std::os::unix::fs::PermissionsExt;
	file.set_permissions(fs::Permissions::from_mode(0o600))
}

#[cfg(not(unix))]
fn restrict_to_owner(_file: &fs::File) -> std::io::Result<()> {
	Ok(())
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::claude::contract::{
		ActivityEvent, ActivityKind, ActivityStatus, ChatMessage, MessageCompletion, MessageRole,
	};

	fn temp_dir() -> PathBuf {
		let dir = std::env::temp_dir().join(format!("opennest-store-{}", uuid::Uuid::new_v4()));
		fs::create_dir_all(&dir).expect("temp dir");
		dir
	}

	fn sample() -> SessionSnapshot {
		SessionSnapshot {
			session_id: Some("session-1".into()),
			messages: vec![ChatMessage {
				id: "m1".into(),
				role: MessageRole::User,
				text: "salut".into(),
				completion: MessageCompletion::Complete,
				timestamp: 17,
			}],
			activities: vec![ActivityEvent {
				id: "a1".into(),
				title: "Read".into(),
				kind: ActivityKind::Tool,
				status: ActivityStatus::Succeeded,
			}],
		}
	}

	#[test]
	fn a_missing_file_loads_an_empty_snapshot() {
		let dir = temp_dir();

		assert_eq!(load(&dir.join(FILE_NAME)), SessionSnapshot::default());

		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_truncated_file_loads_an_empty_snapshot_and_is_kept() {
		let dir = temp_dir();
		let path = dir.join(FILE_NAME);
		fs::write(&path, "{").expect("write");

		assert_eq!(load(&path), SessionSnapshot::default());
		assert!(path.exists(), "an unreadable file must never be deleted");

		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_newer_version_loads_an_empty_snapshot() {
		let dir = temp_dir();
		let path = dir.join(FILE_NAME);
		fs::write(
			&path,
			r#"{"version":2,"snapshot":{"sessionId":"s","messages":[],"activities":[]}}"#,
		)
		.expect("write");

		assert_eq!(load(&path), SessionSnapshot::default());

		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_saved_snapshot_round_trips_with_its_version() {
		let dir = temp_dir();
		let path = dir.join(FILE_NAME);
		let snapshot = sample();

		save(&path, &snapshot);

		assert_eq!(load(&path), snapshot);
		assert!(fs::read_to_string(&path).expect("read").contains(r#""version":1"#));

		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn forgetting_the_session_id_keeps_the_transcript() {
		let dir = temp_dir();
		let path = dir.join(FILE_NAME);
		let snapshot = sample();
		save(&path, &snapshot);

		forget_session_id(&path);

		let reloaded = load(&path);
		assert_eq!(reloaded.session_id, None);
		assert_eq!(reloaded.messages, snapshot.messages);
		assert_eq!(reloaded.activities, snapshot.activities);

		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn saving_creates_the_missing_parent_directory() {
		let dir = temp_dir();
		let path = dir.join("nested").join(FILE_NAME);
		let snapshot = sample();

		save(&path, &snapshot);

		assert_eq!(load(&path), snapshot);

		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn overlapping_saves_leave_one_whole_snapshot() {
		let dir = temp_dir();
		let path = dir.join(FILE_NAME);
		let short = sample();
		let long = SessionSnapshot {
			messages: (0..500).map(|_| short.messages[0].clone()).collect(),
			..short.clone()
		};

		std::thread::scope(|scope| {
			for _ in 0..8 {
				scope.spawn(|| save(&path, &short));
				scope.spawn(|| save(&path, &long));
			}
		});

		let reloaded = load(&path);
		assert!(reloaded == short || reloaded == long, "concurrent saves tore the file");

		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[cfg(unix)]
	#[test]
	fn the_saved_file_is_reachable_by_its_owner_only() {
		use std::os::unix::fs::PermissionsExt;

		let dir = temp_dir();
		let path = dir.join(FILE_NAME);

		save(&path, &sample());

		let mode = fs::metadata(&path).expect("metadata").permissions().mode();
		assert_eq!(mode & 0o777, 0o600, "the transcript must not be world readable");

		fs::remove_dir_all(&dir).expect("cleanup");
	}
}
