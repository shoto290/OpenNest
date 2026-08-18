//! The model catalogue the installed Claude Code carries, read out of the
//! executable itself.
//!
//! There is nothing to ask. No `claude models` subcommand exists, the init frame of
//! a session names only the model already answering, and `--help` is usage text
//! rather than an interface. What does exist is the executable: Claude Code ships as
//! a single file with its own source inside it, and that source declares both the
//! identifiers it accepts and the aliases it resolves. So the file is read.
//!
//! Nothing here names a tier. A build that knew `opus` and `sonnet` would be the
//! defect this module exists for: a machine whose executable carries a tier this
//! build has never heard of would be a machine whose models the app cannot offer.
//! The tiers are learned from the file, by shape:
//!
//! - an identifier is `claude-` and a word, and the rest of it is versions —
//!   `claude-<tier>-<major>[-<minor>][-<date>]`, in either the modern order or the
//!   older one where the word follows the numbers. The word is a tier;
//! - anything else the file spells `claude-…` whose first word is one of those tiers
//!   is an identifier of that tier, whatever its tail says: a `-fast`, a `[1m]`, a
//!   `-preview` with no version at all;
//! - an alias is a bare word in a short array of bare words, most of which are
//!   already known to be tiers. That is what tells the alias table apart from the
//!   thousand other word lists in a 300MB bundle, and it is what lets an alias that
//!   is nobody's tier — a "pick the best one for me" — come along with them.
//!
//! The answer states what the executable knows how to name. Whether a subscription
//! grants it is a different question, asked by the provider when a run starts, and
//! not one this side pretends to answer.

use std::collections::{BTreeMap, BTreeSet};
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;
use std::sync::OnceLock;

use super::binary;

/// How much of the file is held at once. The tokens read out of it are tens of bytes
/// and the arrays a hundred or two, so the window only has to be large enough that
/// one of those is never cut in half — [`CARRY`] is what guarantees it.
const CHUNK: usize = 1 << 20;

/// Carried from the end of one chunk to the start of the next, so a token or an
/// array straddling the boundary is still read whole. Larger than [`ARRAY_BYTES`]
/// on purpose: nothing this scan looks for can be longer than that and still be
/// looked for.
const CARRY: usize = 4 << 10;

/// The bounds that make an array of bare words a table rather than a dictionary.
/// A bundle this size holds thousands of word lists — every syntax keyword of every
/// language it highlights, every name its name generator draws from — and an alias
/// table is a handful of words. Anything longer is abandoned where it is found.
const ARRAY_ITEMS: usize = 64;
const ARRAY_BYTES: usize = 2 << 10;

const PREFIX: &str = "claude-";

/// The catalogue for this launch, read once. A read is a pass over a file that can
/// be hundreds of megabytes: doing it per call would be doing it for nothing, since
/// the file cannot change under a running install.
static CATALOGUE: OnceLock<Vec<String>> = OnceLock::new();

/// The catalogue, in the order it is offered: tier by tier, each tier's own alias
/// first. Empty says nothing was found — no executable, or one that carries no
/// identifier — and what to offer instead is the caller's to decide.
pub async fn read() -> Vec<String> {
	if let Some(found) = CATALOGUE.get() {
		return found.clone();
	}
	let found = tokio::task::spawn_blocking(installed).await.unwrap_or_default();
	CATALOGUE.get_or_init(|| found).clone()
}

/// The first executable on the search path that carries a catalogue. Every candidate
/// is followed to the file it really is — the `claude` first on `PATH` is often a
/// launcher or a symlink into a version-numbered directory, and the catalogue lives
/// in whatever that points at, never at a path this build could spell.
fn installed() -> Vec<String> {
	let mut seen = BTreeSet::new();
	for candidate in binary::candidates() {
		let Ok(path) = candidate.canonicalize() else {
			continue;
		};
		if !path.is_file() || !seen.insert(path.clone()) {
			continue;
		}
		let found = catalogue_of(&path);
		if !found.is_empty() {
			return found;
		}
	}
	Vec::new()
}

