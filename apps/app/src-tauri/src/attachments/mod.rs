//! The directory a conversation's attached files live in, beside the avatars and
//! the conversation database, and the rules that decide what a stored one is
//! called.
//!
//! An attachment reaches Claude as an absolute path appended to the prompt, never
//! as bytes in a message, so a path is the whole of what storing one produces —
//! nothing here decodes, resizes or even looks at what was handed over. One
//! directory per conversation, because that is the unit the files are thrown away
//! in: a conversation gone is a directory gone.
//!
//! Nothing a caller sent reaches the path but the extension. The name a user's file
//! carried is their word, arriving from a webview, and a word is not a place —
//! [`minted_name`] answers a separator, a `..` and a name with no extension at all
//! the same way, with an identifier this host minted.
//!
//! The invariant is the avatars': **the directory holds exactly the conversations
//! the record still has.** It is restored by [`sweep`] after a bot is deleted rather
//! than maintained by remembering to delete, so a conversation deleted with its bot
//! and a directory left behind by a host that died mid-write are the same fact to
//! it, answered the same way.

pub mod commands;
pub mod contract;

use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};
use uuid::Uuid;

use crate::private_files;
use contract::SubmittedAttachment;

/// Beside `conversations.sqlite3` rather than in it, for the reason avatars are:
/// an attachment is bytes nothing queries, and rows of megabytes would sit in the
/// way of every read of the transcript.
const DIR_NAME: &str = "attachments";

/// The largest file accepted, counted on the bytes as they arrived. The whole call
/// is refused when one file is over it — a prompt is submitted with the files it
/// names, so storing the rest would leave the user to notice which one is missing.
const MAX_BYTES: u64 = 20 * 1024 * 1024;

/// What one call may carry. The per-file limit bounds a mistake; these two bound a
/// prompt, which the per-file limit alone does not — twenty files just under it is
/// four hundred megabytes, submitted as one array a webview holds in memory, sent
/// over one IPC message and held here whole a second time.
const MAX_ATTACHMENTS: usize = 20;
const MAX_TOTAL_BYTES: u64 = 100 * 1024 * 1024;

/// How much of a submitted name may become an extension. Long enough for the ones
/// that exist, short enough that the tail of a name a user typed cannot become the
/// bulk of a path.
const MAX_EXTENSION_LENGTH: usize = 16;

/// Why nothing was stored. Every variant leaves the disk as it was: a call either
/// puts every file down or none of them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Rejection {
	/// More files than one prompt may carry.
	TooMany { count: usize, limit: usize },
	/// One file was over the limit, named so the UI can say which. Carries the
	/// limit too, so the frontend does not hold a second copy of the number.
	TooLarge { name: String, bytes: u64, limit: u64 },
	/// Every file under the limit and too much of them at once.
	TooLargeTogether { bytes: u64, limit: u64 },
	/// The disk refused, or there was nowhere to put the file.
	Unwritable { detail: String },
}

/// Where attachments live for this install: a path, and nothing on the disk.
/// [`store`] makes the place, on the one path that is about to put a file in it, so
/// a directory that is not there yet is normal — it is what an install that has
/// never attached anything looks like, and [`sweep`] has nothing to sweep.
///
/// `None` is a host with no app data directory, the same outcome the database
/// reports: attachments are unavailable for the run rather than the launch failing.
pub fn dir<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
	Some(app.path().app_data_dir().ok()?.join(DIR_NAME))
}

/// The one directory a conversation's files go in. The id is used verbatim because
/// the caller has already matched it against the record — see
/// [`commands::chat_store_attachments`], where being a known conversation is what
/// makes an id a name rather than a caller's word.
fn conversation_dir(root: &Path, conversation_id: &str) -> PathBuf {
	root.join(conversation_id)
}

/// The name a submitted file takes on this disk: a fresh identifier, plus the
/// extension of the submitted name when it has a plain one.
///
/// The extension is kept because it is what tells Claude and the editor a user
/// opens the file in what it is. It is lowercased so two spellings of one format
/// are one name, and it is bounded and restricted to ASCII alphanumerics because
/// what comes after the last dot of a name from a webview is still that webview's
/// text — a name with no plain extension is stored under the identifier alone.
fn minted_name(submitted: &str) -> String {
	let id = Uuid::new_v4();
	match plain_extension(submitted) {
		Some(extension) => format!("{id}.{extension}"),
		None => id.to_string(),
	}
}

