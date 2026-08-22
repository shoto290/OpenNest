//! Every bundle is its own repository, and every write to one is a commit in it.
//!
//! The repository lives at the bundle root — `plugins/<bot id>/.git` — so a bot's
//! whole record travels with the directory a reader can copy, back up or hand to
//! somebody else. Nothing here asks the machine for a `git` binary: libgit2 is
//! compiled in, and no transport is, so a bundle's history never leaves the disk.
//!
//! A title is read by somebody who has never seen a diff: a sentence naming the
//! write and what it was about, no path and no jargon. The callers in
//! [`super`] spell them, because they are the ones that know what was written.
//!
//! Recording is never a reason to fail a write. The files are what a session is
//! really started on; the history is what a reader looks at afterwards. A
//! repository that will not open or write is swallowed at the write and surfaces
//! from [`history`], [`diff`] and [`revert`] — the three places a caller asked for
//! the history and can be told there is none.

use std::fs;
use std::path::Path;

use git2::build::CheckoutBuilder;
use git2::{Commit, Diff, DiffFormat, IndexAddOption, Oid, Repository, Signature, Sort, Tree};

use super::dir;
use crate::private_files;

/// What a bot writes down for itself between turns, which is memory rather than
/// history: it changes on its own, under nobody's gesture, and a reader scrolling
/// their bot's writes is not looking for it. Excluded in the repository's own
/// `info/exclude` rather than in a `.gitignore`, because a `.gitignore` is a file in
/// the bundle and this is not a rule anybody outside this app agreed to.
const EXCLUDED: &str = ".learned.md";

const INFO_DIR: &str = "info";
const EXCLUDE_NAME: &str = "exclude";

/// Whose gesture a commit was, written into the address rather than the name: a
/// display name is what a reader sees in any other git tool and may as well read
/// well, and the address is what this module reads the kind back from.
const USER_NAME: &str = "Reader";
const USER_MAIL: &str = "user@opennest.local";
const BOT_NAME: &str = "Bot";
const BOT_MAIL: &str = "bot@opennest.local";

/// Everything in the working directory, which is what every commit here is: the
/// bundle as it stands, never a selection of it.
const EVERYTHING: &str = "*";

const HEAD: &str = "HEAD";

const UNDONE: &str = "Change undone";

/// Who a write came from. The bot's own writes are recorded by a later change and
/// carry [`Author::Bot`]; everything a reader does in the settings dialog carries
/// [`Author::User`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Author {
	User,
	Bot,
}

/// One write to a bundle, as the history reads it back.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HistoryEntry {
	pub id: String,
	/// Seconds since the epoch, which is what the commit itself holds.
	pub timestamp: i64,
	pub author: Author,
	pub title: String,
	/// Everything under the title, trimmed. Empty for the writes that need no
	/// second sentence, which is most of them.
	pub body: String,
}

/// The bundle as it stands right now, recorded. The repository is created on the
/// first call, with everything already in the directory in that first commit: a
/// bundle written before this app kept any history joins it whole rather than
/// starting empty and growing a fake past.
///
/// `Ok(None)` is a write that left the tree exactly as it was — a save of values
/// nobody changed, a mark set to what it already was — which is no commit at all.
pub fn commit(
	root: &Path,
	bot_id: &str,
	author: Author,
	title: &str,
	body: &str,
) -> Result<Option<String>, git2::Error> {
	let repository = opened(root, bot_id)?;
	let tree = staged(&repository)?;
	let parent = head(&repository);
	if parent.as_ref().is_some_and(|found| found.tree_id() == tree.id()) {
		return Ok(None);
	}
	let parents: Vec<&Commit> = parent.iter().collect();
	let signature = signed(author)?;
	let id = repository.commit(
		Some(HEAD),
		&signature,
		&signature,
		&message(title, body),
		&tree,
		&parents,
	)?;
	Ok(Some(id.to_string()))
}

/// Every write to the bundle, newest first. Ordered by what came after what rather
/// than by the clock: a reader making three gestures in one second is three writes
/// in the order they made them, and a commit's own time only reaches one second.
///
/// A bundle with a repository nothing has committed to yet reads as no writes
/// rather than as a failure.
pub fn history(root: &Path, bot_id: &str) -> Result<Vec<HistoryEntry>, git2::Error> {
	let repository = Repository::open(dir(root, bot_id))?;
	let Some(head) = head(&repository) else {
		return Ok(Vec::new());
	};
	let mut walk = repository.revwalk()?;
	walk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)?;
	walk.push(head.id())?;
	Ok(walk
		.filter_map(Result::ok)
		.filter_map(|id| repository.find_commit(id).ok())
		.map(|commit| entry(&commit))
		.collect())
}

/// What one write changed, as a unified diff against what came before it. The very
/// first commit has nothing before it, so it reads as every file being added.
pub fn diff(root: &Path, bot_id: &str, commit_id: &str) -> Result<String, git2::Error> {
	let repository = Repository::open(dir(root, bot_id))?;
	let commit = repository.find_commit(Oid::from_str(commit_id)?)?;
	let parent = commit.parent(0).ok();
	let before = parent.as_ref().map(Commit::tree).transpose()?;
	let after = commit.tree()?;
	let diff = repository.diff_tree_to_tree(before.as_ref(), Some(&after), None)?;
	printed(&diff)
}