/// One pass over one file. Fails soft: a file that cannot be read carries no
/// catalogue, which is the same answer as a file that carries none.
pub fn catalogue_of(path: &Path) -> Vec<String> {
	let Ok(file) = File::open(path) else {
		return Vec::new();
	};
	let mut reader = BufReader::new(file);
	let mut window = Vec::with_capacity(CHUNK + CARRY);
	let mut chunk = vec![0u8; CHUNK];
	let mut found = Candidates::default();

	loop {
		let read = match reader.read(&mut chunk) {
			Ok(0) => break,
			Ok(read) => read,
			Err(_) => return Vec::new(),
		};
		window.extend_from_slice(&chunk[..read]);
		found.gather(&window);
		let keep = window.len().saturating_sub(CARRY);
		window.drain(..keep);
	}
	found.gather(&window);
	found.offered()
}

/// What one pass collects: every `claude-…` the file spells, and every short array of
/// bare words in it. Both are small — the arrays are bounded and the identifiers are
/// a few dozen bytes — so a pass holds them all and the sorting out happens after,
/// when the tiers are known.
#[derive(Default)]
struct Candidates {
	ids: BTreeSet<String>,
	arrays: BTreeSet<Vec<String>>,
}

impl Candidates {
	fn gather(&mut self, window: &[u8]) {
		let mut at = 0;
		while at < window.len() {
			match window[at] {
				b'"' => match quoted(window, at) {
					Some((token, next)) => {
						if token.starts_with(PREFIX) {
							self.ids.insert(token);
						}
						at = next;
					}
					None => at += 1,
				},
				b'[' => {
					if let Some((items, next)) = bare_array(window, at) {
						self.arrays.insert(items);
						at = next;
						continue;
					}
					at += 1;
				}
				_ => at += 1,
			}
		}
	}

	/// The offered list, once the file has been read whole: tier groups in a stable
	/// order, each opening with the tier's own alias, and the aliases that name no
	/// tier at the end — they answer for the whole catalogue rather than a part of it.
	fn offered(&self) -> Vec<String> {
		let tiers = self.tiers();
		if tiers.is_empty() {
			return Vec::new();
		}
		let mut grouped: BTreeMap<&str, Vec<String>> = BTreeMap::new();
		let mut loose = Vec::new();

		for alias in &self.aliases(&tiers) {
			match tier_named_by(&tiers, alias) {
				Some(tier) => grouped.entry(tier).or_default().push(alias.clone()),
				None => loose.push(alias.clone()),
			}
		}
		for id in &self.ids {
			if let Some(tier) = tier_of_id(&tiers, id) {
				grouped.entry(tier).or_default().push(id.clone());
			}
		}

		let mut offered = Vec::new();
		for (tier, mut values) in grouped {
			values.sort_by_key(|value| ordering_key(tier, value));
			offered.extend(values);
		}
		loose.sort();
		offered.extend(loose);
		offered
	}

	/// Every word the file uses as a tier, learned from the identifiers that are a
	/// word and versions and nothing else.
	fn tiers(&self) -> BTreeSet<String> {
		self.ids.iter().filter_map(|id| declared_tier(id)).collect()
	}

	/// The alias tables, told apart from every other list of words by how many of
	/// their entries are already known to be tiers. Half is enough: a table names the
	/// tiers and then a few things that are not — a `[1m]` variant, a plan-mode pair,
	/// a "best available" — while a dictionary that happens to hold one of these words
	/// holds a thousand that are not.
	fn aliases(&self, tiers: &BTreeSet<String>) -> BTreeSet<String> {
		let mut aliases = BTreeSet::new();
		for items in &self.arrays {
			let named = items.iter().filter(|item| tier_named_by(tiers, item).is_some()).count();
			if named * 2 >= items.len() {
				aliases.extend(items.iter().cloned());
			}
		}
		aliases
	}
}

/// The quoted token starting at `at`, and where it ends. Only the shapes an
/// identifier or an alias can take: lowercase, digits, dashes, dots and the brackets
/// a long-context variant is spelled with. Anything else is not one, and stops it.
fn quoted(window: &[u8], at: usize) -> Option<(String, usize)> {
	let mut end = at + 1;
	while end < window.len() && is_token(window[end]) {
		end += 1;
	}
	if window.get(end) != Some(&b'"') || end == at + 1 {
		return None;
	}
	let token = std::str::from_utf8(&window[at + 1..end]).ok()?;
	Some((token.to_owned(), end + 1))
}

