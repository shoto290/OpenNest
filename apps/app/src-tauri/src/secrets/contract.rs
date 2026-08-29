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
	#[serde(rename_all = "camelCase")]
	NoSpace { bot_id: String },
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
			Self::NoSpace { bot_id } => write!(formatter, "bot {bot_id} belongs to no space"),
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

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SecretScope {
	#[default]
	Bot,
	Space,
}

const SPACE_OWNER_PREFIX: &str = "space:";

pub fn space_owner(space_id: &str) -> String {
	format!("{SPACE_OWNER_PREFIX}{space_id}")
}

pub fn owner_for(
	scope: SecretScope,
	bot_id: &str,
	space_id: Option<&str>,
) -> Result<String, SecretError> {
	match scope {
		SecretScope::Bot => Ok(bot_id.to_owned()),
		SecretScope::Space => {
			space_id.map(space_owner).ok_or(SecretError::NoSpace { bot_id: bot_id.to_owned() })
		}
	}
}

pub fn account_for(owner: &str, key: &str) -> String {
	format!("{owner}:{key}")
}

const UNUSABLE_IN_KEY: [char; 4] = [':', '{', '}', '$'];

pub fn is_usable_key(key: &str) -> bool {
	!key.is_empty()
		&& !key.contains(UNUSABLE_IN_KEY)
		&& key.chars().all(|letter| letter.is_ascii_graphic() || letter == ' ')
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn a_call_naming_no_scope_targets_the_bot() {
		assert_eq!(owner_for(SecretScope::default(), "bot", Some("s1")), Ok("bot".to_owned()));
	}

	#[test]
	fn the_space_scope_is_addressed_under_its_own_prefix() {
		assert_eq!(
			owner_for(SecretScope::Space, "bot", Some("s1")),
			Ok("space:s1".to_owned())
		);
		assert_eq!(account_for("space:s1", "SHARED"), "space:s1:SHARED");
	}

	#[test]
	fn the_space_scope_is_refused_to_a_bot_that_belongs_to_none() {
		assert_eq!(
			owner_for(SecretScope::Space, "bot", None),
			Err(SecretError::NoSpace { bot_id: "bot".to_owned() })
		);
	}

	#[test]
	fn a_key_can_never_forge_a_scope_of_its_own() {
		assert!(!is_usable_key("space:s1:SHARED"));
	}
}
