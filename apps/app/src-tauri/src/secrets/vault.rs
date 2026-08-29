use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use aes_gcm::aead::rand_core::RngCore;
use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};

use crate::private_files;

use super::contract::SecretError;

const MAGIC_V1: &[u8; 8] = b"ONVAULT1";
const MAGIC: &[u8; 8] = b"ONVAULT2";
const RECIPE_LEN: usize = 14;
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;

type Values = BTreeMap<String, String>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Recipe {
	algorithm: u8,
	version: u8,
	memory: u32,
	passes: u32,
	lanes: u32,
}

impl Default for Recipe {
	fn default() -> Self {
		let params = Params::DEFAULT;
		Self {
			algorithm: Algorithm::Argon2id as u8,
			version: Version::V0x13 as u8,
			memory: params.m_cost(),
			passes: params.t_cost(),
			lanes: params.p_cost(),
		}
	}
}

impl Recipe {
	fn written(&self) -> Vec<u8> {
		let mut bytes = vec![self.algorithm, self.version];
		bytes.extend_from_slice(&self.memory.to_le_bytes());
		bytes.extend_from_slice(&self.passes.to_le_bytes());
		bytes.extend_from_slice(&self.lanes.to_le_bytes());
		bytes
	}

	fn read(bytes: &[u8]) -> Option<Self> {
		let four = |at: usize| bytes.get(at..at + 4)?.try_into().ok().map(u32::from_le_bytes);
		Some(Self {
			algorithm: *bytes.first()?,
			version: *bytes.get(1)?,
			memory: four(2)?,
			passes: four(6)?,
			lanes: four(10)?,
		})
	}
}

struct Unlocked {
	recipe: Recipe,
	salt: [u8; SALT_LEN],
	key: [u8; KEY_LEN],
	values: Values,
}

struct Sealed {
	recipe: Recipe,
	salt: [u8; SALT_LEN],
	body_at: usize,
}

pub struct Vault {
	path: PathBuf,
	unlocked: Option<Unlocked>,
}

impl Vault {
	pub fn at(path: PathBuf) -> Self {
		Self { path, unlocked: None }
	}

	pub fn is_unlocked(&self) -> bool {
		self.unlocked.is_some()
	}

	pub fn unlock(&mut self, passphrase: &str) -> Result<(), SecretError> {
		let stored = match std::fs::read(&self.path) {
			Ok(bytes) => Some(bytes),
			Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
			Err(error) => {
				return Err(SecretError::VaultUnreadable { detail: error.to_string() })
			}
		};

		let Some(bytes) = stored else {
			let recipe = Recipe::default();
			let salt = fresh_salt();
			let key = derive(passphrase, &salt, &recipe)?;
			self.unlocked = Some(Unlocked { recipe, salt, key, values: Values::new() });
			return Ok(());
		};

		let header = header_of(&bytes)?;
		let key = derive(passphrase, &header.salt, &header.recipe)?;
		let values = open_sealed(&bytes[header.body_at..], &key)?;
		self.unlocked =
			Some(Unlocked { recipe: header.recipe, salt: header.salt, key, values });
		Ok(())
	}

	pub fn get(&self, account: &str) -> Result<Option<String>, SecretError> {
		Ok(self.opened()?.values.get(account).cloned())
	}

	pub fn set(&mut self, account: &str, value: &str) -> Result<(), SecretError> {
		let Some(opened) = self.unlocked.as_mut() else {
			return Err(SecretError::VaultLocked);
		};
		opened.values.insert(account.to_owned(), value.to_owned());
		persist(&self.path, opened)
	}

	pub fn remove(&mut self, account: &str) -> Result<(), SecretError> {
		let Some(opened) = self.unlocked.as_mut() else {
			return Err(SecretError::VaultLocked);
		};
		if opened.values.remove(account).is_none() {
			return Err(SecretError::NotFound { key: account.to_owned() });
		}
		persist(&self.path, opened)
	}

	fn opened(&self) -> Result<&Unlocked, SecretError> {
		self.unlocked.as_ref().ok_or(SecretError::VaultLocked)
	}

}