fn is_token(byte: u8) -> bool {
	byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'-' | b'.' | b'[' | b']')
}

/// An array literal of quoted bare words — no dashes, no digits outside a bracketed
/// suffix — bounded in both items and bytes. The bounds are the whole point: they
/// are what a table has and a dictionary does not.
fn bare_array(window: &[u8], at: usize) -> Option<(Vec<String>, usize)> {
	let mut items = Vec::new();
	let mut cursor = at + 1;
	loop {
		if cursor - at > ARRAY_BYTES || items.len() > ARRAY_ITEMS {
			return None;
		}
		let (token, next) = quoted(window, cursor)?;
		if !is_bare(&token) {
			return None;
		}
		items.push(token);
		cursor = next;
		match window.get(cursor) {
			Some(b',') => cursor += 1,
			Some(b']') => break,
			_ => return None,
		}
	}
	(items.len() >= 2).then_some((items, cursor + 1))
}

/// A word that could be an alias: one word, with digits only inside the bracketed
/// suffix that marks a long-context variant. `opus41` is an internal key for a model
/// and not something a caller may pass; `opus[1m]` is.
fn is_bare(token: &str) -> bool {
	let stem = token.split('[').next().unwrap_or(token);
	!stem.is_empty()
		&& !stem.contains('-')
		&& !stem.contains('.')
		&& stem.chars().all(|letter| letter.is_ascii_lowercase())
}

/// The tier an identifier declares by being nothing but a word and versions. `None`
/// for everything else, which is most of what a bundle spells `claude-…`: a document
/// slug, a plugin name, a telemetry key.
fn declared_tier(id: &str) -> Option<String> {
	let rest = id.strip_prefix(PREFIX)?;
	if rest.is_empty() || rest.ends_with('-') {
		return None;
	}
	let parts: Vec<&str> = rest.split('-').collect();
	let (index, word) = parts
		.iter()
		.enumerate()
		.find(|(_, part)| !part.chars().all(|letter| letter.is_ascii_digit()))?;
	if !word.chars().all(|letter| letter.is_ascii_lowercase()) {
		return None;
	}
	let versions: Vec<&&str> =
		parts.iter().enumerate().filter(|(at, _)| *at != index).map(|(_, part)| part).collect();
	is_version(&versions).then(|| (*word).to_owned())
}

/// `major`, `major-minor`, and either of those followed by a release date. Two digits
/// at most per version, exactly eight for a date: it is what keeps a dated slug like
/// `claude-code-20250219` from declaring `code` a tier.
fn is_version(parts: &[&&str]) -> bool {
	if parts.is_empty() || !parts.iter().all(|part| part.chars().all(|l| l.is_ascii_digit())) {
		return false;
	}
	let versions = match parts.split_last() {
		Some((last, head)) if last.len() == 8 && !head.is_empty() => head,
		Some(_) => parts,
		None => return false,
	};
	versions.len() <= 2 && versions.iter().all(|part| (1..=2).contains(&part.len()))
}

/// The tier an alias belongs to: the longest one it starts with, so a plan-mode pair
/// sits with the tier it is named after and a bare tier name sits with itself. `None`
/// is an alias that names no tier at all.
fn tier_named_by<'a>(tiers: &'a BTreeSet<String>, alias: &str) -> Option<&'a str> {
	let stem = alias.split('[').next().unwrap_or(alias);
	tiers
		.iter()
		.filter(|tier| stem.starts_with(tier.as_str()))
		.max_by_key(|tier| tier.len())
		.map(String::as_str)
}

/// The tier an identifier is offered under: the word after `claude-` when that is a
/// tier, and otherwise the tier it declares — which is how the older order, with the
/// versions in front of the word, lands in the same group as the new one.
fn tier_of_id<'a>(tiers: &'a BTreeSet<String>, id: &str) -> Option<&'a str> {
	let rest = id.strip_prefix(PREFIX)?;
	if rest.ends_with('-') {
		return None;
	}
	let head = rest.split('-').next().unwrap_or(rest);
	let head = head.split('[').next().unwrap_or(head);
	if let Some(tier) = tiers.get(head) {
		return Some(tier.as_str());
	}
	declared_tier(id).and_then(|declared| tiers.get(&declared).map(String::as_str))
}

