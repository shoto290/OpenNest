use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use serde::Serialize;

use crate::agent::redact;

use super::contract::{
	account_for, is_usable_key, server_owner, server_owners_of, space_owner, HeldBy, SecretError,
	SecretScope, SERVICE,
};
use super::index;
use super::vault::Vault;

const DIR_NAME: &str = "secrets";
const BUNDLES_DIR: &str = "bots";
const INDEX_NAME: &str = "index.json";
const VAULT_NAME: &str = "vault.bin";
const PROBE_ACCOUNT: &str = "opennest:store-probe";
const PROBE_VALUE: &str = "probe";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Backend {
	Keyring,
	Vault,
}

impl Backend {
	fn held_by(self) -> HeldBy {
		match self {
			Self::Keyring => HeldBy::Keyring,
			Self::Vault => HeldBy::Vault,
		}
	}
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
	pub entries: Vec<StoredKey>,
}

#[derive(Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredKey {
	pub key: String,
	pub owners: Vec<KeyOwner>,
	pub served_by: Option<KeyOwner>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyOwner {
	pub scope: SecretScope,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub server: Option<String>,
	pub readable: bool,
}

struct Link {
	owner: String,
	scope: SecretScope,
	server: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreStatus {
	pub is_ready: bool,
	pub needs_passphrase: bool,
	pub has_vault: bool,
}

pub struct SecretStore {
	#[cfg(test)]
	refused: Mutex<std::collections::BTreeSet<String>>,
	plugins_dir: PathBuf,
	dir: PathBuf,
	backend: OnceLock<Backend>,
	vault: Mutex<Vault>,
}

impl SecretStore {
	pub fn under(app_data: PathBuf) -> Self {
		let dir = app_data.join(DIR_NAME);
		let vault = Vault::at(dir.join(VAULT_NAME));
		let plugins_dir = crate::bundles::plugins_dir(&app_data.join(BUNDLES_DIR));
		Self {
			#[cfg(test)]
			refused: Mutex::new(std::collections::BTreeSet::new()),
			plugins_dir,
			dir,
			backend: OnceLock::new(),
			vault: Mutex::new(vault),
		}
	}