/// The write undone, as a new write on top rather than a past rewritten: the
/// history keeps saying what happened, and says that somebody took it back.
///
/// The working directory is laid down again from the result, so the bundle on the
/// disk — which is what a session is started on — is what the history says it is.
///
/// A change that cannot be undone on top of what the bundle holds now is refused
/// whole, and nothing on the disk moves.
pub fn revert(root: &Path, bot_id: &str, commit_id: &str) -> Result<String, git2::Error> {
	let repository = Repository::open(dir(root, bot_id))?;
	let commit = repository.find_commit(Oid::from_str(commit_id)?)?;
	let head = head(&repository)
		.ok_or_else(|| git2::Error::from_str("this bundle has no write to undo"))?;
	let mut index = repository.revert_commit(&commit, &head, 0, None)?;
	if index.has_conflicts() {
		return Err(git2::Error::from_str("this write cannot be undone on top of the later ones"));
	}
	let tree = repository.find_tree(index.write_tree_to(&repository)?)?;
	let signature = signed(Author::User)?;
	let id = repository.commit(
		Some(HEAD),
		&signature,
		&signature,
		&message(&undone(&commit), ""),
		&tree,
		&[&head],
	)?;
	repository.checkout_head(Some(CheckoutBuilder::new().force()))?;
	Ok(id.to_string())
}

/// The bundle's repository, created if it is not one yet. The exclusion is settled
/// on every open rather than only at creation, so a bundle somebody made a
/// repository of themselves gets it too.
fn opened(root: &Path, bot_id: &str) -> Result<Repository, git2::Error> {
	let bundle = dir(root, bot_id);
	let repository = match Repository::open(&bundle) {
		Ok(repository) => repository,
		Err(_) => Repository::init(&bundle)?,
	};
	exclude(&repository);
	Ok(repository)
}

/// [`EXCLUDED`] listed in the repository's own exclude file, once. Failing to write
/// it is not a reason to lose the commit: the worst of it is one file recorded that
/// nobody wanted recorded.
fn exclude(repository: &Repository) {
	let path = repository.path().join(INFO_DIR).join(EXCLUDE_NAME);
	let mut text = fs::read_to_string(&path).unwrap_or_default();
	if text.lines().any(|line| line.trim() == EXCLUDED) {
		return;
	}
	if !text.is_empty() && !text.ends_with('\n') {
		text.push('\n');
	}
	text.push_str(EXCLUDED);
	text.push('\n');
	let _ = private_files::replace(&path, text.as_bytes());
}

/// The working directory as a tree. The index is emptied first, so what is
/// committed is what the directory holds and not what it held plus whatever an
/// earlier call left staged — which is how a removal reaches the history at all.
fn staged(repository: &Repository) -> Result<Tree<'_>, git2::Error> {
	let mut index = repository.index()?;
	index.clear()?;
	index.add_all([EVERYTHING], IndexAddOption::DEFAULT, None)?;
	index.write()?;
	let id = index.write_tree()?;
	repository.find_tree(id)
}

fn head(repository: &Repository) -> Option<Commit<'_>> {
	repository.head().ok()?.peel_to_commit().ok()
}

fn signed(author: Author) -> Result<Signature<'static>, git2::Error> {
	match author {
		Author::User => Signature::now(USER_NAME, USER_MAIL),
		Author::Bot => Signature::now(BOT_NAME, BOT_MAIL),
	}
}

/// The kind an address names. Anything this module did not write reads as a
/// reader's: a commit a hand made in the bundle is somebody's gesture, and the one
/// thing it certainly is not is the bot's.
fn authored(mail: &str) -> Author {
	if mail == BOT_MAIL {
		Author::Bot
	} else {
		Author::User
	}
}

/// The title, and the body under the blank line git reads one by.
fn message(title: &str, body: &str) -> String {
	let title = title.trim();
	let body = body.trim();
	if body.is_empty() {
		format!("{title}\n")
	} else {
		format!("{title}\n\n{body}\n")
	}
}

fn undone(commit: &Commit) -> String {
	format!("{UNDONE}: {}", summary(commit))
}

/// The first line of a message, which is the title a reader is shown.
fn summary(commit: &Commit) -> String {
	commit.summary().ok().flatten().unwrap_or_default().to_owned()
}

fn entry(commit: &Commit) -> HistoryEntry {
	HistoryEntry {
		id: commit.id().to_string(),
		timestamp: commit.time().seconds(),
		author: authored(commit.author().email().unwrap_or_default()),
		title: summary(commit),
		body: commit.body().ok().flatten().unwrap_or_default().trim().to_owned(),
	}
}

/// The diff as text, origin marker and all — the `+`, `-` and space git prints each
/// line of a hunk under, which the headers between hunks do not carry.
fn printed(diff: &Diff) -> Result<String, git2::Error> {
	let mut text = String::new();
	diff.print(DiffFormat::Patch, |_, _, line| {
		if matches!(line.origin(), '+' | '-' | ' ') {
			text.push(line.origin());
		}
		text.push_str(&String::from_utf8_lossy(line.content()));
		true
	})?;
	Ok(text)
}