/// Where a value sits inside its tier's group: the tier's own alias first, then its
/// other aliases, then its identifiers newest first — and a dated identifier after
/// the evergreen one it dates, since the evergreen is the one a bot should usually
/// be left on.
fn ordering_key(tier: &str, value: &str) -> (u8, Vec<i64>, usize, String) {
	let is_id = value.starts_with(PREFIX);
	let rank = match (is_id, value == tier) {
		(false, true) => 0,
		(false, false) => 1,
		(true, _) => 2,
	};
	let versions: Vec<i64> = value
		.split(['-', '[', ']'])
		.filter_map(|part| part.parse::<i64>().ok())
		.map(|number| -number)
		.collect();
	(rank, versions, value.len(), value.to_owned())
}

#[cfg(test)]
mod tests {
	use super::*;

	/// A tier name written nowhere but here. It is the whole point of the test: the
	/// scan has no list of tiers to check against, so a tier nobody has heard of is
	/// read exactly as well as the ones that shipped with this build.
	const INVENTED: &str = "nimbus";

	/// What an executable looks like to this scan: declarations among noise, in the
	/// shapes the real one uses — an array of identifiers, an alias table, a lone
	/// identifier with no version at all, and a great deal that is not a model.
	fn a_bundle() -> Vec<u8> {
		let mut bundle = String::from("var x=1;");
		bundle.push_str(
			r#"Q={"claude-code-docs":1,"claude-cli":2};Z=["claude-nimbus-5","claude-nimbus-4-1","claude-nimbus-4-1-20260114","claude-ember-3"];"#,
		);
		bundle.push_str(r#"A=["nimbus","ember","best","nimbus[1m]","nimbusplan"];"#);
		bundle.push_str(r#"var lone="claude-nimbus-preview";var fast="claude-nimbus-4-1-fast";"#);
		// The keys of a model config, which name models and are not values a caller
		// may pass, and a dated slug that is not a model at all.
		bundle.push_str(r#"K=["nimbus41","ember3"];D=["claude-code-20250219"];"#);
		// A dictionary that happens to hold a tier's name, which is what the bounds on
		// an array are for.
		let mut words: Vec<String> = (0..400).map(|n| format!("\"w{n}\"")).collect();
		words.push("\"nimbus\"".to_owned());
		bundle.push_str(&format!("W=[{}];", words.join(",")));
		bundle.into_bytes()
	}

	fn offered(bundle: &[u8]) -> Vec<String> {
		let mut found = Candidates::default();
		found.gather(bundle);
		found.offered()
	}

	#[test]
	fn a_tier_this_build_never_heard_of_is_offered_with_everything_it_carries() {
		let offered = offered(&a_bundle());

		assert!(
			offered.iter().any(|value| value == INVENTED),
			"the alias of an unknown tier was not offered: {offered:?}"
		);
		for identifier in [
			"claude-nimbus-5",
			"claude-nimbus-4-1",
			"claude-nimbus-4-1-20260114",
			"claude-nimbus-4-1-fast",
			"claude-nimbus-preview",
		] {
			assert!(
				offered.iter().any(|value| value == identifier),
				"{identifier} was not offered: {offered:?}"
			);
		}
	}

	/// The aliases come from the table the file carries, including the one that names
	/// no tier: a build that only accepted aliases it could derive from a tier would
	/// drop "pick the best one" on the floor.
	#[test]
	fn the_alias_table_is_read_whole_including_what_names_no_tier() {
		let offered = offered(&a_bundle());

		for alias in ["nimbus", "ember", "best", "nimbus[1m]", "nimbusplan"] {
			assert!(offered.iter().any(|value| value == alias), "{alias} was not offered");
		}
	}

	/// Everything a bundle spells `claude-…` that is not a model, and everything a
	/// word list holds that is not an alias. A catalogue with a documentation slug in
	/// it is a model a bot can be set to and no run can start under.
	#[test]
	fn what_is_not_a_model_is_not_offered() {
		let offered = offered(&a_bundle());

		for noise in [
			"claude-code-docs",
			"claude-cli",
			"claude-code-20250219",
			"nimbus41",
			"ember3",
			"w1",
			"w399",
		] {
			assert!(!offered.iter().any(|value| value == noise), "{noise} was offered");
		}
	}

	/// Grouped by tier, and each group opens with the alias a reader should usually
	/// pick: the tier's own name, which follows the tier rather than pinning the bot
	/// to one release of it.
	#[test]
	fn each_tier_is_offered_together_with_its_own_alias_first() {
		let offered = offered(&a_bundle());
		let ember = offered.iter().position(|value| value == "ember").expect("the ember alias");
		let nimbus = offered.iter().position(|value| value == INVENTED).expect("the nimbus alias");
		let nimbus_five =
			offered.iter().position(|value| value == "claude-nimbus-5").expect("the newest nimbus");

		assert!(ember < nimbus, "the tiers are not grouped in a stable order: {offered:?}");
		assert!(nimbus < nimbus_five, "a tier's identifiers came before its own alias");
		assert_eq!(
			offered.last().map(String::as_str),
			Some("best"),
			"an alias that names no tier belongs after the tiers it stands in for"
		);
		let nimbus_group: Vec<&String> =
			offered.iter().filter(|value| value.contains(INVENTED)).collect();
		assert_eq!(
			nimbus_group.first().map(|value| value.as_str()),
			Some(INVENTED),
			"the group does not open with its alias"
		);
	}

	/// The newest release of a tier comes first, and a dated identifier sits behind
	/// the evergreen one it dates.
	#[test]
	fn a_tier_lists_its_newest_release_first() {
		let offered = offered(&a_bundle());
		let at = |needle: &str| offered.iter().position(|value| value == needle).expect(needle);

		assert!(at("claude-nimbus-5") < at("claude-nimbus-4-1"));
		assert!(at("claude-nimbus-4-1") < at("claude-nimbus-4-1-20260114"));
	}

	/// A declaration split across two reads is still one declaration. The window is
	/// what makes that true, and a scan without it would drop whatever the boundary
	/// happened to land in.
	#[test]
	fn a_declaration_straddling_two_reads_is_read_whole() {
		let dir = std::env::temp_dir().join(format!("opennest-catalogue-{}", std::process::id()));
		std::fs::create_dir_all(&dir).expect("a place for the fixture");
		let path = dir.join("bundle");
		let mut bundle = vec![b' '; CHUNK - 12];
		bundle.extend_from_slice(&a_bundle());
		std::fs::write(&path, &bundle).expect("the fixture is written");

		let offered = catalogue_of(&path);

		assert!(offered.iter().any(|value| value == "claude-nimbus-5"), "{offered:?}");
		assert!(offered.iter().any(|value| value == "best"));
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The executable this machine has, read the way a launch reads it. Ignored
	/// because it asserts about somebody's installation: what it proves is that the
	/// shapes above are the shapes a real bundle uses, and it is the only place that
	/// can prove it. Run it with `--ignored` after touching the scan.
	#[test]
	#[ignore = "reads the Claude Code installed on this machine"]
	fn the_installed_executable_answers_its_own_catalogue() {
		let offered = installed();

		assert!(!offered.is_empty(), "no catalogue was found on this machine");
		let identifiers = offered.iter().filter(|value| value.starts_with(PREFIX)).count();
		let aliases = offered.len() - identifiers;
		println!("{aliases} aliases and {identifiers} identifiers: {offered:#?}");
		assert!(identifiers >= 4, "a bundle carrying a catalogue named fewer models than a tier");
		assert!(aliases >= 4, "a bundle carrying an alias table named fewer aliases than tiers");
	}

	/// A file with nothing in it, and a path that is not a file at all. Both are the
	/// same answer, and it is not a failure: what to offer instead is the caller's.
	#[test]
	fn a_file_with_no_catalogue_and_a_path_with_no_file_both_answer_nothing() {
		assert!(offered(b"var x=1;Z=[\"claude-code-docs\"];").is_empty());
		assert!(catalogue_of(Path::new("/nowhere/at/all/claude")).is_empty());
	}
}
