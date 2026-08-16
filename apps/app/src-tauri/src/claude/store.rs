//! Keeps the last session snapshot on disk so a restart reopens the transcript.
//!
//! Only what the frontend already displays is written: no permission payload,
//! no transport error, nothing the contract keeps out of the UI. The file is
//! created `0600` because the redaction discipline this crate applies on the
//! way to the frontend stops at RAM — on disk the transcript is plain text.

use std::ffi::OsStr;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

use super::contract::SessionSnapshot;

pub const FILE_NAME: &str = "session.json";

const VERSION: u32 = 1;
const BACKUP_SUFFIX: &str = ".bak";

#[derive(Serialize, Deserialize)]
struct StoredSession {
	version: u32,
	snapshot: SessionSnapshot,
}

/// What the last read found. `Unreadable` is kept apart from `Missing` because
/// only one of the two may be written over: bytes this build cannot parse may
/// still be a transcript, and an absent file holds nothing to lose.
enum Stored {
	Missing,
	Snapshot(SessionSnapshot),
	Unreadable,
}

/// `app_data_dir()` only computes a path, so the directory is created here: on
/// a fresh install the first write would otherwise fail.
pub fn file<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
	let dir = app.path().app_data_dir().ok()?;
	fs::create_dir_all(&dir).ok()?;
	Some(dir.join(FILE_NAME))
}

fn read(path: &Path) -> Stored {
	let raw = match fs::read_to_string(path) {
		Ok(raw) => raw,
		Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Stored::Missing,
		Err(_) => return Stored::Unreadable,
	};
	match serde_json::from_str::<StoredSession>(&raw) {
		Ok(stored) if stored.version == VERSION => Stored::Snapshot(stored.snapshot),
		_ => Stored::Unreadable,
	}
}

/// Any unreadable file yields the default snapshot and stays where it is: a
/// half-restored transcript is worse than an empty one, and a file this build
/// cannot parse may still belong to another.
pub fn load(path: &Path) -> SessionSnapshot {
	sweep_abandoned_temporaries(path);
	match read(path) {
		Stored::Snapshot(snapshot) => snapshot,
		Stored::Missing | Stored::Unreadable => SessionSnapshot::default(),
	}
}

/// Never writes over bytes it could not read. Leaving them in place would only
/// postpone the loss to the next prompt, so they are moved to `session.json.bak`
/// and the write goes ahead — and if they cannot be moved, nothing is written at
/// all.
pub fn save(path: &Path, snapshot: &SessionSnapshot) {
	if matches!(read(path), Stored::Unreadable) && !keep_as_backup(path) {
		return;
	}
	let stored = StoredSession { version: VERSION, snapshot: snapshot.clone() };
	let Ok(body) = serde_json::to_vec(&stored) else {
		return;
	};
	let temp = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
	if write_atomically(path, &temp, &body).is_err() {
		let _ = fs::remove_file(&temp);
	}
}

/// A file this build cannot read holds no id to forget, and rewriting it here
/// would spend the one copy another build may still be able to open.
pub fn forget_session_id(path: &Path) {
	let Stored::Snapshot(mut snapshot) = read(path) else {
		return;
	};
	snapshot.session_id = None;
	save(path, &snapshot);
}

/// Answers whether the unreadable bytes are safe. The backup name is spent the
/// first time it is used: a second unreadable file belongs to another build just
/// as much as the first, and renaming over it would destroy the only copy that
/// one has left. A build that cannot make room stops writing rather than trade
/// one transcript for another.
fn keep_as_backup(path: &Path) -> bool {
	let destination = backup(path);
	!destination.exists() && fs::rename(path, &destination).is_ok()
}

fn backup(path: &Path) -> PathBuf {
	let mut name = path.as_os_str().to_owned();
	name.push(BACKUP_SUFFIX);
	PathBuf::from(name)
}

/// A crash between a temporary's creation and its rename leaves it behind for
/// good. The first read of a run is the one moment where every temporary around
/// is known to be abandoned: nothing this process wrote can exist yet, and the
/// single-instance lock keeps another one from saving into the same directory.
///
/// No read after it carries that promise. `claude_load_session` is a command the
/// frontend may call whenever it likes, and a save caught between its
/// `File::create` and its rename would lose the temporary underneath it and
/// return having written nothing at all.
fn sweep_abandoned_temporaries(path: &Path) {
	static ONCE: std::sync::Once = std::sync::Once::new();
	ONCE.call_once(|| sweep_temporaries(path));
}

fn sweep_temporaries(path: &Path) {
	let (Some(parent), Some(stem)) = (path.parent(), path.file_stem()) else {
		return;
	};
	let Ok(entries) = fs::read_dir(parent) else {
		return;
	};
	for entry in entries.flatten() {
		if is_temporary(&entry.file_name(), stem) {
			let _ = fs::remove_file(entry.path());
		}
	}
}

