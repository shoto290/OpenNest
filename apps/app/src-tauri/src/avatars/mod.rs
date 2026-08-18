//! The directory a bot's uploaded picture lives in, beside the conversation
//! database, and the two rules that make a path recorded in `bots` safe to hand a
//! webview.
//!
//! Nothing leaves the machine and nothing is fetched: an avatar is a file this
//! host wrote, in a directory this host owns, and the only way the UI reaches it is
//! the asset protocol scoped to that one directory. Which is why every path read
//! back out of the database goes through [`readable`] first — a column is data, and
//! data that names a file is a path somebody could have written by hand.
//!
//! The invariant the whole module exists to keep is: **the directory holds exactly
//! the files the `bots` table references.** It is not maintained by remembering to
//! delete things at three call sites — it is restored by [`sweep`], which is run
//! after anything that changes a bot. A replaced picture, a deleted bot and a file
//! left behind by a host that died between the write and the commit are all the
//! same fact to it, and all three are answered the same way.
//!
//! [`sweep`] and the write that records a new file are ordered against each other
//! rather than locked against each other: the row is updated *before* the file is
//! written, so a sweep running in between sees the name as referenced and leaves it
//! alone. The cost of that order is a window where the row names a file that is not
//! there yet, which [`readable`] already answers the way it answers a file that is
//! gone — with the animal.

pub mod picture;

use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};
use uuid::Uuid;

pub use picture::Rejection;

/// Beside `conversations.sqlite3` rather than in it: a picture is bytes nothing
/// queries, and a row per avatar would put megabytes in the way of every read of
/// the transcript.
const DIR_NAME: &str = "avatars";

/// The one extension a stored avatar takes, because [`picture`] stores one format.
/// The asset protocol scope is a glob over this directory, so the name a file takes
/// is also what the webview is allowed to ask for.
const EXTENSION: &str = "png";

/// The same reason the database file is `0600`: what a user uploaded is theirs, and
/// the app data directory is not a place to publish it from. Named per kind rather
/// than decided from the path, so nothing has to ask the disk what it is about to
/// restrict.
const DIR_MODE: u32 = 0o700;
const FILE_MODE: u32 = 0o600;

/// Where avatars live for this install: a path, and nothing on the disk. Every read
/// of a bot resolves this to project the column it holds, and a read has no business
/// creating a directory or writing a mode — [`write`] makes the place, on the one
/// path that is about to put a file in it.
///
/// A directory that is not there yet is therefore normal, and both callers already
/// answer it: [`readable`] reports no picture, and [`sweep`] has nothing to sweep.
///
/// `None` is a host that has no app data directory to put one in — the same outcome
/// the database reports, and it means avatars are unavailable for the run rather
/// than that the launch failed.
pub fn dir<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
	Some(app.path().app_data_dir().ok()?.join(DIR_NAME))
}

/// Where a new avatar goes. The name is minted here and carries no part of the
/// picture, the bot or the file it came from: a name derived from any of those
/// would be a name a second upload could collide with, and the point of writing a
/// new file is that the old one is still being referenced until the row moves.
pub fn minted_path(dir: &Path) -> PathBuf {
	dir.join(format!("{}.{EXTENSION}", Uuid::new_v4()))
}

/// The bytes on the disk, owner-only, in a directory made if this is the first
/// avatar this install stores. The picture is already normalised and already in
/// memory, so this is one write of a whole file: there is no state where half a
/// picture has been accepted.
pub fn write(path: &Path, bytes: &[u8]) -> Result<(), Rejection> {
	if let Some(dir) = path.parent() {
		fs::create_dir_all(dir)
			.and_then(|()| restrict_to_owner(dir, DIR_MODE))
			.map_err(unwritable)?;
	}
	fs::write(path, bytes).and_then(|()| restrict_to_owner(path, FILE_MODE)).map_err(unwritable)
}

/// The absolute path a recorded one stands for, or `None` if the UI must not be
/// handed it. Four things are refused, and every one of them is a path the webview
/// would otherwise be asked to fetch:
///
/// - a name that is not directly inside the directory, including one that walks out
///   of it with `..` — checked lexically, by [`held_name`];
/// - a path that canonicalises outside the directory, which is how a symlink
///   planted under an accepted name would escape;
/// - a file that is not there, which is what an install whose data directory moved
///   leaves behind and the reason the UI can fall back to the animal instead of
///   rendering a broken picture;
/// - anything that is not a regular file.
///
/// A refusal is `None` rather than an error: the bot still has an animal, and the
/// caller has nothing to decide.
pub fn readable(dir: &Path, recorded: &str) -> Option<PathBuf> {
	held_name(dir, recorded)?;
	let inside = dir.canonicalize().ok()?;
	let resolved = Path::new(recorded).canonicalize().ok()?;
	if resolved.parent() != Some(inside.as_path()) || !resolved.is_file() {
		return None;
	}
	Some(resolved)
}

