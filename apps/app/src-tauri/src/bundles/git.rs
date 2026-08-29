
use std::fs;
use std::path::Path;

use git2::build::CheckoutBuilder;
use git2::{
	Commit, Diff, DiffFormat, IndexAddOption, Oid, Repository, Signature, Sort, StatusOptions, Tree,
};

use super::{LEARNED_NAME, MCP_NAME};
use crate::private_files;

const EXCLUDED: [&str; 2] = [LEARNED_NAME, MCP_NAME];

const INFO_DIR: &str = "info";
const EXCLUDE_NAME: &str = "exclude";

const USER_NAME: &str = "Reader";
const USER_MAIL: &str = "user@opennest.local";
const BOT_NAME: &str = "Bot";
const BOT_MAIL: &str = "bot@opennest.local";

const EVERYTHING: &str = "*";

const HEAD: &str = "HEAD";

const UNDONE: &str = "Change undone";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Author {
	User,
	Bot,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HistoryEntry {
	pub id: String,
	pub timestamp: i64,
	pub author: Author,
	pub title: String,
	pub body: String,
}

pub fn commit(
	bundle: &Path,
	author: Author,
	title: &str,
	body: &str,
) -> Result<Option<String>, git2::Error> {
	let repository = opened(bundle)?;
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

pub fn changes(bundle: &Path) -> Vec<String> {
	let Ok(repository) = Repository::open(bundle) else {
		return Vec::new();
	};
	let mut options = StatusOptions::new();
	options.include_untracked(true).recurse_untracked_dirs(true).include_ignored(false);
	let Ok(statuses) = repository.statuses(Some(&mut options)) else {
		return Vec::new();
	};
	let mut paths: Vec<String> =
		statuses.iter().filter_map(|status| status.path().map(str::to_owned).ok()).collect();
	paths.sort();
	paths
}

pub fn history(bundle: &Path) -> Result<Vec<HistoryEntry>, git2::Error> {
	let repository = Repository::open(bundle)?;
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

pub fn diff(bundle: &Path, commit_id: &str) -> Result<String, git2::Error> {
	let repository = Repository::open(bundle)?;
	let commit = repository.find_commit(Oid::from_str(commit_id)?)?;
	let parent = commit.parent(0).ok();
	let before = parent.as_ref().map(Commit::tree).transpose()?;
	let after = commit.tree()?;
	let diff = repository.diff_tree_to_tree(before.as_ref(), Some(&after), None)?;
	printed(&diff)
}

pub fn revert(bundle: &Path, commit_id: &str) -> Result<String, git2::Error> {
	let repository = Repository::open(bundle)?;
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

fn opened(bundle: &Path) -> Result<Repository, git2::Error> {
	let repository = match Repository::open(bundle) {
		Ok(repository) => repository,
		Err(_) => Repository::init(bundle)?,
	};
	exclude(&repository);
	Ok(repository)
}

fn exclude(repository: &Repository) {
	let path = repository.path().join(INFO_DIR).join(EXCLUDE_NAME);
	let mut text = fs::read_to_string(&path).unwrap_or_default();
	let missing: Vec<&str> = EXCLUDED
		.into_iter()
		.filter(|name| !text.lines().any(|line| line.trim() == *name))
		.collect();
	if missing.is_empty() {
		return;
	}
	if !text.is_empty() && !text.ends_with('\n') {
		text.push('\n');
	}
	for name in missing {
		text.push_str(name);
		text.push('\n');
	}
	let _ = private_files::replace(&path, text.as_bytes());
}

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

fn authored(mail: &str) -> Author {
	if mail == BOT_MAIL {
		Author::Bot
	} else {
		Author::User
	}
}

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
