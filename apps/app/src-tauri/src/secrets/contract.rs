use serde::{Deserialize, Serialize};

pub const SERVICE: &str = "com.opennest.app";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SecretError {
	#[serde(rename_all = "camelCase")]
	StoreUnavailable { detail: String },
	VaultLocked,
	VaultPassphraseRejected,
	#[serde(rename_all = "camelCase")]
	NotFound { key: String },
	#[serde(rename_all = "camelCase")]
	InvalidKey { key: String },
	EmptyValue,
	#[serde(rename_all = "camelCase")]
	IndexUnwritable { detail: String },
}

impl std::fmt::Display for SecretError {
	fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		match self {
			Self::StoreUnavailable { detail } => write!(formatter, "secret store unavailable: {detail}"),
			Self::VaultLocked => write!(formatter, "the vault is locked"),
			Self::VaultPassphraseRejected => write!(formatter, "the vault passphrase was rejected"),
			Self::NotFound { key } => write!(formatter, "no secret named {key}"),
			Self::InvalidKey { key } => write!(formatter, "{key} is not a usable secret name"),
			Self::EmptyValue => write!(formatter, "a secret cannot be stored empty"),
			Self::IndexUnwritable { detail } => write!(formatter, "the secret index could not be written: {detail}"),
		}
	}
}

impl std::error::Error for SecretError {}

pub fn placeholder_for(key: &str) -> String {
	format!("${{secret:{key}}}")
}

pub fn is_interpolated(value: &str) -> bool {
	value.contains("${")
}

pub fn account_for(bot_id: &str, key: &str) -> String {
	format!("{bot_id}:{key}")
}

const UNUSABLE_IN_KEY: [char; 4] = [':', '{', '}', '$'];

pub fn is_usable_key(key: &str) -> bool {
	!key.is_empty()
		&& !key.contains(UNUSABLE_IN_KEY)
		&& key.chars().all(|letter| letter.is_ascii_graphic() || letter == ' ')
}