/// Every file down, or none. What comes back is the absolute path of each one, in
/// the order they were submitted — the order the prompt names them in.
///
/// The names are minted before the first write so that what a failure takes back
/// is the whole list rather than a tally kept as it went. The file a write stopped
/// in the middle of is on that list, which is the point: it exists, it holds part
/// of what a user picked, and nothing else would ever come back for it. Paths the
/// call never reached are on it too, and [`take_back`] answers those the way it
/// answers any file that is not there.
pub fn store(
	root: &Path,
	conversation_id: &str,
	submitted: &[SubmittedAttachment],
) -> Result<Vec<PathBuf>, Rejection> {
	refuse(submitted)?;
	let dir = conversation_dir(root, conversation_id);
	let paths: Vec<PathBuf> =
		submitted.iter().map(|attachment| dir.join(minted_name(&attachment.name))).collect();
	for (path, attachment) in paths.iter().zip(submitted) {
		if let Err(error) = private_files::write(path, &attachment.bytes) {
			take_back(&paths);
			return Err(unwritable(error));
		}
	}
	Ok(paths)
}

/// The sweep as its caller runs it: after a bot is deleted, against the whole of
/// what the file still holds. Kept here beside the invariant it restores, the way
/// [`crate::avatars::sweep_referenced`] is — a second copy of "which conversations
/// survive" would be a second answer, and the one that forgot a record would delete
/// files somebody is still talking about.
///
/// Silent by design, and `None` for the directory is a run with nowhere to keep
/// attachments: a sweep is housekeeping after a delete that already landed, so
/// telling a caller a leftover file could not be removed would be handing it a
/// failure it has nothing to do about.
pub async fn sweep_referenced(database: &crate::db::Database, dir: Option<&Path>) {
	let Some(dir) = dir else {
		return;
	};
	if let Ok(referenced) = database.conversations().conversation_ids().await {
		sweep(dir, &referenced);
	}
}

/// Leaves the root holding exactly the conversations `referenced` names, and
/// removes every other entry with everything under it. Run after a bot is deleted,
/// which is when the conversations it held stop being on the record.
pub fn sweep(root: &Path, referenced: &[String]) {
	let Ok(entries) = fs::read_dir(root) else {
		return;
	};
	for entry in entries.flatten() {
		if referenced.iter().any(|id| OsStr::new(id) == entry.file_name()) {
			continue;
		}
		let path = entry.path();
		let _ = fs::remove_dir_all(&path).or_else(|_| fs::remove_file(&path));
	}
}

/// The three limits a call is under, all of them read before anything reaches the
/// disk so a refusal is a value returned rather than files to take back.
///
/// The count first because it costs nothing to know, then the one file a user has
/// to swap — named, because that is what they can act on — and last what the files
/// weigh together, which is the only one of the three that answers a caller sending
/// twenty perfectly acceptable files at once.
fn refuse(submitted: &[SubmittedAttachment]) -> Result<(), Rejection> {
	if submitted.len() > MAX_ATTACHMENTS {
		return Err(Rejection::TooMany { count: submitted.len(), limit: MAX_ATTACHMENTS });
	}
	if let Some(attachment) = submitted.iter().find(|it| it.bytes.len() as u64 > MAX_BYTES) {
		return Err(Rejection::TooLarge {
			name: attachment.name.clone(),
			bytes: attachment.bytes.len() as u64,
			limit: MAX_BYTES,
		});
	}
	let total: u64 = submitted.iter().map(|attachment| attachment.bytes.len() as u64).sum();
	if total > MAX_TOTAL_BYTES {
		return Err(Rejection::TooLargeTogether { bytes: total, limit: MAX_TOTAL_BYTES });
	}
	Ok(())
}

fn take_back(stored: &[PathBuf]) {
	for path in stored {
		let _ = fs::remove_file(path);
	}
}

