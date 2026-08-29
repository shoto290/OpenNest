use std::collections::BTreeMap;
use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use serde::Deserialize;

use crate::private_files;

use super::contract::{HeldBy, SecretError};

type Held = BTreeMap<String, HeldBy>;
type Names = BTreeMap<String, Held>;

static WRITING: Mutex<()> = Mutex::new(());

fn one_writer_at_a_time() -> MutexGuard<'static, ()> {
	WRITING.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[derive(Deserialize)]
#[serde(untagged)]
enum Entries {
	Recorded(Held),
	WrittenBefore(Vec<String>),
}

impl From<Entries> for Held {
	fn from(entries: Entries) -> Self {
		match entries {
			Entries::Recorded(held) => held,
			Entries::WrittenBefore(names) => {
				names.into_iter().map(|name| (name, HeldBy::Unknown)).collect()
			}
		}
	}
}

pub fn keys(path: &Path, owner: &str) -> Result<Vec<String>, SecretError> {
	Ok(read(path)?.remove(owner).unwrap_or_default().into_keys().collect())
}

pub fn held_by(path: &Path, owner: &str, key: &str) -> Result<HeldBy, SecretError> {
	Ok(read(path)?
		.get(owner)
		.and_then(|held| held.get(key))
		.copied()
		.unwrap_or(HeldBy::Unknown))
}

pub fn owners_under(path: &Path, prefix: &str) -> Result<Vec<String>, SecretError> {
	Ok(read(path)?.into_keys().filter(|owner| owner.starts_with(prefix)).collect())
}

pub fn remember(
	path: &Path,
	owner: &str,
	key: &str,
	backend: HeldBy,
) -> Result<(), SecretError> {
	let _writing = one_writer_at_a_time();
	let mut names = read(path)?;
	let kept = names.entry(owner.to_owned()).or_default();
	if kept.get(key) == Some(&backend) {
		return Ok(());
	}
	kept.insert(key.to_owned(), backend);
	write(path, &names)
}

pub fn forget(path: &Path, owner: &str, key: &str) -> Result<(), SecretError> {
	let _writing = one_writer_at_a_time();
	let mut names = read(path)?;
	let Some(kept) = names.get_mut(owner) else {
		return Ok(());
	};
	if kept.remove(key).is_none() {
		return Ok(());
	}
	if kept.is_empty() {
		names.remove(owner);
	}
	write(path, &names)
}

fn read(path: &Path) -> Result<Names, SecretError> {
	let bytes = match std::fs::read(path) {
		Ok(bytes) => bytes,
		Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Names::new()),
		Err(error) => return Err(SecretError::IndexUnreadable { detail: error.to_string() }),
	};
	let read: BTreeMap<String, Entries> = serde_json::from_slice(&bytes)
		.map_err(|error| SecretError::IndexUnreadable { detail: error.to_string() })?;
	Ok(read.into_iter().map(|(owner, entries)| (owner, entries.into())).collect())
}

fn write(path: &Path, names: &Names) -> Result<(), SecretError> {
	let bytes = serde_json::to_vec(names)
		.map_err(|error| SecretError::IndexUnwritable { detail: error.to_string() })?;
	private_files::replace(path, &bytes)
		.map_err(|error| SecretError::IndexUnwritable { detail: error.to_string() })
}

#[cfg(test)]
mod tests {
	use super::*;

	fn an_index() -> std::path::PathBuf {
		let dir = std::env::temp_dir().join(format!("opennest-index-{}", uuid::Uuid::new_v4()));
		std::fs::create_dir_all(&dir).expect("temp dir");
		dir.join("index.json")
	}

	#[test]
	fn a_missing_index_names_nothing() {
		assert_eq!(keys(&an_index(), "bot"), Ok(Vec::new()));
	}

