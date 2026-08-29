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
	VaultUnreadable { detail: String },
	#[serde(rename_all = "camelCase")]
	BackendUnavailable { detail: String },
	#[serde(rename_all = "camelCase")]
	NotFound { key: String },
	#[serde(rename_all = "camelCase")]
	InvalidKey { key: String },
	EmptyValue,
	#[serde(rename_all = "camelCase")]
	IndexUnwritable { detail: String },
	#[serde(rename_all = "camelCase")]
	IndexUnreadable { detail: String },
	#[serde(rename_all = "camelCase")]
	NoSpace { bot_id: String },
	#[serde(rename_all = "camelCase")]
	NoServer { bot_id: String },
	#[serde(rename_all = "camelCase")]
	InvalidServer { server: String },
	#[serde(rename_all = "camelCase")]
	UnknownServer { server: String },
}

impl std::fmt::Display for SecretError {
	fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		match self {
			Self::StoreUnavailable { detail } => write!(formatter, "secret store unavailable: {detail}"),
			Self::VaultLocked => write!(formatter, "the vault is locked"),
			Self::VaultPassphraseRejected => write!(formatter, "the vault passphrase was rejected"),
			Self::VaultUnreadable { detail } => write!(formatter, "the vault could not be read: {detail}"),
			Self::BackendUnavailable { detail } => {
				write!(formatter, "the store holding this secret is unavailable: {detail}")
			}
			Self::NotFound { key } => write!(formatter, "no secret named {key}"),
			Self::InvalidKey { key } => write!(formatter, "{key} is not a usable secret name"),
			Self::EmptyValue => write!(formatter, "a secret cannot be stored empty"),
			Self::IndexUnwritable { detail } => write!(formatter, "the secret index could not be written: {detail}"),
			Self::IndexUnreadable { detail } => {
				write!(formatter, "the secret index could not be read: {detail}")
			}
			Self::NoSpace { bot_id } => write!(formatter, "bot {bot_id} belongs to no space"),
			Self::NoServer { bot_id } => write!(formatter, "no server named for bot {bot_id}"),
			Self::InvalidServer { server } => {
				write!(formatter, "{server} is not a usable server name")
			}
			Self::UnknownServer { server } => {
				write!(formatter, "this bot declares no server named {server}")
			}
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HeldBy {
	Keyring,
	Vault,
	Unknown,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SecretScope {
	Space,
	#[default]
	Bot,
	Server,
}

const SPACE_OWNER_PREFIX: &str = "space:";
const SERVER_OWNER_PREFIX: &str = "server:";

const OWNER_PREFIXES: [&str; 2] = [SPACE_OWNER_PREFIX, SERVER_OWNER_PREFIX];

pub fn space_owner(space_id: &str) -> String {
	format!("{SPACE_OWNER_PREFIX}{space_id}")
}

pub fn server_owners_of(bot_id: &str) -> String {
	format!("{SERVER_OWNER_PREFIX}{bot_id}:")
}

pub fn server_owner(bot_id: &str, server: &str) -> String {
	format!("{}{server}", server_owners_of(bot_id))
}

pub fn is_usable_server(server: &str) -> bool {
	!server.is_empty() && !server.contains(':')
}

pub fn owner_for(
	scope: SecretScope,
	bot_id: &str,
	space_id: Option<&str>,
	server: Option<&str>,
) -> Result<String, SecretError> {
	match scope {
		SecretScope::Bot => Ok(bot_id.to_owned()),
		SecretScope::Space => {
			space_id.map(space_owner).ok_or(SecretError::NoSpace { bot_id: bot_id.to_owned() })
		}
		SecretScope::Server => {
			let server = server.ok_or(SecretError::NoServer { bot_id: bot_id.to_owned() })?;
			if !is_usable_server(server) {
				return Err(SecretError::InvalidServer { server: server.to_owned() });
			}
			Ok(server_owner(bot_id, server))
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
		&& !OWNER_PREFIXES.iter().any(|prefix| key.starts_with(prefix))
		&& key.chars().all(|letter| letter.is_ascii_graphic() || letter == ' ')
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn a_call_naming_no_scope_targets_the_bot() {
		assert_eq!(owner_for(SecretScope::default(), "bot", Some("s1"), None), Ok("bot".to_owned()));
	}

	#[test]
	fn the_space_scope_is_addressed_under_its_own_prefix() {
		assert_eq!(
			owner_for(SecretScope::Space, "bot", Some("s1"), None),
			Ok("space:s1".to_owned())
		);
		assert_eq!(account_for("space:s1", "SHARED"), "space:s1:SHARED");
	}

	#[test]
	fn the_space_scope_is_refused_to_a_bot_that_belongs_to_none() {
		assert_eq!(
			owner_for(SecretScope::Space, "bot", None, None),
			Err(SecretError::NoSpace { bot_id: "bot".to_owned() })
		);
	}

	#[test]
	fn a_key_can_never_forge_an_owner_of_its_own() {
		for forged in ["space:s1:SHARED", "server:bot:github", "space:", "server:"] {
			assert!(!is_usable_key(forged), "{forged}");
		}
	}

	#[test]
	fn a_server_owner_sits_under_its_bot() {
		assert_eq!(
			owner_for(SecretScope::Server, "bot", Some("s1"), Some("github")),
			Ok("server:bot:github".to_owned())
		);
		assert_eq!(account_for("server:bot:github", "TOKEN"), "server:bot:github:TOKEN");
	}

	#[test]
	fn a_server_owner_named_without_a_server_is_refused() {
		assert_eq!(
			owner_for(SecretScope::Server, "bot", Some("s1"), None),
			Err(SecretError::NoServer { bot_id: "bot".to_owned() })
		);
	}

	#[test]
	fn a_server_name_that_would_blur_the_account_is_refused() {
		assert_eq!(
			owner_for(SecretScope::Server, "bot", None, Some("git:hub")),
			Err(SecretError::InvalidServer { server: "git:hub".to_owned() })
		);
	}
}