fn persist(path: &Path, opened: &Unlocked) -> Result<(), SecretError> {
	let plaintext = serde_json::to_vec(&opened.values)
		.map_err(|error| SecretError::StoreUnavailable { detail: error.to_string() })?;

	let mut nonce_bytes = [0u8; NONCE_LEN];
	OsRng.fill_bytes(&mut nonce_bytes);

	let sealed = cipher(&opened.key)
		.encrypt(Nonce::from_slice(&nonce_bytes), plaintext.as_slice())
		.map_err(|_| SecretError::StoreUnavailable { detail: "the vault could not be sealed".into() })?;

	let mut bytes = Vec::with_capacity(MAGIC.len() + SALT_LEN + NONCE_LEN + sealed.len());
	bytes.extend_from_slice(MAGIC);
	bytes.extend_from_slice(&opened.recipe.written());
	bytes.extend_from_slice(&opened.salt);
	bytes.extend_from_slice(&nonce_bytes);
	bytes.extend_from_slice(&sealed);

	private_files::replace(path, &bytes)
		.map_err(|error| SecretError::StoreUnavailable { detail: error.to_string() })
}

fn open_sealed(body: &[u8], key: &[u8; KEY_LEN]) -> Result<Values, SecretError> {
	let (nonce, sealed) =
		body.split_at_checked(NONCE_LEN).ok_or(SecretError::VaultPassphraseRejected)?;

	let plaintext = cipher(key)
		.decrypt(Nonce::from_slice(nonce), sealed)
		.map_err(|_| SecretError::VaultPassphraseRejected)?;

	serde_json::from_slice(&plaintext).map_err(|_| SecretError::VaultPassphraseRejected)
}

fn cipher(key: &[u8; KEY_LEN]) -> Aes256Gcm {
	Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key))
}

fn header_of(bytes: &[u8]) -> Result<Sealed, SecretError> {
	let unreadable =
		|| SecretError::VaultUnreadable { detail: "the vault header is unreadable".into() };

	let (recipe, salt_at) = if bytes.starts_with(MAGIC) {
		let recipe = Recipe::read(bytes.get(MAGIC.len()..MAGIC.len() + RECIPE_LEN).ok_or_else(unreadable)?)
			.ok_or_else(unreadable)?;
		(recipe, MAGIC.len() + RECIPE_LEN)
	} else if bytes.starts_with(MAGIC_V1) {
		(Recipe::default(), MAGIC_V1.len())
	} else {
		return Err(unreadable());
	};

	let salt = bytes
		.get(salt_at..salt_at + SALT_LEN)
		.and_then(|salt| salt.try_into().ok())
		.ok_or_else(unreadable)?;
	Ok(Sealed { recipe, salt, body_at: salt_at + SALT_LEN })
}

fn fresh_salt() -> [u8; SALT_LEN] {
	let mut salt = [0u8; SALT_LEN];
	OsRng.fill_bytes(&mut salt);
	salt
}

fn derive(
	passphrase: &str,
	salt: &[u8; SALT_LEN],
	recipe: &Recipe,
) -> Result<[u8; KEY_LEN], SecretError> {
	let unusable =
		|detail: String| SecretError::VaultUnreadable { detail: format!("argon2: {detail}") };

	let algorithm = match recipe.algorithm {
		0 => Algorithm::Argon2d,
		1 => Algorithm::Argon2i,
		2 => Algorithm::Argon2id,
		other => return Err(unusable(format!("unknown algorithm {other}"))),
	};
	let version = match recipe.version {
		0x10 => Version::V0x10,
		0x13 => Version::V0x13,
		other => return Err(unusable(format!("unknown version {other}"))),
	};
	let params = Params::new(recipe.memory, recipe.passes, recipe.lanes, Some(KEY_LEN))
		.map_err(|error| unusable(error.to_string()))?;

	let mut key = [0u8; KEY_LEN];
	Argon2::new(algorithm, version, params)
		.hash_password_into(passphrase.as_bytes(), salt, &mut key)
		.map_err(|error| unusable(error.to_string()))?;
	Ok(key)
}

#[cfg(test)]
mod tests {
	use super::*;

	fn a_vault_file() -> PathBuf {
		let dir = std::env::temp_dir().join(format!("opennest-vault-{}", uuid::Uuid::new_v4()));
		std::fs::create_dir_all(&dir).expect("temp dir");
		dir.join("vault.bin")
	}

	#[test]
	fn a_locked_vault_answers_nothing() {
		let vault = Vault::at(a_vault_file());
		assert_eq!(vault.get("bot:KEY"), Err(SecretError::VaultLocked));
	}

