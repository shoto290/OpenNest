use std::collections::BTreeMap;
use std::path::Path;

use crate::private_files;

use super::contract::SecretError;

type Names = BTreeMap<String, Vec<String>>;

pub fn keys(path: &Path, bot_id: &str) -> Vec<String> {
	read(path).remove(bot_id).unwrap_or_default()
}

pub fn remember(path: &Path, bot_id: &str, key: &str) -> Result<(), SecretError> {
	let mut names = read(path);
	let kept = names.entry(bot_id.to_owned()).or_default();
	if kept.iter().any(|known| known == key) {
		return Ok(());
	}
	kept.push(key.to_owned());
	kept.sort();
	write(path, &names)
}

pub fn forget(path: &Path, bot_id: &str, key: &str) -> Result<(), SecretError> {
	let mut names = read(path);
	let Some(kept) = names.get_mut(bot_id) else {
		return Ok(());
	};
	kept.retain(|known| known != key);
	if kept.is_empty() {
		names.remove(bot_id);
	}
	write(path, &names)
}

fn read(path: &Path) -> Names {
	std::fs::read(path).ok().and_then(|bytes| serde_json::from_slice(&bytes).ok()).unwrap_or_default()
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
		assert!(keys(&an_index(), "bot").is_empty());
	}

	#[test]
	fn names_are_kept_sorted_and_unique() {
		let path = an_index();
		remember(&path, "bot", "TOKEN").expect("remembers");
		remember(&path, "bot", "API_KEY").expect("remembers");
		remember(&path, "bot", "TOKEN").expect("remembers");
		assert_eq!(keys(&path, "bot"), vec!["API_KEY".to_owned(), "TOKEN".to_owned()]);
	}

	#[test]
	fn forgetting_the_last_name_drops_the_bot() {
		let path = an_index();
		remember(&path, "bot", "TOKEN").expect("remembers");
		forget(&path, "bot", "TOKEN").expect("forgets");
		assert!(keys(&path, "bot").is_empty());
	}

	#[test]
	fn one_bot_never_sees_another_bots_names() {
		let path = an_index();
		remember(&path, "first", "TOKEN").expect("remembers");
		remember(&path, "second", "OTHER").expect("remembers");
		assert_eq!(keys(&path, "first"), vec!["TOKEN".to_owned()]);
	}
}