fn plain_extension(submitted: &str) -> Option<String> {
	let extension = Path::new(submitted).extension()?.to_str()?.to_lowercase();
	let is_plain = !extension.is_empty()
		&& extension.len() <= MAX_EXTENSION_LENGTH
		&& extension.chars().all(|character| character.is_ascii_alphanumeric());
	is_plain.then_some(extension)
}

fn unwritable(error: std::io::Error) -> Rejection {
	Rejection::Unwritable { detail: error.to_string() }
}

#[cfg(test)]
mod tests {
	use super::*;

	const CONVERSATION: &str = "c1";

	fn temp_root() -> PathBuf {
		std::env::temp_dir().join(format!("opennest-attachments-{}", Uuid::new_v4()))
	}

	fn an_attachment(name: &str, bytes: &[u8]) -> SubmittedAttachment {
		SubmittedAttachment { name: name.to_owned(), bytes: bytes.to_vec() }
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

	fn extension_of(path: &Path) -> Option<String> {
		path.extension()?.to_str().map(str::to_owned)
	}

	/// The whole of what storing does: the bytes are on the disk, under the
	/// conversation, and the answer is the absolute path of each one in the order
	/// they were handed over — which is the order the prompt will name them in.
	#[test]
	fn every_submitted_file_is_written_under_its_conversation_and_answered_as_a_path() {
		let root = temp_root();

		let stored = store(
			&root,
			CONVERSATION,
			&[an_attachment("notes.md", b"first"), an_attachment("shot.PNG", b"second")],
		)
		.expect("the attachments are stored");

		let dir = conversation_dir(&root, CONVERSATION);
		assert_eq!(stored.len(), 2);
		assert!(stored
			.iter()
			.all(|path| path.is_absolute() && path.parent() == Some(dir.as_path())));
		assert_eq!(fs::read(&stored[0]).expect("the first file"), b"first");
		assert_eq!(fs::read(&stored[1]).expect("the second file"), b"second");
		assert_eq!(names_in(&dir).len(), 2, "two files landed under one name");
		fs::remove_dir_all(&root).expect("cleanup");
	}

	/// Two files called the same thing are two files: the name is minted, so a
	/// second submission cannot land on the first one's path.
	#[test]
	fn two_files_submitted_under_one_name_are_two_files() {
		let root = temp_root();

		let stored = store(
			&root,
			CONVERSATION,
			&[an_attachment("a.txt", b"one"), an_attachment("a.txt", b"two")],
		)
		.expect("the attachments are stored");

		assert_ne!(stored[0], stored[1]);
		assert_eq!(fs::read(&stored[0]).expect("the first file"), b"one");
		assert_eq!(fs::read(&stored[1]).expect("the second file"), b"two");
		fs::remove_dir_all(&root).expect("cleanup");
	}

	/// Two conversations never share a directory, which is what lets one be thrown
	/// away without reading the other.
	#[test]
	fn two_conversations_store_into_directories_of_their_own() {
		let root = temp_root();

		let first = store(&root, "c1", &[an_attachment("a.txt", b"one")]).expect("stored");
		let second = store(&root, "c2", &[an_attachment("a.txt", b"two")]).expect("stored");

		assert_ne!(first[0].parent(), second[0].parent());
		assert_eq!(names_in(&root), vec!["c1".to_owned(), "c2".to_owned()]);
		fs::remove_dir_all(&root).expect("cleanup");
	}

	/// The extension is what survives a name, and nothing else does. Every one of
	/// these lands directly inside the conversation's directory — a name that tried
	/// to say where the file goes was not asked.
	#[test]
	fn a_name_that_names_a_place_stores_under_the_minted_one_anyway() {
		let root = temp_root();
		let dir = conversation_dir(&root, CONVERSATION);

		let stored = store(
			&root,
			CONVERSATION,
			&[
				an_attachment("../../etc/passwd", b"escaping"),
				an_attachment("/etc/hosts", b"absolute"),
				an_attachment("..", b"parent"),
				an_attachment("plain", b"no extension"),
				an_attachment("report.PDF", b"shouting"),
			],
		)
		.expect("the attachments are stored");

		assert!(
			stored.iter().all(|path| path.parent() == Some(dir.as_path())),
			"a name reached the path"
		);
		assert_eq!(extension_of(&stored[0]), None, "a walked path kept an extension");
		assert_eq!(extension_of(&stored[1]), None);
		assert_eq!(extension_of(&stored[2]), None);
		assert_eq!(extension_of(&stored[3]), None);
		assert_eq!(extension_of(&stored[4]), Some("pdf".to_owned()), "an extension was not kept");
		assert_eq!(names_in(&dir).len(), 5);
		fs::remove_dir_all(&root).expect("cleanup");
	}

	/// An extension is text from a webview until it is proved plain: anything that
	/// is not short and alphanumeric is left off rather than carried into a path.
	#[test]
	fn an_extension_that_is_not_plain_is_left_off_the_minted_name() {
		let overlong = format!("archive.{}", "z".repeat(MAX_EXTENSION_LENGTH + 1));

		assert_eq!(plain_extension("photo.jpeg"), Some("jpeg".to_owned()));
		assert_eq!(plain_extension("photo.JPEG"), Some("jpeg".to_owned()));
		assert_eq!(plain_extension("archive.tar.gz"), Some("gz".to_owned()));
		assert_eq!(plain_extension(&overlong), None);
		assert_eq!(plain_extension("odd.p g"), None);
		assert_eq!(plain_extension("odd.p/g"), None);
		assert_eq!(plain_extension(".gitignore"), None);
		assert_eq!(plain_extension("plain"), None);
	}

	/// One file over the limit refuses the call, and the ones beside it are not
	/// stored either: a prompt goes out with the files it names, so a partial store
	/// would be a prompt naming a file nobody accepted.
	#[test]
	fn one_oversized_file_refuses_the_whole_call_and_leaves_nothing_behind() {
		let root = temp_root();
		let oversized = vec![0u8; (MAX_BYTES + 1) as usize];

		let rejection = store(
			&root,
			CONVERSATION,
			&[
				an_attachment("small.txt", b"kept out"),
				an_attachment("huge.bin", &oversized),
				an_attachment("other.txt", b"kept out too"),
			],
		)
		.expect_err("the call is refused");

		assert_eq!(
			rejection,
			Rejection::TooLarge {
				name: "huge.bin".to_owned(),
				bytes: MAX_BYTES + 1,
				limit: MAX_BYTES
			}
		);
		assert!(!root.exists(), "a refused call made the place its files would have gone");
	}

	/// The failure the disk cannot be asked for: a file created, half of it written,
	/// and the write refused. What must not survive it is that half — nothing else
	/// would ever come back for it — and neither must the file written before it.
	#[test]
	fn a_write_that_stops_partway_takes_back_its_own_file_and_the_ones_before_it() {
		let root = temp_root();
		private_files::interrupt_the_write_after(1);

		let rejection = store(
			&root,
			CONVERSATION,
			&[
				an_attachment("first.txt", b"whole"),
				an_attachment("second.txt", b"stopped partway"),
				an_attachment("third.txt", b"never reached"),
			],
		)
		.expect_err("the call is refused");

		assert!(matches!(rejection, Rejection::Unwritable { .. }));
		assert_eq!(
			names_in(&conversation_dir(&root, CONVERSATION)),
			Vec::<String>::new(),
			"a call that stopped partway left files behind"
		);
		fs::remove_dir_all(&root).expect("cleanup");
	}

	/// A count is not a size: twenty acceptable files are still twenty files this
	/// host holds in memory whole, and the prompt they would be appended to is not
	/// a list nobody bounded.
	#[test]
	fn more_files_than_one_prompt_may_carry_are_refused_and_nothing_is_written() {
		let root = temp_root();
		let submitted: Vec<SubmittedAttachment> =
			(0..=MAX_ATTACHMENTS).map(|_| an_attachment("a.txt", b"small")).collect();

		let rejection = store(&root, CONVERSATION, &submitted).expect_err("the call is refused");

		assert_eq!(
			rejection,
			Rejection::TooMany { count: MAX_ATTACHMENTS + 1, limit: MAX_ATTACHMENTS }
		);
		assert!(!root.exists(), "a refused call made the place its files would have gone");
	}

	/// The limit the per-file one does not answer: every file here would be accepted
	/// on its own, and the call is what is too big.
	#[test]
	fn files_that_are_each_accepted_and_too_much_together_are_refused() {
		let root = temp_root();
		let each = MAX_BYTES / 2;
		let count = (MAX_TOTAL_BYTES / each) + 1;
		let submitted: Vec<SubmittedAttachment> =
			(0..count).map(|_| an_attachment("a.bin", &vec![0u8; each as usize])).collect();

		let rejection = store(&root, CONVERSATION, &submitted).expect_err("the call is refused");

		assert_eq!(
			rejection,
			Rejection::TooLargeTogether { bytes: each * count, limit: MAX_TOTAL_BYTES }
		);
		assert!(!root.exists(), "a refused call made the place its files would have gone");
	}

	/// Exactly at the limit is accepted: the refusal is what is over it.
	#[test]
	fn a_file_at_the_limit_is_stored() {
		let root = temp_root();
		let at_limit = vec![0u8; MAX_BYTES as usize];

		let stored = store(&root, CONVERSATION, &[an_attachment("edge.bin", &at_limit)])
			.expect("the attachment is stored");

		assert_eq!(stored.len(), 1);
		fs::remove_dir_all(&root).expect("cleanup");
	}

	#[test]
	fn a_sweep_keeps_the_conversations_on_the_record_and_removes_the_rest() {
		let root = temp_root();
		let kept = store(&root, "c1", &[an_attachment("a.txt", b"kept")]).expect("stored");
		let dropped = store(&root, "c2", &[an_attachment("a.txt", b"dropped")]).expect("stored");

		sweep(&root, &["c1".to_owned()]);

		assert!(kept[0].exists(), "a conversation on the record lost its attachments");
		assert!(!dropped[0].exists(), "a deleted conversation kept its attachments");
		assert!(!conversation_dir(&root, "c2").exists(), "an empty directory stayed behind");
		assert_eq!(names_in(&root), vec!["c1".to_owned()]);
		fs::remove_dir_all(&root).expect("cleanup");
	}

	/// Nothing on the record is every bot deleted: the root is left empty rather
	/// than left holding what those conversations carried.
	#[test]
	fn a_sweep_with_nothing_referenced_empties_the_root() {
		let root = temp_root();
		store(&root, "c1", &[an_attachment("a.txt", b"one")]).expect("stored");
		store(&root, "c2", &[an_attachment("b.txt", b"two")]).expect("stored");

		sweep(&root, &[]);

		assert_eq!(names_in(&root), Vec::<String>::new());
		fs::remove_dir_all(&root).expect("cleanup");
	}

	/// A root that was never made is not a failure to sweep — it is an install that
	/// has never attached anything, and the sweep must not create one.
	#[test]
	fn a_sweep_of_a_root_that_is_not_there_creates_nothing() {
		let root = temp_root();

		sweep(&root, &["c1".to_owned()]);

		assert!(!root.exists(), "sweeping made the directory it had nothing to sweep");
	}

	/// The directory is asserted beside the files because writing one makes the
	/// other: a file nobody else can read, in a directory anybody can list, still
	/// tells them what a user attached and when.
	#[cfg(unix)]
	#[test]
	fn what_a_user_attached_is_reachable_by_its_owner_only() {
		use std::os::unix::fs::PermissionsExt;

		let root = temp_root();
		let stored = store(&root, CONVERSATION, &[an_attachment("a.txt", b"private")])
			.expect("the attachment is stored");

		let mode = |path: &Path| fs::metadata(path).expect("metadata").permissions().mode() & 0o777;

		assert_eq!(mode(&stored[0]), 0o600, "an attachment is world readable");
		assert_eq!(mode(&conversation_dir(&root, CONVERSATION)), 0o700);
		assert_eq!(mode(&root), 0o700, "the directory of attachments is world listable");
		fs::remove_dir_all(&root).expect("cleanup");
	}
}