/// Leaves the directory holding exactly the files `referenced` names, and deletes
/// every other entry in it.
///
/// The keep set is built lexically on purpose — `readable` would refuse a name
/// whose file has not been written yet, and a sweep that mistook "not written yet"
/// for "not referenced" would delete the picture the write is about to record.
pub fn sweep(dir: &Path, referenced: &[String]) {
	let kept: Vec<OsString> = referenced.iter().filter_map(|path| held_name(dir, path)).collect();
	let Ok(entries) = fs::read_dir(dir) else {
		return;
	};
	for entry in entries.flatten() {
		if !kept.contains(&entry.file_name()) {
			let _ = fs::remove_file(entry.path());
		}
	}
}

/// The file name a recorded path holds inside `dir`, decided by the path's own
/// components and nothing on the disk. `dir/../elsewhere/x.png` has a parent of
/// `dir/..` rather than `dir`, so walking out is refused here without a syscall —
/// which matters because this is also the predicate the sweep trusts.
fn held_name(dir: &Path, recorded: &str) -> Option<OsString> {
	let path = Path::new(recorded);
	if path.parent() != Some(dir) {
		return None;
	}
	Some(path.file_name()?.to_owned())
}

fn unwritable(error: std::io::Error) -> Rejection {
	Rejection::Unwritable { detail: error.to_string() }
}

#[cfg(unix)]
fn restrict_to_owner(path: &Path, mode: u32) -> std::io::Result<()> {
	use std::os::unix::fs::PermissionsExt;
	fs::set_permissions(path, fs::Permissions::from_mode(mode))
}

#[cfg(not(unix))]
fn restrict_to_owner(_path: &Path, _mode: u32) -> std::io::Result<()> {
	Ok(())
}

#[cfg(test)]
mod tests {
	use super::picture::fixtures::a_png;
	use super::*;

	fn temp_dir() -> PathBuf {
		let dir = std::env::temp_dir().join(format!("opennest-avatars-{}", Uuid::new_v4()));
		fs::create_dir_all(&dir).expect("temp dir");
		dir
	}

	fn a_stored_avatar(dir: &Path) -> String {
		let path = minted_path(dir);
		let bytes = picture::normalised(&a_png(24, 24)).expect("the picture is accepted");
		write(&path, &bytes).expect("the picture is written");
		path.to_string_lossy().into_owned()
	}

	fn names_in(dir: &Path) -> Vec<String> {
		let mut names: Vec<String> = fs::read_dir(dir)
			.expect("the directory is readable")
			.flatten()
			.map(|entry| entry.file_name().to_string_lossy().into_owned())
			.collect();
		names.sort();
		names
	}