	pub fn plugins_dir(&self) -> &PathBuf {
		&self.plugins_dir
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

	pub fn keys_for(
		&self,
		scope: SecretScope,
		bot_id: Option<&str>,
		space_id: Option<&str>,
		server: Option<&str>,
	) -> StoredKeys {
		self.entries_over(&self.chain_to(scope, bot_id, space_id, server))
	}

	fn chain_to(
		&self,
		scope: SecretScope,
		bot_id: Option<&str>,
		space_id: Option<&str>,
		server: Option<&str>,
	) -> Vec<Link> {
		let mut chain = Vec::new();
		if let Some(space_id) = space_id {
			chain.push(Link {
				owner: space_owner(space_id),
				scope: SecretScope::Space,
				server: None,
			});
		}
		if scope == SecretScope::Space {
			return chain;
		}

		let Some(bot_id) = bot_id else {
			return chain;
		};
		chain.push(Link { owner: bot_id.to_owned(), scope: SecretScope::Bot, server: None });

		if let (SecretScope::Server, Some(server)) = (scope, server) {
			chain.push(Link {
				owner: server_owner(bot_id, server),
				scope: SecretScope::Server,
				server: Some(server.to_owned()),
			});
		}
		chain
	}

	pub fn carry_server_secrets(
		&self,
		bot_id: &str,
		from: &str,
		to: &str,
	) -> Result<(), SecretError> {
		if from == to {
			return Ok(());
		}
		let leaving = server_owner(bot_id, from);
		for key in self.keys(&leaving) {
			if let Ok(Some(value)) = self.held_value(&leaving, &key) {
				self.set(&server_owner(bot_id, to), &key, &value)?;
			}
			self.delete(&leaving, &key)?;
		}
		Ok(())
	}

	pub fn forget_server_secrets(&self, bot_id: &str, server: &str) -> Result<(), SecretError> {
		let leaving = server_owner(bot_id, server);
		for key in self.keys(&leaving) {
			self.delete(&leaving, &key)?;
		}
		Ok(())
	}

	fn chain_for_bot(&self, bot_id: &str, space_id: Option<&str>) -> Vec<Link> {
		let mut chain = Vec::new();
		if let Some(space_id) = space_id {
			chain.push(Link {
				owner: space_owner(space_id),
				scope: SecretScope::Space,
				server: None,
			});
		}
		chain.push(Link { owner: bot_id.to_owned(), scope: SecretScope::Bot, server: None });
		chain
	}

	fn every_server_link(&self, bot_id: &str) -> Vec<Link> {
		let prefix = server_owners_of(bot_id);
		index::owners_under(&self.index_path(), &prefix)
			.unwrap_or_default()
			.into_iter()
			.map(|owner| {
				let server = owner[prefix.len()..].to_owned();
				Link { owner, scope: SecretScope::Server, server: Some(server) }
			})
			.collect()
	}

	fn entries_over(&self, chain: &[Link]) -> StoredKeys {
		let mut by_key: BTreeMap<String, Vec<KeyOwner>> = BTreeMap::new();
		for link in chain {
			for key in self.keys(&link.owner) {
				let readable = matches!(self.held_value(&link.owner, &key), Ok(Some(_)));
				by_key.entry(key).or_default().push(KeyOwner {
					scope: link.scope,
					server: link.server.clone(),
					readable,
				});
			}
		}

		let entries = by_key
			.into_iter()
			.map(|(key, owners)| {
				let served_by = owners.iter().rev().find(|owner| owner.readable).cloned();
				StoredKey { key, owners, served_by }
			})
			.collect();
		StoredKeys { entries }
	}

	pub fn unlock(&self, passphrase: &str) -> Result<(), SecretError> {
		self.vault.lock().expect("vault").unlock(passphrase)
	}

	pub fn keys(&self, owner: &str) -> Vec<String> {
		index::keys(&self.index_path(), owner).unwrap_or_default()
	}

	fn held_value(&self, owner: &str, key: &str) -> Result<Option<String>, SecretError> {
		let recorded = index::held_by(&self.index_path(), owner, key)?;
		let account = account_for(owner, key);
		match recorded {
			HeldBy::Unknown => self.read_value(&account),
			HeldBy::Keyring if self.backend() == Backend::Keyring => self.read_value(&account),
			HeldBy::Vault if self.backend() == Backend::Vault => self.read_value(&account),
			held => Err(SecretError::BackendUnavailable { detail: format!("{held:?}") }),
		}
	}

	pub fn set(&self, owner: &str, key: &str, value: &str) -> Result<(), SecretError> {
		if !is_usable_key(key) {
			return Err(SecretError::InvalidKey { key: key.to_owned() });
		}
		let value = value.trim();
		if value.is_empty() {
			return Err(SecretError::EmptyValue);
		}
		#[cfg(test)]
		if self.refused.lock().expect("refused").contains(key) {
			return Err(SecretError::StoreUnavailable { detail: "refused for a test".into() });
		}
		self.write_value(&account_for(owner, key), value)?;
		redact::remember(value);
		index::remember(&self.index_path(), owner, key, self.backend().held_by())
	}

	pub fn delete(&self, owner: &str, key: &str) -> Result<(), SecretError> {
		match self.erase_value(&account_for(owner, key)) {
			Ok(()) | Err(SecretError::NotFound { .. }) => (),
			Err(error) => return Err(error),
		}
		index::forget(&self.index_path(), owner, key)
	}

	pub fn resolve(&self, bot_id: &str, space_id: Option<&str>) -> Resolved {
		self.resolve_over(&self.chain_for_bot(bot_id, space_id))
	}

	pub fn resolve_for_server(
		&self,
		bot_id: &str,
		space_id: Option<&str>,
		server: &str,
	) -> Resolved {
		let mut chain = self.chain_for_bot(bot_id, space_id);
		chain.push(Link {
			owner: server_owner(bot_id, server),
			scope: SecretScope::Server,
			server: Some(server.to_owned()),
		});
		self.resolve_over(&chain)
	}

	pub fn servers_holding_a_secret(&self, bot_id: &str) -> Vec<String> {
		self.every_server_link(bot_id).into_iter().filter_map(|link| link.server).collect()
	}

	fn resolve_over(&self, chain: &[Link]) -> Resolved {
		let mut resolved = Resolved::default();
		for link in chain {
			self.gather(&link.owner, link.scope, &mut resolved);
		}

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
			match self.held_value(owner, &key) {
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
	pub fn refuse_for_tests(&self, key: &str) {
		self.refused.lock().expect("refused").insert(key.to_owned());
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

	fn entry_for<'a>(stored: &'a StoredKeys, key: &str) -> &'a StoredKey {
		stored.entries.iter().find(|entry| entry.key == key).expect("the key is listed")
	}

	fn held(scope: SecretScope, server: Option<&str>, readable: bool) -> KeyOwner {
		KeyOwner { scope, server: server.map(str::to_owned), readable }
	}

	const SERVER: &str = "server:bot:github";

	#[test]
	fn an_inherited_key_is_listed_beside_the_bots_own() {
		let store = a_store();
		store.set(SPACE, "SHARED", "from-the-space").expect("sets");
		store.set("bot", "OWN", "from-the-bot").expect("sets");

		let stored = store.keys_for(SecretScope::Bot, Some("bot"), Some("s1"), None);

		assert_eq!(entry_for(&stored, "SHARED").served_by, Some(held(SecretScope::Space, None, true)));
		assert_eq!(entry_for(&stored, "OWN").served_by, Some(held(SecretScope::Bot, None, true)));
	}

	#[test]
	fn a_server_value_is_served_over_the_bot_and_the_space() {
		let store = a_store();
		store.set(SPACE, "SHARED", "from-the-space").expect("sets");
		store.set("bot", "SHARED", "from-the-bot").expect("sets");
		store.set(SERVER, "SHARED", "from-the-server").expect("sets");

		let resolved = store.resolve_for_server("bot", Some("s1"), "github");

		assert_eq!(resolved.values.get("SHARED").map(String::as_str), Some("from-the-server"));
		assert_eq!(resolved.origins.get("SHARED"), Some(&SecretScope::Server));
	}

	#[test]
	fn a_server_holding_nothing_falls_back_to_the_bot_then_the_space() {
		let store = a_store();
		store.set(SPACE, "ONLY_SPACE", "from-the-space").expect("sets");
		store.set("bot", "ONLY_BOT", "from-the-bot").expect("sets");

		let resolved = store.resolve_for_server("bot", Some("s1"), "github");

		assert_eq!(resolved.values.get("ONLY_SPACE").map(String::as_str), Some("from-the-space"));
		assert_eq!(resolved.values.get("ONLY_BOT").map(String::as_str), Some("from-the-bot"));
	}

	#[test]
	fn a_server_value_never_reaches_another_server() {
		let store = a_store();
		store.set("bot", "SHARED", "from-the-bot").expect("sets");
		store.set(SERVER, "SHARED", "from-the-server").expect("sets");

		let other = store.resolve_for_server("bot", None, "linear");

		assert_eq!(other.values.get("SHARED").map(String::as_str), Some("from-the-bot"));
	}

	#[test]
	fn a_key_held_at_every_owner_names_them_all_and_the_one_that_serves_it() {
		let store = a_store();
		store.set(SPACE, "SHARED", "from-the-space").expect("sets");
		store.set("bot", "SHARED", "from-the-bot").expect("sets");
		store.set(SERVER, "SHARED", "from-the-server").expect("sets");

		let stored =
			store.keys_for(SecretScope::Server, Some("bot"), Some("s1"), Some("github"));
		let entry = entry_for(&stored, "SHARED");

		assert_eq!(
			entry.owners,
			vec![
				held(SecretScope::Space, None, true),
				held(SecretScope::Bot, None, true),
				held(SecretScope::Server, Some("github"), true),
			]
		);
		assert_eq!(entry.served_by, Some(held(SecretScope::Server, Some("github"), true)));
	}

	#[test]
	fn a_key_is_reported_on_one_entry_however_many_owners_hold_it() {
		let store = a_store();
		store.set(SPACE, "SHARED", "from-the-space").expect("sets");
		store.set("bot", "SHARED", "from-the-bot").expect("sets");
		store.set(SERVER, "SHARED", "from-the-server").expect("sets");
		store.set("bot", "OWN", "from-the-bot").expect("sets");

		let stored = store.keys_for(SecretScope::Bot, Some("bot"), Some("s1"), None);

		let names: Vec<&str> = stored.entries.iter().map(|entry| entry.key.as_str()).collect();
		assert_eq!(names, vec!["OWN", "SHARED"]);
	}

	#[test]
	fn a_key_unreadable_where_it_would_be_served_falls_to_the_owner_below() {
		let store = a_store();
		store.set(SPACE, "SHARED", "from-the-space").expect("sets");
		store.set("bot", "SHARED", "from-the-bot").expect("sets");
		store.set(SERVER, "SHARED", "from-the-server").expect("sets");
		store.vault.lock().expect("vault").remove("server:bot:github:SHARED").expect("removes");

		let stored = store.keys_for(SecretScope::Bot, Some("bot"), Some("s1"), None);

		assert_eq!(
			entry_for(&stored, "SHARED").served_by,
			Some(held(SecretScope::Bot, None, true))
		);
		assert_eq!(
			store.resolve_for_server("bot", Some("s1"), "github").values.get("SHARED"),
			Some(&"from-the-bot".to_owned())
		);
	}

	#[test]
	fn a_key_is_called_unreadable_only_when_no_owner_can_serve_it() {
		let store = a_store();
		store.set("bot", "OWN", "from-the-bot").expect("sets");
		store.vault.lock().expect("vault").remove("bot:OWN").expect("removes");

		let stored = store.keys_for(SecretScope::Bot, Some("bot"), Some("s1"), None);

		assert_eq!(entry_for(&stored, "OWN").served_by, None);
	}

	#[test]
	fn a_bot_of_no_space_reports_no_key_held_at_a_space() {
		let store = a_store();
		store.set(SPACE, "SHARED", "from-the-space").expect("sets");
		store.set("bot", "SHARED", "from-the-bot").expect("sets");

		let stored = store.keys_for(SecretScope::Bot, Some("bot"), None, None);

		assert_eq!(entry_for(&stored, "SHARED").owners, vec![held(SecretScope::Bot, None, true)]);
	}

	#[test]
	fn the_server_scope_answers_its_own_chain_and_no_other_server() {
		let store = a_store();
		store.set(SPACE, "FROM_SPACE", "space").expect("sets");
		store.set("bot", "FROM_BOT", "bot").expect("sets");
		store.set(SERVER, "FROM_SERVER", "server").expect("sets");
		store.set("server:bot:linear", "FROM_OTHER", "other").expect("sets");

		let stored = store.keys_for(SecretScope::Server, Some("bot"), Some("s1"), Some("github"));

		let named: Vec<&str> = stored.entries.iter().map(|entry| entry.key.as_str()).collect();
		assert_eq!(named, vec!["FROM_BOT", "FROM_SERVER", "FROM_SPACE"]);
	}

	#[test]
	fn the_bot_scope_answers_no_key_a_server_holds() {
		let store = a_store();
		store.set(SPACE, "FROM_SPACE", "space").expect("sets");
		store.set("bot", "FROM_BOT", "bot").expect("sets");
		store.set(SERVER, "FROM_SERVER", "server").expect("sets");

		let stored = store.keys_for(SecretScope::Bot, Some("bot"), Some("s1"), None);

		let named: Vec<&str> = stored.entries.iter().map(|entry| entry.key.as_str()).collect();
		assert_eq!(named, vec!["FROM_BOT", "FROM_SPACE"]);
	}

	#[test]
	fn the_space_scope_answers_what_the_space_holds_and_nothing_else() {
		let store = a_store();
		store.set(SPACE, "FROM_SPACE", "space").expect("sets");
		store.set("bot", "FROM_BOT", "bot").expect("sets");
		store.set(SERVER, "FROM_SERVER", "server").expect("sets");

		let stored = store.keys_for(SecretScope::Space, Some("bot"), Some("s1"), None);

		let named: Vec<&str> = stored.entries.iter().map(|entry| entry.key.as_str()).collect();
		assert_eq!(named, vec!["FROM_SPACE"]);
	}

	#[test]
	fn a_renamed_server_carries_the_secrets_it_held() {
		let store = a_store();
		store.set(SERVER, "TOKEN", "from-the-server").expect("sets");

		store.carry_server_secrets("bot", "github", "forge").expect("carries");

		assert!(store.keys(SERVER).is_empty());
		assert_eq!(
			store.resolve_for_server("bot", None, "forge").values.get("TOKEN").map(String::as_str),
			Some("from-the-server")
		);
	}

	#[test]
	fn a_deleted_server_leaves_no_secret_of_its_own_behind() {
		let store = a_store();
		store.set("bot", "TOKEN", "from-the-bot").expect("sets");
		store.set(SERVER, "TOKEN", "from-the-server").expect("sets");

		store.forget_server_secrets("bot", "github").expect("forgets");

		assert!(store.keys(SERVER).is_empty());
		assert_eq!(
			store.resolve_for_server("bot", None, "github").values.get("TOKEN").map(String::as_str),
			Some("from-the-bot")
		);
	}

	#[test]
	fn a_space_lists_its_own_keys_and_names_no_bot() {
		let store = a_store();
		store.set(SPACE, "SHARED", "from-the-space").expect("sets");
		store.set("bot", "OWN", "from-the-bot").expect("sets");

		let stored = store.keys_for(SecretScope::Space, None, Some("s1"), None);

		let names: Vec<&str> = stored.entries.iter().map(|entry| entry.key.as_str()).collect();
		assert_eq!(names, vec!["SHARED"]);
		assert_eq!(entry_for(&stored, "SHARED").owners, vec![held(SecretScope::Space, None, true)]);
	}

	#[test]
	fn a_write_at_one_owner_leaves_every_other_owner_alone() {
		let store = a_store();
		store.set(SPACE, "SHARED", "from-the-space").expect("sets");
		store.set("bot", "SHARED", "from-the-bot").expect("sets");
		store.set(SERVER, "SHARED", "from-the-server").expect("sets");

		store.delete(SERVER, "SHARED").expect("deletes");

		let resolved = store.resolve_for_server("bot", Some("s1"), "github");
		assert_eq!(resolved.values.get("SHARED").map(String::as_str), Some("from-the-bot"));
		assert_eq!(store.keys(SPACE), vec!["SHARED".to_owned()]);
		assert_eq!(store.keys("bot"), vec!["SHARED".to_owned()]);
	}

	#[test]
	fn every_server_holding_a_secret_is_named_for_its_bot_alone() {
		let store = a_store();
		store.set(SERVER, "TOKEN", "from-the-server").expect("sets");
		store.set("server:other:linear", "TOKEN", "from-elsewhere").expect("sets");

		assert_eq!(store.servers_holding_a_secret("bot"), vec!["github".to_owned()]);
	}

	#[test]
	fn the_listing_answers_no_value_on_any_entry() {
		let store = a_store();
		store.set(SPACE, "SHARED", "from-the-space").expect("sets");
		store.set("bot", "SHARED", "from-the-bot").expect("sets");
		store.set(SERVER, "SHARED", "from-the-server").expect("sets");

		let answered = serde_json::to_string(&store.keys_for(SecretScope::Bot, Some("bot"), Some("s1"), None)).expect("json");

		for value in ["from-the-space", "from-the-bot", "from-the-server"] {
			assert!(!answered.contains(value), "{answered}");
		}
	}

	#[test]
	fn listing_answers_no_value_at_either_scope() {
		let store = a_store();
		store.set(SPACE, "SHARED", "from-the-space").expect("sets");
		store.set("bot", "OWN", "from-the-bot").expect("sets");

		let listed = format!("{:?}", store.keys_for(SecretScope::Bot, Some("bot"), Some("s1"), None));

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
	fn a_secret_is_read_only_from_the_backend_recorded_for_it() {
		let store = a_store();
		store.set("bot", "TOKEN", "s3cret").expect("sets");
		index::remember(&store.index_path(), "bot", "TOKEN", HeldBy::Keyring)
			.expect("records another backend");

		let resolved = store.resolve("bot", None);

		assert!(resolved.values.is_empty());
		assert_eq!(resolved.unreadable, vec!["TOKEN".to_owned()]);
	}

	#[test]
	fn a_secret_records_the_backend_that_took_it() {
		let store = a_store();
		store.set("bot", "TOKEN", "s3cret").expect("sets");

		assert_eq!(index::held_by(&store.index_path(), "bot", "TOKEN"), Ok(HeldBy::Vault));
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
	fn deleting_a_key_whose_value_is_already_gone_still_clears_the_index() {
		let store = a_store();
		store.set("bot", "TOKEN", "s3cret").expect("sets");
		store.vault.lock().expect("vault").remove("bot:TOKEN").expect("removes behind the index");

		assert_eq!(store.delete("bot", "TOKEN"), Ok(()));
		assert!(store.keys("bot").is_empty());
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

		let stored = store.keys_for(SecretScope::Bot, Some("bot"), None, None);
		assert_eq!(
			entry_for(&stored, "API_KEY").served_by,
			Some(held(SecretScope::Bot, None, true))
		);
		assert_eq!(entry_for(&stored, "TOKEN").served_by, None);
	}

	#[test]
	fn naming_the_stored_keys_never_answers_a_value() {
		let store = a_store();
		store.set("bot", "TOKEN", "s3cret").expect("sets");

		let stored = store.keys_for(SecretScope::Bot, Some("bot"), None, None);
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
