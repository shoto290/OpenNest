use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use aes_gcm::aead::rand_core::RngCore;
use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use argon2::Argon2;

use crate::private_files;

use super::contract::SecretError;

const MAGIC: &[u8; 8] = b"ONVAULT1";
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;

type Values = BTreeMap<String, String>;

struct Unlocked {
	salt: [u8; SALT_LEN],
	key: [u8; KEY_LEN],
	values: Values,
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
		let sealed = std::fs::read(&self.path).ok();
		let salt = match sealed.as_deref() {
			Some(bytes) => salt_of(bytes)?,
			None => fresh_salt(),
		};
		let key = derive(passphrase, &salt)?;
		let values = match sealed.as_deref() {
			Some(bytes) => open_sealed(bytes, &key)?,
			None => Values::new(),
		};
		self.unlocked = Some(Unlocked { salt, key, values });
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
	bytes.extend_from_slice(&opened.salt);
	bytes.extend_from_slice(&nonce_bytes);
	bytes.extend_from_slice(&sealed);

	private_files::replace(path, &bytes)
		.map_err(|error| SecretError::StoreUnavailable { detail: error.to_string() })
}

fn open_sealed(bytes: &[u8], key: &[u8; KEY_LEN]) -> Result<Values, SecretError> {
	let body = bytes.get(MAGIC.len() + SALT_LEN..).ok_or(SecretError::VaultPassphraseRejected)?;
	let (nonce, sealed) = body.split_at_checked(NONCE_LEN).ok_or(SecretError::VaultPassphraseRejected)?;

	let plaintext = cipher(key)
		.decrypt(Nonce::from_slice(nonce), sealed)
		.map_err(|_| SecretError::VaultPassphraseRejected)?;

	serde_json::from_slice(&plaintext).map_err(|_| SecretError::VaultPassphraseRejected)
}

fn cipher(key: &[u8; KEY_LEN]) -> Aes256Gcm {
	Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key))
}

fn salt_of(bytes: &[u8]) -> Result<[u8; SALT_LEN], SecretError> {
	let unreadable = || SecretError::StoreUnavailable { detail: "the vault file is unreadable".into() };
	if !bytes.starts_with(MAGIC) {
		return Err(unreadable());
	}
	bytes
		.get(MAGIC.len()..MAGIC.len() + SALT_LEN)
		.and_then(|salt| salt.try_into().ok())
		.ok_or_else(unreadable)
}

fn fresh_salt() -> [u8; SALT_LEN] {
	let mut salt = [0u8; SALT_LEN];
	OsRng.fill_bytes(&mut salt);
	salt
}

fn derive(passphrase: &str, salt: &[u8; SALT_LEN]) -> Result<[u8; KEY_LEN], SecretError> {
	let mut key = [0u8; KEY_LEN];
	Argon2::default()
		.hash_password_into(passphrase.as_bytes(), salt, &mut key)
		.map_err(|error| SecretError::StoreUnavailable { detail: error.to_string() })?;
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