	#[test]
	fn a_stored_picture_is_reachable_under_the_path_it_was_recorded_as() {
		let dir = temp_dir();

		let recorded = a_stored_avatar(&dir);

		assert_eq!(
			readable(&dir, &recorded),
			Some(PathBuf::from(&recorded).canonicalize().unwrap())
		);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// Two uploads never collide, which is what lets the new file be written while
	/// the old one is still the one the row names.
	#[test]
	fn two_avatars_stored_in_a_row_are_two_files() {
		let dir = temp_dir();

		let first = a_stored_avatar(&dir);
		let second = a_stored_avatar(&dir);

		assert_ne!(first, second);
		assert_eq!(names_in(&dir).len(), 2);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_path_that_walks_out_of_the_directory_is_refused_rather_than_read() {
		let dir = temp_dir();
		let outside = dir.parent().expect("a parent").join("outside.png");
		fs::write(&outside, a_png(8, 8)).expect("the file outside exists");

		let escaping = dir.join("..").join("outside.png");

		assert_eq!(readable(&dir, &escaping.to_string_lossy()), None);
		assert!(outside.exists(), "the refused path was read anyway");
		fs::remove_file(&outside).expect("cleanup");
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn an_absolute_path_somewhere_else_entirely_is_refused() {
		let dir = temp_dir();

		assert_eq!(readable(&dir, "/etc/passwd"), None);
		assert_eq!(readable(&dir, "../../secrets/key.pem"), None);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The escape a lexical check alone would let through: the name is directly
	/// inside the directory and the file it stands for is not.
	#[cfg(unix)]
	#[test]
	fn a_symlink_out_of_the_directory_is_refused_by_where_it_resolves() {
		let dir = temp_dir();
		let outside = dir.parent().expect("a parent").join("linked.png");
		fs::write(&outside, a_png(8, 8)).expect("the file outside exists");
		let planted = dir.join("planted.png");
		std::os::unix::fs::symlink(&outside, &planted).expect("the symlink is planted");

		assert_eq!(readable(&dir, &planted.to_string_lossy()), None);
		fs::remove_file(&outside).expect("cleanup");
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// What an install whose data directory moved leaves behind. The caller is told
	/// there is no picture, which is what makes the bot fall back to its animal.
	#[test]
	fn a_recorded_path_whose_file_is_gone_reads_as_no_picture() {
		let dir = temp_dir();
		let recorded = a_stored_avatar(&dir);
		fs::remove_file(&recorded).expect("the file is removed");

		assert_eq!(readable(&dir, &recorded), None);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_directory_under_an_accepted_name_is_not_a_picture() {
		let dir = temp_dir();
		let masquerading = dir.join("folder.png");
		fs::create_dir_all(&masquerading).expect("the directory exists");

		assert_eq!(readable(&dir, &masquerading.to_string_lossy()), None);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_sweep_keeps_what_is_referenced_and_removes_the_rest() {
		let dir = temp_dir();
		let kept = a_stored_avatar(&dir);
		let dropped = a_stored_avatar(&dir);

		sweep(&dir, std::slice::from_ref(&kept));

		assert!(Path::new(&kept).exists(), "a referenced picture was swept");
		assert!(!Path::new(&dropped).exists(), "an unreferenced picture stayed behind");
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// Nothing references anything, which is every bot deleted: the directory is
	/// left empty rather than left holding what those bots wore.
	#[test]
	fn a_sweep_with_nothing_referenced_empties_the_directory() {
		let dir = temp_dir();
		a_stored_avatar(&dir);
		a_stored_avatar(&dir);

		sweep(&dir, &[]);

		assert_eq!(names_in(&dir), Vec::<String>::new());
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The order the store relies on: the row names the file before the file
	/// exists, and a sweep in that window must not take the name away.
	#[test]
	fn a_sweep_leaves_a_referenced_name_whose_file_is_not_written_yet() {
		let dir = temp_dir();
		let promised = minted_path(&dir);
		let existing = a_stored_avatar(&dir);

		sweep(&dir, &[promised.to_string_lossy().into_owned()]);

		assert!(!Path::new(&existing).exists(), "the replaced picture stayed behind");
		write(&promised, &picture::normalised(&a_png(8, 8)).expect("accepted"))
			.expect("the promised picture is written");
		assert!(promised.exists());
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// A path the sweep cannot vouch for is not a licence to delete anything: it
	/// names no file in here, so it keeps nothing and removes nothing extra.
	#[test]
	fn a_sweep_ignores_a_reference_that_points_outside_the_directory() {
		let dir = temp_dir();
		let stored = a_stored_avatar(&dir);

		sweep(&dir, &["/etc/passwd".to_owned(), stored.clone()]);

		assert!(Path::new(&stored).exists(), "a referenced picture was swept");
		assert!(Path::new("/etc/passwd").exists(), "the sweep reached outside its directory");
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The directory is asserted beside the file because writing one is what creates
	/// the other: a picture nobody else can read, sitting in a directory anybody can
	/// list, still tells them what a user uploaded and when.
	#[cfg(unix)]
	#[test]
	fn what_a_user_uploaded_is_reachable_by_its_owner_only() {
		use std::os::unix::fs::PermissionsExt;

		let dir = temp_dir();
		let recorded = a_stored_avatar(&dir);

		let mode = |path: &Path| fs::metadata(path).expect("metadata").permissions().mode() & 0o777;

		assert_eq!(mode(Path::new(&recorded)), 0o600, "an uploaded picture is world readable");
		assert_eq!(mode(&dir), 0o700, "the directory of uploaded pictures is world listable");
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// `dir` is resolved by every read of a bot, so it must not be the thing that
	/// creates the directory — and the write path must not depend on it having.
	#[test]
	fn the_first_picture_makes_the_directory_that_no_read_created() {
		let dir = temp_dir().join("not-yet");

		assert_eq!(readable(&dir, "anything.png"), None, "a read of a missing directory failed");
		sweep(&dir, &[]);
		assert!(!dir.exists(), "resolving or sweeping a directory created it");

		let recorded = a_stored_avatar(&dir);

		assert!(dir.is_dir(), "the first picture did not make the place it goes");
		assert_eq!(
			readable(&dir, &recorded),
			Some(PathBuf::from(&recorded).canonicalize().unwrap())
		);
		fs::remove_dir_all(dir.parent().expect("a parent")).expect("cleanup");
	}
}
