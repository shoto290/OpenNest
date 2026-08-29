use std::collections::{BTreeMap, BTreeSet};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use serde::Serialize;

use crate::agent::redact;

use super::contract::{account_for, is_usable_key, space_owner, SecretError, SecretScope, SERVICE};
use super::index;
use super::vault::Vault;

const DIR_NAME: &str = "secrets";
const INDEX_NAME: &str = "index.json";
const VAULT_NAME: &str = "vault.bin";
const PROBE_ACCOUNT: &str = "opennest:store-probe";
const PROBE_VALUE: &str = "probe";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Backend {
	Keyring,
	Vault,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Resolved {
	pub values: BTreeMap<String, String>,
	pub origins: BTreeMap<String, SecretScope>,
	pub unreadable: Vec<String>,
}

#[derive(Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredKeys {
	pub readable: Vec<String>,
	pub unreadable: Vec<String>,
	pub inherited_readable: Vec<String>,
	pub inherited_unreadable: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreStatus {
	pub is_ready: bool,
	pub needs_passphrase: bool,
	pub has_vault: bool,
}

pub struct SecretStore {
	dir: PathBuf,
	backend: OnceLock<Backend>,
	vault: Mutex<Vault>,
}

impl SecretStore {
	pub fn under(app_data: PathBuf) -> Self {
		let dir = app_data.join(DIR_NAME);
		let vault = Vault::at(dir.join(VAULT_NAME));
		Self { dir, backend: OnceLock::new(), vault: Mutex::new(vault) }
	}

	pub fn dir(&self) -> &PathBuf {
		&self.dir
	}

	pub fn backend(&self) -> Backend {
		*self.backend.get_or_init(|| {
			if keyring_answers() {
				Backend::Keyring
			} else {
				Backend::Vault
			}
		})
	}

	pub fn is_ready(&self) -> bool {
		self.backend() == Backend::Keyring || self.vault.lock().expect("vault").is_unlocked()
	}

	pub fn status(&self) -> StoreStatus {
		let is_ready = self.is_ready();

		StoreStatus {
			is_ready,
			needs_passphrase: !is_ready && self.backend() == Backend::Vault,
			has_vault: self.vault_path().exists(),
		}
	}

	pub fn stored_keys(&self, bot_id: &str, space_id: Option<&str>) -> StoredKeys {
		let (readable, unreadable) = self.split_keys(bot_id);
		let mut stored = StoredKeys { readable, unreadable, ..StoredKeys::default() };

		let Some(space_id) = space_id else {
			return stored;
		};
		let owned: BTreeSet<&String> =
			stored.readable.iter().chain(stored.unreadable.iter()).collect();
		let (readable, unreadable) = self.split_keys(&space_owner(space_id));
		stored.inherited_readable =
			readable.iter().filter(|key| !owned.contains(key)).cloned().collect();
		stored.inherited_unreadable =
			unreadable.iter().filter(|key| !owned.contains(key)).cloned().collect();
		stored
	}

	fn split_keys(&self, owner: &str) -> (Vec<String>, Vec<String>) {
		let mut readable = Vec::new();
		let mut unreadable = Vec::new();
		for key in self.keys(owner) {
			match self.read_value(&account_for(owner, &key)) {
				Ok(Some(_)) => readable.push(key),
				Ok(None) | Err(_) => unreadable.push(key),
			}
		}
		(readable, unreadable)
	}

	pub fn unlock(&self, passphrase: &str) -> Result<(), SecretError> {
		self.vault.lock().expect("vault").unlock(passphrase)
	}

	pub fn keys(&self, owner: &str) -> Vec<String> {
		index::keys(&self.index_path(), owner)
	}

	pub fn set(&self, owner: &str, key: &str, value: &str) -> Result<(), SecretError> {
		if !is_usable_key(key) {
			return Err(SecretError::InvalidKey { key: key.to_owned() });
		}
		let value = value.trim();
		if value.is_empty() {
			return Err(SecretError::EmptyValue);
		}
		self.write_value(&account_for(owner, key), value)?;
		redact::remember(value);
		index::remember(&self.index_path(), owner, key)
	}

	pub fn delete(&self, owner: &str, key: &str) -> Result<(), SecretError> {
		self.erase_value(&account_for(owner, key))?;
		index::forget(&self.index_path(), owner, key)
	}

	pub fn resolve(&self, bot_id: &str, space_id: Option<&str>) -> Resolved {
		let mut resolved = Resolved::default();
		if let Some(space_id) = space_id {
			self.gather(&space_owner(space_id), SecretScope::Space, &mut resolved);
		}
		self.gather(bot_id, SecretScope::Bot, &mut resolved);

		let values = &resolved.values;
		let mut unreadable: Vec<String> =
			resolved.unreadable.iter().filter(|key| !values.contains_key(*key)).cloned().collect();
		unreadable.sort();
		unreadable.dedup();
		resolved.unreadable = unreadable;
		resolved
	}

	fn gather(&self, owner: &str, scope: SecretScope, resolved: &mut Resolved) {
		for key in self.keys(owner) {
			match self.read_value(&account_for(owner, &key)) {
				Ok(Some(value)) => {
					redact::remember(&value);
					resolved.origins.insert(key.clone(), scope);
					resolved.values.insert(key, value);
				}
				Ok(None) | Err(_) => resolved.unreadable.push(key),
			}
		}
	}

	#[cfg(test)]
	pub fn force_vault_for_tests(&self) {
		let _ = self.backend.set(Backend::Vault);
	}

	fn index_path(&self) -> PathBuf {
		self.dir.join(INDEX_NAME)
	}

	fn vault_path(&self) -> PathBuf {
		self.dir.join(VAULT_NAME)
	}

	fn write_value(&self, account: &str, value: &str) -> Result<(), SecretError> {
		match self.backend() {
			Backend::Keyring => entry(account)?
				.set_password(value)
				.map_err(|error| SecretError::StoreUnavailable { detail: error.to_string() }),
			Backend::Vault => self.vault.lock().expect("vault").set(account, value),
		}
	}

	fn read_value(&self, account: &str) -> Result<Option<String>, SecretError> {
		match self.backend() {
			Backend::Keyring => match entry(account)?.get_password() {
				Ok(value) => Ok(Some(value)),
				Err(keyring::Error::NoEntry) => Ok(None),
				Err(error) => Err(SecretError::StoreUnavailable { detail: error.to_string() }),
			},
			Backend::Vault => self.vault.lock().expect("vault").get(account),
		}
	}

	fn erase_value(&self, account: &str) -> Result<(), SecretError> {
		match self.backend() {
			Backend::Keyring => match entry(account)?.delete_credential() {
				Ok(()) => Ok(()),
				Err(keyring::Error::NoEntry) => {
					Err(SecretError::NotFound { key: account.to_owned() })
				}
				Err(error) => Err(SecretError::StoreUnavailable { detail: error.to_string() }),
			},
			Backend::Vault => self.vault.lock().expect("vault").remove(account),
		}
	}
}

fn entry(account: &str) -> Result<keyring::Entry, SecretError> {
	keyring::Entry::new(SERVICE, account)
		.map_err(|error| SecretError::StoreUnavailable { detail: error.to_string() })
}

fn keyring_answers() -> bool {
	let Ok(probe) = keyring::Entry::new(SERVICE, PROBE_ACCOUNT) else {
		return false;
	};
	let round_trip = probe.set_password(PROBE_VALUE).is_ok()
		&& probe.get_password().is_ok_and(|value| value == PROBE_VALUE);
	let _ = probe.delete_credential();
	round_trip
}

#[cfg(test)]
mod tests {
	use super::*;

	fn a_store() -> SecretStore {
		let dir = std::env::temp_dir().join(format!("opennest-secrets-{}", uuid::Uuid::new_v4()));
		std::fs::create_dir_all(&dir).expect("temp dir");
		let store = SecretStore::under(dir);
		store.force_vault_for_tests();
		store.unlock("open sesame").expect("unlocks");
		store
	}

	const SPACE: &str = "space:s1";

	#[test]
	fn a_bot_falls_back_to_what_its_space_holds() {
		let store = a_store();
		store.set(SPACE, "SHARED", "from-the-space").expect("sets");

		let resolved = store.resolve("bot", Some("s1"));

		assert_eq!(resolved.values.get("SHARED").map(String::as_str), Some("from-the-space"));
		assert_eq!(resolved.origins.get("SHARED"), Some(&SecretScope::Space));
	}

	#[test]
	fn a_bots_own_value_wins_over_the_one_its_space_holds() {
		let store = a_store();
		store.set(SPACE, "SHARED", "from-the-space").expect("sets");
		store.set("bot", "SHARED", "from-the-bot").expect("sets");

		let resolved = store.resolve("bot", Some("s1"));

		assert_eq!(resolved.values.get("SHARED").map(String::as_str), Some("from-the-bot"));
		assert_eq!(resolved.origins.get("SHARED"), Some(&SecretScope::Bot));
	}

	#[test]
	fn a_bot_of_no_space_resolves_its_own_alone() {
		let store = a_store();
		store.set(SPACE, "SHARED", "from-the-space").expect("sets");
		store.set("bot", "OWN", "from-the-bot").expect("sets");

		let resolved = store.resolve("bot", None);

		assert_eq!(resolved.values.keys().collect::<Vec<_>>(), vec!["OWN"]);
	}

	#[test]
	fn a_space_secret_lives_under_its_own_account_and_index_entry() {
		let store = a_store();
		store.set(SPACE, "SHARED", "from-the-space").expect("sets");

		assert_eq!(store.keys(SPACE), vec!["SHARED".to_owned()]);
		assert!(store.keys("bot").is_empty());
		assert_eq!(
			store.vault.lock().expect("vault").get("space:s1:SHARED").expect("reads"),
			Some("from-the-space".to_owned())
		);
	}

	#[test]
	fn an_inherited_key_is_listed_beside_the_bots_own() {
		let store = a_store();
		store.set(SPACE, "SHARED", "from-the-space").expect("sets");
		store.set("bot", "OWN", "from-the-bot").expect("sets");

		let stored = store.stored_keys("bot", Some("s1"));

		assert_eq!(stored.readable, vec!["OWN".to_owned()]);
		assert_eq!(stored.inherited_readable, vec!["SHARED".to_owned()]);
	}

	#[test]
	fn a_key_held_at_both_scopes_is_listed_once_as_the_bots_own() {
		let store = a_store();
		store.set(SPACE, "SHARED", "from-the-space").expect("sets");
		store.set("bot", "SHARED", "from-the-bot").expect("sets");

		let stored = store.stored_keys("bot", Some("s1"));

		assert_eq!(stored.readable, vec!["SHARED".to_owned()]);
		assert!(stored.inherited_readable.is_empty());
	}

	#[test]
	fn listing_answers_no_value_at_either_scope() {
		let store = a_store();
		store.set(SPACE, "SHARED", "from-the-space").expect("sets");
		store.set("bot", "OWN", "from-the-bot").expect("sets");

		let listed = format!("{:?}", store.stored_keys("bot", Some("s1")));

		assert!(!listed.contains("from-the-space"));
		assert!(!listed.contains("from-the-bot"));
	}

	#[test]
	fn deleting_a_space_secret_leaves_the_bots_own_of_that_name() {
		let store = a_store();
		store.set(SPACE, "SHARED", "from-the-space").expect("sets");
		store.set("bot", "SHARED", "from-the-bot").expect("sets");

		store.delete(SPACE, "SHARED").expect("deletes");

		assert!(store.keys(SPACE).is_empty());
		let resolved = store.resolve("bot", Some("s1"));
		assert_eq!(resolved.values.get("SHARED").map(String::as_str), Some("from-the-bot"));
	}

	#[test]
	fn a_key_unreadable_at_the_space_but_held_by_the_bot_is_not_called_unreadable() {
		let store = a_store();
		store.set(SPACE, "SHARED", "from-the-space").expect("sets");
		store.set("bot", "SHARED", "from-the-bot").expect("sets");
		store.vault.lock().expect("vault").remove("space:s1:SHARED").expect("removes");

		let resolved = store.resolve("bot", Some("s1"));

		assert!(resolved.unreadable.is_empty());
		assert_eq!(resolved.values.get("SHARED").map(String::as_str), Some("from-the-bot"));
	}

	#[test]
	fn a_stored_value_comes_back_for_its_own_bot_only() {
		let store = a_store();
		store.set("first", "TOKEN", "s3cret").expect("sets");

		assert_eq!(store.keys("first"), vec!["TOKEN".to_owned()]);
		assert!(store.keys("second").is_empty());
		assert_eq!(store.resolve("first", None).values.get("TOKEN").map(String::as_str), Some("s3cret"));
		assert!(store.resolve("second", None).values.is_empty());
	}

	#[test]
	fn listing_never_answers_a_value() {
		let store = a_store();
		store.set("bot", "TOKEN", "s3cret").expect("sets");
		assert!(!store.keys("bot").iter().any(|key| key.contains("s3cret")));
	}

	#[test]
	fn a_key_the_account_format_cannot_hold_is_refused() {
		let store = a_store();
		assert_eq!(
			store.set("bot", "TO:KEN", "s3cret"),
			Err(SecretError::InvalidKey { key: "TO:KEN".into() })
		);
	}

	#[test]
	fn deleting_drops_the_name_and_the_value() {
		let store = a_store();
		store.set("bot", "TOKEN", "s3cret").expect("sets");
		store.delete("bot", "TOKEN").expect("deletes");
		assert!(store.keys("bot").is_empty());
		assert!(store.resolve("bot", None).values.is_empty());
	}

	#[test]
	fn deleting_a_missing_secret_says_so() {
		let store = a_store();
		assert!(matches!(store.delete("bot", "TOKEN"), Err(SecretError::NotFound { .. })));
	}

	#[test]
	fn a_named_secret_the_backing_store_lost_is_reported_unreadable() {
		let store = a_store();
		store.set("bot", "TOKEN", "s3cret").expect("sets");
		store.vault.lock().expect("vault").remove("bot:TOKEN").expect("removes behind the index");

		let resolved = store.resolve("bot", None);
		assert!(resolved.values.is_empty());
		assert_eq!(resolved.unreadable, vec!["TOKEN".to_owned()]);
	}

	#[test]
	fn a_key_the_backing_store_lost_is_named_apart_from_the_readable_ones() {
		let store = a_store();
		store.set("bot", "TOKEN", "s3cret").expect("sets");
		store.set("bot", "API_KEY", "k3y").expect("sets");
		store.vault.lock().expect("vault").remove("bot:TOKEN").expect("removes behind the index");

		let stored = store.stored_keys("bot", None);
		assert_eq!(stored.readable, vec!["API_KEY".to_owned()]);
		assert_eq!(stored.unreadable, vec!["TOKEN".to_owned()]);
	}

	#[test]
	fn naming_the_stored_keys_never_answers_a_value() {
		let store = a_store();
		store.set("bot", "TOKEN", "s3cret").expect("sets");

		let stored = store.stored_keys("bot", None);
		let named = format!("{:?}", stored);
		assert!(!named.contains("s3cret"));
	}

	#[test]
	fn a_value_is_stored_without_the_whitespace_around_it() {
		let store = a_store();
		store.set("bot", "TOKEN", "  s3cret\n").expect("sets");

		assert_eq!(store.resolve("bot", None).values.get("TOKEN").map(String::as_str), Some("s3cret"));
	}

	#[test]
	fn a_value_that_is_only_whitespace_is_refused_and_changes_nothing() {
		let store = a_store();
		store.set("bot", "TOKEN", "s3cret").expect("sets");

		assert_eq!(store.set("bot", "TOKEN", " \t\n"), Err(SecretError::EmptyValue));
		assert_eq!(store.resolve("bot", None).values.get("TOKEN").map(String::as_str), Some("s3cret"));
	}

	#[test]
	fn a_locked_vault_asks_for_a_passphrase_and_says_no_vault_is_written_yet() {
		let dir = std::env::temp_dir().join(format!("opennest-secrets-{}", uuid::Uuid::new_v4()));
		std::fs::create_dir_all(&dir).expect("temp dir");
		let store = SecretStore::under(dir);
		store.force_vault_for_tests();

		let status = store.status();
		assert!(!status.is_ready);
		assert!(status.needs_passphrase);
		assert!(!status.has_vault);
	}

	#[test]
	fn a_vault_already_on_disk_is_reported_as_one_to_open() {
		let dir = std::env::temp_dir().join(format!("opennest-secrets-{}", uuid::Uuid::new_v4()));
		std::fs::create_dir_all(&dir).expect("temp dir");
		let store = SecretStore::under(dir.clone());
		store.force_vault_for_tests();
		store.unlock("open sesame").expect("unlocks");
		store.set("bot", "TOKEN", "s3cret").expect("sets");

		let reopened = SecretStore::under(dir);
		reopened.force_vault_for_tests();

		let status = reopened.status();
		assert!(status.needs_passphrase);
		assert!(status.has_vault);

		reopened.unlock("open sesame").expect("unlocks");
		let opened = reopened.status();
		assert!(opened.is_ready);
		assert!(!opened.needs_passphrase);
	}

	#[test]
	fn a_locked_vault_refuses_a_write() {
		let dir = std::env::temp_dir().join(format!("opennest-secrets-{}", uuid::Uuid::new_v4()));
		std::fs::create_dir_all(&dir).expect("temp dir");
		let store = SecretStore::under(dir);
		store.force_vault_for_tests();

		assert!(!store.is_ready());
		assert_eq!(store.set("bot", "TOKEN", "s3cret"), Err(SecretError::VaultLocked));
	}
}
