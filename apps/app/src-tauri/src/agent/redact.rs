
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, RwLock};

const MASK: &str = "[redacted]";
const SHORTEST_REDACTABLE: usize = 8;

static SECRETS: LazyLock<RwLock<BTreeSet<String>>> = LazyLock::new(RwLock::default);

pub fn remember(value: &str) {
	if value.chars().count() < SHORTEST_REDACTABLE {
		return;
	}
	SECRETS.write().expect("secrets").insert(value.to_owned());
}

pub fn forget(value: &str) {
	SECRETS.write().expect("secrets").remove(value);
}

fn masked(value: String) -> String {
	let registered = SECRETS.read().expect("secrets");
	if registered.is_empty() {
		return value;
	}
	let mut known: Vec<&String> = registered.iter().collect();
	known.sort_by_key(|secret| std::cmp::Reverse(secret.len()));
	known.into_iter().fold(value, |line, secret| line.replace(secret.as_str(), MASK))
}

pub fn home_dir() -> Option<PathBuf> {
	std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from)
}

pub fn path(value: &Path) -> String {
	match home_dir().and_then(|home| value.strip_prefix(home).ok().map(Path::to_path_buf)) {
		Some(rest) => format!("~/{}", rest.display()),
		None => value.display().to_string(),
	}
}

pub fn text(value: &str) -> String {
	let without_home = match home_dir().map(|home| home.display().to_string()) {
		Some(home) if !home.is_empty() => value.replace(&home, "~"),
		_ => value.to_owned(),
	};
	masked(without_home)
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn paths_and_text_both_lose_the_home_prefix() {
		let home = home_dir().expect("home");
		assert_eq!(path(&home.join(".local/bin/agent")), "~/.local/bin/agent");
		assert_eq!(text(&format!("cat {}/notes.txt", home.display())), "cat ~/notes.txt");
	}

	#[test]
	fn a_remembered_secret_never_survives_a_log_line() {
		remember("sk-live-abcdef123456");
		assert_eq!(text("Authorization: sk-live-abcdef123456"), "Authorization: [redacted]");
		forget("sk-live-abcdef123456");
		assert_eq!(text("Authorization: sk-live-abcdef123456"), "Authorization: sk-live-abcdef123456");
	}

	#[test]
	fn a_value_too_short_to_be_a_secret_is_never_remembered() {
		remember("abc");
		assert_eq!(text("abc def"), "abc def");
	}

	#[test]
	fn the_longest_match_wins_when_one_secret_contains_another() {
		remember("token-abcdef");
		remember("token-abcdef-and-more");
		assert_eq!(text("sent token-abcdef-and-more"), "sent [redacted]");
		forget("token-abcdef");
		forget("token-abcdef-and-more");
	}

	#[test]
	fn paths_outside_home_are_untouched() {
		assert_eq!(path(Path::new("/usr/local/bin/agent")), "/usr/local/bin/agent");
		assert_eq!(text("echo hello"), "echo hello");
	}
}