fn is_temporary(name: &OsStr, stem: &OsStr) -> bool {
	name.as_encoded_bytes().starts_with(stem.as_encoded_bytes())
		&& Path::new(name).extension().is_some_and(|extension| extension == "tmp")
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
	fs::rename(temp, path)?;
	sync_parent(path)
}

/// The flushed sibling only becomes the target once the directory entry itself
/// is durable; a power cut in between leaves the rename unrecorded.
#[cfg(unix)]
fn sync_parent(path: &Path) -> std::io::Result<()> {
	let Some(parent) = path.parent() else {
		return Ok(());
	};
	fs::File::open(parent)?.sync_all()
}

#[cfg(not(unix))]
fn sync_parent(_path: &Path) -> std::io::Result<()> {
	Ok(())
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

	const NEWER_VERSION: &str =
		r#"{"version":2,"snapshot":{"sessionId":"s","messages":[],"activities":[]}}"#;

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
		fs::write(&path, NEWER_VERSION).expect("write");

		assert_eq!(load(&path), SessionSnapshot::default());

		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The load is not where the promise is kept: the file survives being read
	/// either way, and it is the first save after it that would replace it.
	#[test]
	fn saving_over_an_unreadable_file_keeps_it_as_a_backup() {
		let dir = temp_dir();
		let path = dir.join(FILE_NAME);
		fs::write(&path, "{").expect("write");

		load(&path);
		save(&path, &sample());

		assert_eq!(fs::read_to_string(backup(&path)).expect("the backup"), "{");
		assert_eq!(load(&path), sample());

		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// A build that writes version 2 is not a build this one may overwrite: the
	/// snapshot it left is intact, only unreadable here.
	#[test]
	fn saving_over_a_newer_version_keeps_it_as_a_backup() {
		let dir = temp_dir();
		let path = dir.join(FILE_NAME);
		fs::write(&path, NEWER_VERSION).expect("write");

		save(&path, &sample());

		assert_eq!(fs::read_to_string(backup(&path)).expect("the backup"), NEWER_VERSION);
		assert_eq!(load(&path), sample());

		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The backup name holds one file, and the bytes already under it are as
	/// unreadable-here and as valuable-elsewhere as the ones arriving. Trading
	/// the first for the second would destroy the only copy that build has left,
	/// so the arriving snapshot stays where it is and the save gives up.
	#[test]
	fn a_second_unreadable_file_never_takes_the_first_one_s_backup() {
		let dir = temp_dir();
		let path = dir.join(FILE_NAME);
		fs::write(&path, NEWER_VERSION).expect("write");
		save(&path, &sample());
		assert_eq!(fs::read_to_string(backup(&path)).expect("the backup"), NEWER_VERSION);

		fs::write(&path, "{").expect("another build leaves bytes this one cannot read either");
		save(&path, &sample());

		assert_eq!(
			fs::read_to_string(backup(&path)).expect("the backup"),
			NEWER_VERSION,
			"the second unreadable file was traded for the first"
		);
		assert_eq!(fs::read_to_string(&path).expect("read"), "{", "the second one was spent too");

		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn forgetting_the_session_id_leaves_an_unreadable_file_alone() {
		let dir = temp_dir();
		let path = dir.join(FILE_NAME);
		fs::write(&path, "{").expect("write");

		forget_session_id(&path);

		assert_eq!(fs::read_to_string(&path).expect("read"), "{");
		assert!(!backup(&path).exists(), "there was no id to forget and no reason to rewrite");

		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_temporary_left_by_a_crashed_save_is_swept_and_nothing_else_is() {
		let dir = temp_dir();
		let path = dir.join(FILE_NAME);
		let leftover = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
		fs::write(&leftover, "half a snapshot").expect("write");
		let unrelated = dir.join("keep.json");
		fs::write(&unrelated, "not ours").expect("write");

		sweep_temporaries(&path);

		assert!(!leftover.exists(), "the abandoned temporary outlived the run that left it");
		assert!(unrelated.exists(), "the sweep reached beyond its own temporaries");

		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// Loading is a command, not a boot step: the frontend may ask for the
	/// transcript at any time, and only the first read of a run can tell an
	/// abandoned temporary from the one a save is holding open right now.
	#[test]
	fn a_read_after_the_first_one_leaves_a_save_in_flight_alone() {
		let dir = temp_dir();
		let path = dir.join(FILE_NAME);
		load(&path);

		let in_flight = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
		fs::write(&in_flight, "a save between its create and its rename").expect("write");
		load(&path);

		assert!(in_flight.exists(), "a later read cancelled a save that was still writing");

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