	#[test]
	fn names_are_kept_sorted_and_unique() {
		let path = an_index();
		remember(&path, "bot", "TOKEN", HeldBy::Vault).expect("remembers");
		remember(&path, "bot", "API_KEY", HeldBy::Vault).expect("remembers");
		remember(&path, "bot", "TOKEN", HeldBy::Vault).expect("remembers");

		assert_eq!(keys(&path, "bot"), Ok(vec!["API_KEY".to_owned(), "TOKEN".to_owned()]));
	}

	#[test]
	fn forgetting_the_last_name_drops_the_owner() {
		let path = an_index();
		remember(&path, "bot", "TOKEN", HeldBy::Vault).expect("remembers");
		forget(&path, "bot", "TOKEN").expect("forgets");

		assert_eq!(keys(&path, "bot"), Ok(Vec::new()));
	}

	#[test]
	fn one_owner_never_sees_another_owners_names() {
		let path = an_index();
		remember(&path, "first", "TOKEN", HeldBy::Vault).expect("remembers");
		remember(&path, "second", "OTHER", HeldBy::Vault).expect("remembers");

		assert_eq!(keys(&path, "first"), Ok(vec!["TOKEN".to_owned()]));
	}

	#[test]
	fn an_entry_names_the_backend_that_holds_it() {
		let path = an_index();
		remember(&path, "bot", "TOKEN", HeldBy::Keyring).expect("remembers");

		assert_eq!(held_by(&path, "bot", "TOKEN"), Ok(HeldBy::Keyring));
		assert_eq!(held_by(&path, "bot", "ABSENT"), Ok(HeldBy::Unknown));
	}

	#[test]
	fn an_index_written_before_the_backend_was_recorded_still_reads() {
		let path = an_index();
		std::fs::write(&path, br#"{"bot":["TOKEN","API_KEY"]}"#).expect("an older index");

		assert_eq!(keys(&path, "bot"), Ok(vec!["API_KEY".to_owned(), "TOKEN".to_owned()]));
		assert_eq!(held_by(&path, "bot", "TOKEN"), Ok(HeldBy::Unknown));
	}

	#[test]
	fn an_index_that_cannot_be_parsed_is_reported_and_never_replaced() {
		let path = an_index();
		std::fs::write(&path, b"{ not json").expect("a broken index");

		assert!(matches!(keys(&path, "bot"), Err(SecretError::IndexUnreadable { .. })));
		assert!(matches!(
			remember(&path, "bot", "TOKEN", HeldBy::Vault),
			Err(SecretError::IndexUnreadable { .. })
		));
		assert_eq!(std::fs::read(&path).expect("still there"), b"{ not json");
	}

	#[test]
	fn an_index_that_cannot_be_read_is_reported_and_never_replaced() {
		let path = an_index();
		std::fs::create_dir_all(&path).expect("a directory where the index should be");

		assert!(matches!(keys(&path, "bot"), Err(SecretError::IndexUnreadable { .. })));
		assert!(matches!(
			forget(&path, "bot", "TOKEN"),
			Err(SecretError::IndexUnreadable { .. })
		));
	}

	#[test]
	fn every_concurrent_write_lands_in_the_index() {
		let path = an_index();
		let names: Vec<String> = (0..24).map(|at| format!("KEY_{at:02}")).collect();

		std::thread::scope(|scope| {
			for name in &names {
				let path = path.clone();
				scope.spawn(move || {
					remember(&path, "bot", name, HeldBy::Vault).expect("remembers");
				});
			}
		});

		assert_eq!(keys(&path, "bot"), Ok(names));
	}

	#[test]
	fn an_interrupted_write_leaves_the_index_as_it_was() {
		let path = an_index();
		remember(&path, "bot", "TOKEN", HeldBy::Vault).expect("remembers");
		let written = std::fs::read(&path).expect("the index is on disk");

		crate::private_files::interrupt_the_write_after(0);
		assert!(remember(&path, "bot", "OTHER", HeldBy::Vault).is_err());

		assert_eq!(std::fs::read(&path).expect("still there"), written);
		assert_eq!(keys(&path, "bot"), Ok(vec!["TOKEN".to_owned()]));
	}
}