	#[test]
	fn a_value_survives_a_relock_with_the_same_passphrase() {
		let file = a_vault_file();
		let mut vault = Vault::at(file.clone());
		vault.unlock("open sesame").expect("unlocks");
		vault.set("bot:KEY", "s3cret").expect("sets");

		let mut reopened = Vault::at(file);
		reopened.unlock("open sesame").expect("unlocks");
		assert_eq!(reopened.get("bot:KEY"), Ok(Some("s3cret".to_owned())));
	}

	#[test]
	fn a_vault_that_cannot_be_read_is_not_a_rejected_passphrase() {
		let file = a_vault_file();
		std::fs::create_dir_all(&file).expect("a directory where the vault should be");

		let mut vault = Vault::at(file);

		assert!(matches!(vault.unlock("open sesame"), Err(SecretError::VaultUnreadable { .. })));
		assert!(!vault.is_unlocked());
	}

	#[test]
	fn an_absent_vault_is_created_and_takes_the_passphrase() {
		let mut vault = Vault::at(a_vault_file());

		assert_eq!(vault.unlock("open sesame"), Ok(()));
		assert!(vault.is_unlocked());
	}

	#[test]
	fn a_header_that_is_not_a_vault_is_reported_unreadable() {
		let file = a_vault_file();
		std::fs::write(&file, b"not a vault at all").expect("writes");

		let mut vault = Vault::at(file);

		assert!(matches!(vault.unlock("open sesame"), Err(SecretError::VaultUnreadable { .. })));
	}

	#[test]
	fn the_header_carries_the_recipe_the_key_was_derived_with() {
		let file = a_vault_file();
		let mut vault = Vault::at(file.clone());
		vault.unlock("open sesame").expect("unlocks");
		vault.set("bot:KEY", "s3cret").expect("sets");

		let bytes = std::fs::read(&file).expect("the vault is on disk");
		let recipe = Recipe::read(&bytes[MAGIC.len()..]).expect("the recipe reads back");

		assert!(bytes.starts_with(MAGIC));
		assert_eq!(recipe, Recipe::default());
	}

	#[test]
	fn a_vault_sealed_with_another_recipe_opens_on_the_recorded_one() {
		let file = a_vault_file();
		let lighter = Recipe { memory: 8, passes: 1, lanes: 1, ..Recipe::default() };
		let salt = fresh_salt();
		let key = derive("open sesame", &salt, &lighter).expect("derives");
		let opened = Unlocked { recipe: lighter, salt, key, values: Values::new() };
		persist(&file, &opened).expect("seals");

		let mut vault = Vault::at(file);
		vault.unlock("open sesame").expect("unlocks on the recorded recipe");

		assert!(vault.is_unlocked());
	}

	#[test]
	fn an_interrupted_write_leaves_the_sealed_vault_as_it_was() {
		let file = a_vault_file();
		let mut vault = Vault::at(file.clone());
		vault.unlock("open sesame").expect("unlocks");
		vault.set("bot:KEY", "s3cret").expect("sets");
		let sealed = std::fs::read(&file).expect("the vault is on disk");

		crate::private_files::interrupt_the_write_after(0);
		assert!(vault.set("bot:OTHER", "another").is_err());

		assert_eq!(std::fs::read(&file).expect("still there"), sealed);
		let mut reopened = Vault::at(file);
		reopened.unlock("open sesame").expect("unlocks");
		assert_eq!(reopened.get("bot:KEY"), Ok(Some("s3cret".to_owned())));
	}

	#[test]
	fn the_wrong_passphrase_is_rejected() {
		let file = a_vault_file();
		let mut vault = Vault::at(file.clone());
		vault.unlock("open sesame").expect("unlocks");
		vault.set("bot:KEY", "s3cret").expect("sets");

		let mut reopened = Vault::at(file);
		assert_eq!(reopened.unlock("guess"), Err(SecretError::VaultPassphraseRejected));
	}

	#[test]
	fn the_file_never_holds_the_value_in_the_clear() {
		let file = a_vault_file();
		let mut vault = Vault::at(file.clone());
		vault.unlock("open sesame").expect("unlocks");
		vault.set("bot:KEY", "s3cret").expect("sets");

		let bytes = std::fs::read(&file).expect("the vault is on disk");
		assert!(!bytes.windows(6).any(|window| window == b"s3cret"));
	}

	#[test]
	fn removing_a_missing_account_says_so() {
		let mut vault = Vault::at(a_vault_file());
		vault.unlock("open sesame").expect("unlocks");
		assert_eq!(vault.remove("bot:KEY"), Err(SecretError::NotFound { key: "bot:KEY".into() }));
	}
}
