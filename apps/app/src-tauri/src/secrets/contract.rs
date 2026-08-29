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

pub const REFERENCE_OPEN: &str = "${secret:";
pub const REFERENCE_CLOSE: char = '}';

const INTERPOLATION_OPEN: &str = "${";

const UNUSABLE_IN_KEY: [char; 4] = [':', '{', '}', '$'];

pub fn is_usable_key(key: &str) -> bool {
	!key.is_empty()
		&& !key.contains(UNUSABLE_IN_KEY)
		&& !OWNER_PREFIXES.iter().any(|prefix| key.starts_with(prefix))
		&& key.chars().all(|letter| letter.is_ascii_graphic() || letter == ' ')
}

fn is_reference_key(key: &str) -> bool {
	!key.is_empty()
		&& !key.contains(UNUSABLE_IN_KEY)
		&& key.chars().all(|letter| !letter.is_whitespace())
}

pub fn placeholder_for(key: &str) -> String {
	format!("{REFERENCE_OPEN}{key}{REFERENCE_CLOSE}")
}

pub fn references_in(value: &str) -> Vec<String> {
	let mut found = Vec::new();
	let mut rest = value;
	while let Some(at) = rest.find(REFERENCE_OPEN) {
		let after = &rest[at + REFERENCE_OPEN.len()..];
		let Some(end) = after.find(REFERENCE_CLOSE) else {
			return found;
		};
		let key = &after[..end];
		if is_reference_key(key) && !found.iter().any(|held| held == key) {
			found.push(key.to_owned());
		}
		rest = &after[end + REFERENCE_CLOSE.len_utf8()..];
	}
	found
}

pub fn holds_a_reference(value: &str) -> bool {
	!references_in(value).is_empty()
}

pub fn looks_interpolated(value: &str) -> bool {
	value.contains(INTERPOLATION_OPEN)
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

	const REFERENCE_CASES: [(&str, &[&str]); 18] = [
		("${secret:github.env.TOKEN}", &["github.env.TOKEN"]),
		("Bearer ${secret:github.env.TOKEN}", &["github.env.TOKEN"]),
		("${secret:a.env.ONE} and ${secret:b.env.TWO}", &["a.env.ONE", "b.env.TWO"]),
		("${secret:a.env.ONE}${secret:a.env.ONE}", &["a.env.ONE"]),
		("${secret:remote.args.3}", &["remote.args.3"]),
		("${secret:remote.url.api_key}", &["remote.url.api_key"]),
		("${secret:Server-One.headers.X-Api-Key}", &["Server-One.headers.X-Api-Key"]),
		("no reference at all", &[]),
		("${env:GITHUB_TOKEN}", &[]),
		("${secret:}", &[]),
		("${secret:has space}", &[]),
		("${secret:has\nnewline}", &[]),
		("${secret:has{brace}", &[]),
		("${secret:has:colon}", &[]),
		("${secret:has$dollar}", &[]),
		("${secret:unclosed", &[]),
		("$ {secret:spaced}", &[]),
		("${SECRET:github.env.TOKEN}", &[]),
	];

	const ROUND_TRIP_KEYS: [&str; 5] = [
		"github.env.GITHUB_TOKEN",
		"github.headers.Authorization",
		"remote.args.0",
		"remote.url.api_key",
		"Server-One.env.X_TOKEN",
	];

	#[test]
	fn the_grammar_reads_the_same_cases_the_front_reads() {
		for (text, keys) in REFERENCE_CASES {
			assert_eq!(references_in(text), keys.to_vec(), "reading {text:?}");
			assert_eq!(holds_a_reference(text), !keys.is_empty(), "reading {text:?}");
		}
	}

	#[test]
	fn every_key_the_migration_emits_round_trips() {
		for key in ROUND_TRIP_KEYS {
			assert_eq!(references_in(&placeholder_for(key)), vec![key.to_owned()]);
			assert!(is_usable_key(key), "{key}");
		}
	}

	#[test]
	fn a_curly_form_the_grammar_refuses_is_never_a_reference() {
		assert!(!holds_a_reference("${env:GITHUB_TOKEN}"));
		assert!(looks_interpolated("${env:GITHUB_TOKEN}"));
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
