//! The plugin bundle a bot runs as, beside the avatars and the database.
//!
//! A bot is not a system prompt the host appends any more: it is a directory the
//! agent loads for the session and never installs — a manifest and one agent file,
//! handed over as `pluginPath` and `agent`. What the bot was told is the body of
//! that file. See `agent/PLUGINS.md` for what was measured against the real install
//! before any of this was written.
//!
//! ```text
//! <app data>/bots/
//!   .claude-plugin/marketplace.json   every bot, by id and relative source
//!   plugins/<bot id>/
//!     .claude-plugin/plugin.json      name: <bot id>, displayName: <bot name>
//!     agents/<slug>.md                metadata carries the bot id
//! ```
//!
//! **A name is not an identity.** It changes, and two bots can share one, so the id
//! names the plugin, marks the generated agent as this bot's, and qualifies the agent
//! a session promotes. What the reader calls the bot is display only.
//!
//! One marketplace over a directory of bundles, so a reader adds this one path and
//! has every bot — rather than installing each directory by hand.
//!
//! **The disk is the truth.** The agent file is what a process is actually started
//! on, so it is what a bot is read from, and a body edited by hand is adopted rather
//! than written over: the stored value is the fallback for a bundle that has gone
//! missing, not the record the bundle is kept in step with.
//!
//! **Only generated files are written.** A bundle is a directory somebody else also
//! writes into — a skill dropped in by hand, an `.mcp.json`, an executable the next
//! wave puts there — so nothing here removes what it did not put down, and the
//! manifest keeps every key it did not set. The one file it takes away is the agent it
//! generated under a name the bot has stopped answering to, and it knows that file
//! because the frontmatter it wrote still carries the bot's id.
//!
//! Two keys are deliberately never emitted. `skills` preloads its content only when
//! an agent is delegated, so a file carrying it would behave differently depending
//! on who launched it; `permissionMode` is ignored on the promoted path and the host
//! owns permissions either way.
//!
//! **A skill reaches a promoted bot only as text in the body.** A `skills/<name>/SKILL.md`
//! whose frontmatter carries `metadata.opennest.preload` is copied into a generated
//! region at the end of the agent file, between two markers. The brief is everything
//! before the opening marker and never anything after it — a write that read the
//! region back as brief would carry the last write's copy into the next one, and the
//! file would grow on every save.

use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};

use crate::db::repositories::conversations::Bot;
use crate::private_files;

/// Beside `conversations.sqlite3` and the avatars.
const DIR_NAME: &str = "bots";

/// Where the bundles themselves sit, one level under the marketplace that lists
/// them: a marketplace names its plugins by a source relative to itself, so the
/// directory it lives in cannot also be one of them.
const PLUGINS_DIR: &str = "plugins";

/// Under the bot's own id, which is minted by the host and never a name a user
/// wrote: one bot's bundle can never land in another's directory, whatever the two
/// are called.
const MANIFEST_DIR: &str = ".claude-plugin";
const MANIFEST_NAME: &str = "plugin.json";
const MARKETPLACE_NAME: &str = "marketplace.json";
const AGENTS_DIR: &str = "agents";
const AGENT_EXTENSION: &str = "md";

/// Where a bot's skills sit, one directory each — written from here, or dropped in
/// by hand: the disk holds both the same way.
const SKILLS_DIR: &str = "skills";
const SKILL_NAME: &str = "SKILL.md";

/// What the marketplace calls itself, and what a reader would type after an `@`.
const MARKETPLACE: &str = "opennest-bots";
const OWNER: &str = "OpenNest";

/// What the manifest declares. The agent never installs a bundle and nothing
/// resolves one version against another, so this is a field the format asks for
/// rather than a number anything reads.
const VERSION: &str = "0.1.0";

/// What a bot whose name survives no slug is called. A name is free text and may be
/// emoji alone; the file still has to have one.
const UNNAMED: &str = "bot";

/// The frontmatter key a generated agent carries its bot's id under, inside the
/// `metadata` map the agent format keeps free for exactly this: Claude Code accepts
/// it and acts on none of it, so the marker costs the file nothing of its meaning.
///
/// It is what "generated" means here. A name is not an identity — it changes, and two
/// bots can share one — so the file this module rewrites is the file that says it
/// belongs to this bot, and anything else under `agents/` belongs to whoever wrote it.
const OWNER_KEY: &str = "opennestBotId";

/// The frontmatter key the agent format reads a model from. Honoured on the promoted
/// path — see `agent/PLUGINS.md` — which is why writing it is the whole of how a bot
/// runs on the model its reader picked.
const MODEL_KEY: &str = "model";

/// The frontmatter key a skill asks to be carried under, read from wherever it sits
/// in the map — `metadata.opennest.preload` — the same way [`OWNER_KEY`] is read.
const PRELOAD_KEY: &str = "preload";
const METADATA_KEY: &str = "metadata";
const OPENNEST_KEY: &str = "opennest";

/// What a carried skill is also marked with. Its body is already in the prompt, and
/// a skill left model-invocable is fetched again anyway — measured against the real
/// install, see `agent/PLUGINS.md` — so the two marks are written and taken away
/// together and never one without the other.
const INVOCATION_KEY: &str = "disable-model-invocation";

/// What a skill is titled and summarised by, and what a caller edits.
const NAME_KEY: &str = "name";
const DESCRIPTION_KEY: &str = "description";

/// What both marks are worth when they are there. Read back through
/// [`front_value`], which is why it is the word rather than a boolean.
const MARKED: &str = "true";

/// One level of a frontmatter map, in spaces. What this module writes when it adds
/// one; a file already nesting another way keeps its own.
const INDENT: usize = 2;

/// What fences the carried bodies off from the brief. HTML comments, so the region
/// says what it is to a reader opening the file and nothing to the model reading it
/// as markdown.
const CARRIED_OPEN: &str = "<!-- opennest: generated from this bot's skills, do not edit -->";
const CARRIED_CLOSE: &str = "<!-- opennest: end of generated skills -->";

/// The deepest heading markdown has. A skill carried under a brief that already goes
/// that deep keeps its own levels rather than growing a seventh.
const MAX_HEADING: usize = 6;

const FENCE: &str = "---";
const CLOSING_FENCE: &str = "\n---";

/// Where this install keeps bundles: a path, and nothing on the disk. `None` is a
/// host with no app data directory — the same answer the database and the avatars
/// give, and it means a bot runs as it did before there were bundles rather than
/// that the launch failed.
pub fn root<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
	Some(app.path().app_data_dir().ok()?.join(DIR_NAME))
}

/// The one directory a bot's bundle lives in, and what a session is handed as its
/// local plugin.
pub fn dir(root: &Path, bot_id: &str) -> PathBuf {
	root.join(PLUGINS_DIR).join(bot_id)
}

/// The name the agent is promoted under, and the name its file takes. Derived from
/// what the bot is called so a reader recognises it in a transcript, and reduced to
/// what an agent name may hold: a run of anything else is one separator.
pub fn slug(name: &str) -> String {
	let mut slug = String::new();
	for character in name.chars() {
		if character.is_ascii_alphanumeric() {
			slug.push(character.to_ascii_lowercase());
		} else if !slug.is_empty() && !slug.ends_with('-') {
			slug.push('-');
		}
	}
	let trimmed = slug.trim_end_matches('-');
	if trimmed.is_empty() {
		UNNAMED.to_owned()
	} else {
		trimmed.to_owned()
	}
}

/// The agent a session promotes, namespaced by the plugin it comes from. The bare
/// name resolves too, and it resolves against the reader's own `~/.claude/agents/`
/// and the project's — so a bot called `Reviewer` would race a `reviewer.md` the
/// reader wrote. Qualified by the plugin's name, which is the bot's id, it cannot.
pub fn agent_ref(root: &Path, bot: &Bot) -> String {
	format!("{}:{}", bot.id, agent_name(root, bot))
}

/// What the agent on the disk is called: the name of the file this module generated
/// for the bot, or the one the bot's own name would generate when there is none yet.
fn agent_name(root: &Path, bot: &Bot) -> String {
	generated_agent(root, &bot.id)
		.and_then(|path| Some(path.file_stem()?.to_string_lossy().into_owned()))
		.unwrap_or_else(|| slug(&bot.name))
}

/// The agent file this module wrote for the bot: the one under `agents/` whose
/// frontmatter carries the bot's id. Found by what it says rather than by where it
/// is, so a rename finds the file it is moving and a file nobody generated is never
/// mistaken for one.
fn generated_agent(root: &Path, bot_id: &str) -> Option<PathBuf> {
	fs::read_dir(dir(root, bot_id).join(AGENTS_DIR)).ok()?.flatten().find_map(|entry| {
		let path = entry.path();
		let text = fs::read_to_string(&path).ok()?;
		(marked_bot_id(&text)? == bot_id).then_some(path)
	})
}

/// The one file that lists every bundle, at the root a reader adds as a marketplace.
pub fn marketplace_file(root: &Path) -> PathBuf {
	root.join(MANIFEST_DIR).join(MARKETPLACE_NAME)
}

/// The bot's own agent file. `None` is a bundle with nothing to read — none written
/// yet, or one a reader has taken the agent out of — which is what a caller falls
/// back to the stored value for.
pub fn agent_file(root: &Path, bot_id: &str) -> Option<PathBuf> {
	generated_agent(root, bot_id)
}

/// What the agent file says the bot is: the brief a process would really be started
/// on, and the model it would really answer under. Both in one read, since a caller
/// that shows a bot shows both.
pub struct Generated {
	pub instructions: String,
	/// `None` for a file whose frontmatter names no model — a bundle written for a
	/// bot carrying no label, or an agent a reader wrote themselves.
	pub model: Option<String>,
}

/// The bot as its own agent file holds it. `None` is a bundle this install has not
/// written yet, or one a reader has taken the agent out of, and the caller answers
/// with the stored values instead.
pub fn generated(root: &Path, bot_id: &str) -> Option<Generated> {
	let text = fs::read_to_string(agent_file(root, bot_id)?).ok()?;
	let model = front_value(&text, MODEL_KEY)
		.map(|found| found.trim().to_owned())
		.filter(|found| !found.is_empty());
	Some(Generated { instructions: body(&text).to_owned(), model })
}

/// What the bot was told, as the file holds it.
pub fn instructions(root: &Path, bot_id: &str) -> Option<String> {
	Some(generated(root, bot_id)?.instructions)
}

/// The bundle as the bot stands right now: the keys this module owns in the manifest,
/// and the one agent file that carries the bot's id. Nothing else in the directory is
/// touched, and nothing else in the manifest is either.
///
/// A rename moves the agent rather than adding one — the marked file is taken away
/// once its body has been carried over — so a bundle holds exactly one generated
/// agent however many times the bot is renamed. Anything else under `agents/` was put
/// there by somebody else and keeps both its name and its content.
pub fn write(root: &Path, bot: &Bot) -> std::io::Result<()> {
	write_briefed(root, bot, &bot.instructions)
}

/// The same write, over a brief named rather than taken from the row. What a skill
/// change lays down: the row it holds may be behind the file — the disk is the
/// truth — and nothing about a skill is a reason to write a brief over the one the
/// bot is really running on.
fn write_briefed(root: &Path, bot: &Bot, brief: &str) -> std::io::Result<()> {
	let manifest_path = dir(root, &bot.id).join(MANIFEST_DIR).join(MANIFEST_NAME);
	let generated = generated_agent(root, &bot.id);
	let agent_path = free_agent_path(root, bot, generated.as_deref());
	let name = agent_path.file_stem().unwrap_or_default().to_string_lossy().into_owned();

	private_files::replace(&manifest_path, manifest(&manifest_path, bot).as_bytes())?;
	private_files::replace(&agent_path, agent(root, bot, &name, brief).as_bytes())?;
	if let Some(generated) = generated.filter(|path| path != &agent_path) {
		let _ = fs::remove_file(generated);
	}
	Ok(())
}

/// Where this bot's agent goes: the name it answers to, unless a file nobody
/// generated is already sitting there. A reader who hand-wrote `agents/helper.md` and
/// then renamed their bot to Helper keeps their file — the generated one steps aside
/// onto a name derived from the id, which nothing a human wrote can collide with.
fn free_agent_path(root: &Path, bot: &Bot, generated: Option<&Path>) -> PathBuf {
	let agents = dir(root, &bot.id).join(AGENTS_DIR);
	let preferred = agents.join(format!("{}.{AGENT_EXTENSION}", slug(&bot.name)));
	if Some(preferred.as_path()) == generated || !preferred.exists() {
		return preferred;
	}
	agents.join(format!("{}-{}.{AGENT_EXTENSION}", slug(&bot.name), bot.id))
}

/// The bundle, written if the disk holds no brief to start on: a directory removed
/// behind the app's back — restored from a backup, tidied up — is not a reason to
/// start a bot without one. A bundle that is there is left exactly as it is, hand
/// edits included.
pub fn ensure(root: &Path, bot: &Bot) -> std::io::Result<()> {
	if agent_file(root, &bot.id).is_some() {
		return Ok(());
	}
	write(root, bot)
}

/// What the disk says the bot was told, when that is not what is stored. `None`
/// means the two already agree, or there is nothing on the disk to agree with —
/// either way the caller has nothing to write down.
///
/// This is the whole of the direction of truth: a body edited by hand, by another
/// tool, or by an editor left open is adopted the next time anything reads or starts
/// the bot, rather than being written over by a value it never saw.
///
/// The two are compared as the file holds them, because the file holds the brief
/// trimmed — see [`agent`]. A reader who has just typed a space is otherwise a hand
/// edit against their own file, and the space goes back out from under them.
pub fn adopted(root: &Path, bot: &Bot) -> Option<String> {
	instructions(root, &bot.id).filter(|found| found != bot.instructions.trim())
}

/// What a write submitting a whole identity should lay down. The panel wins when the
/// reader changed the brief in it, and the disk wins when they did not: a rename, a
/// new title or another model carries whatever the agent file says rather than a
/// value the reader never saw.
///
/// `bot` is the row as it stood before this write, which is the only thing that says
/// whether the submitted brief is a new one or an echo of what was already there.
pub fn reconciled(root: &Path, bot: &Bot, submitted: &str) -> String {
	if submitted != bot.instructions {
		return submitted.to_owned();
	}
	adopted(root, bot).unwrap_or_else(|| bot.instructions.clone())
}

/// The bundle of a bot that is gone, taken away whole: nothing derives one for a bot
/// the file no longer holds, so nothing in it is anybody's to keep.
pub fn remove(root: &Path, bot_id: &str) {
	let _ = fs::remove_dir_all(dir(root, bot_id));
}

/// Every bot as one marketplace, so a reader adds this directory once and has all of
/// them. Rewritten whole from the roster rather than amended: the file is a
/// projection of the `bots` table, and a projection rebuilt from the table cannot
/// drift out of step with it.
///
/// Each entry names the bundle the way the bundle names itself: by the bot's id, which
/// is the one name two bots cannot share. What the reader calls them is in each
/// bundle's own manifest, and in the description here.
pub fn write_marketplace(root: &Path, bots: &[Bot]) -> std::io::Result<()> {
	let plugins: Vec<serde_json::Value> = bots
		.iter()
		.map(|bot| {
			serde_json::json!({
				"name": &bot.id,
				"source": format!("./{PLUGINS_DIR}/{}", bot.id),
				"description": describe(bot),
			})
		})
		.collect();
	let listed = serde_json::json!({
		"name": MARKETPLACE,
		"owner": { "name": OWNER },
		"plugins": plugins,
	});
	private_files::replace(&marketplace_file(root), listed.to_string().as_bytes())
}

/// What the bot is for, in one line. The title is the role a reader gave it; a bot
/// nobody gave one is described by its name, because the field routes delegation and
/// an empty one would offer nothing to route on.
fn describe(bot: &Bot) -> &str {
	if bot.title.trim().is_empty() {
		&bot.name
	} else {
		&bot.title
	}
}

/// The manifest with this module's own keys set and every other one left as it was
/// found. A bundle is a directory somebody else writes into: a reader who pointed
/// their bot's manifest at `mcpServers`, or gave it hooks, is not doing so between
/// panel edits.
///
/// The plugin is named by the bot's id rather than by the bot — a name changes, and
/// two bots can share one, so neither the marketplace nor the promoted agent could be
/// told apart by it. What the reader calls the bot travels as `displayName`.
fn manifest(path: &Path, bot: &Bot) -> String {
	let mut kept = fs::read_to_string(path)
		.ok()
		.and_then(|text| {
			serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(&text).ok()
		})
		.unwrap_or_default();
	kept.insert("name".to_owned(), bot.id.clone().into());
	kept.insert("version".to_owned(), VERSION.into());
	kept.insert("displayName".to_owned(), bot.name.clone().into());
	kept.insert("description".to_owned(), describe(bot).into());
	serde_json::Value::Object(kept).to_string()
}

/// Frontmatter and body. Every value is emitted as a quoted scalar rather than
/// written in raw, because a name or a title is free text: a colon, a hash or a
/// newline in either would otherwise make the file mean something else.
///
/// The `metadata` map is what marks the file as this bot's — see [`OWNER_KEY`].
///
/// `model` is the whole of how a reader's choice reaches the runtime: the key is
/// honoured on the promoted path, and a model option passed alongside would override
/// it — so nothing passes one. A bot holding no label writes no key at all, which is
/// the agent running on whatever the install defaults to rather than on the empty
/// string.
fn agent(root: &Path, bot: &Bot, name: &str, brief: &str) -> String {
	format!(
		"{FENCE}\nname: {}\ndescription: {}\n{}metadata:\n  {OWNER_KEY}: {}\n{FENCE}\n\n{}\n",
		quoted(name),
		quoted(describe(bot)),
		model_line(&bot.model),
		quoted(&bot.id),
		briefed_with_skills(root, &bot.id, brief)
	)
}

/// The brief, and under it the body of every skill the bot marked for preloading.
/// The brief is taken from outside the generated region even when it arrives already
/// carrying one, so the region is rebuilt from the skills on the disk on every write
/// rather than accumulated across writes.
///
/// A bot with nothing to carry writes no markers at all: the file is the brief, as it
/// was before there were skills.
fn briefed_with_skills(root: &Path, bot_id: &str, brief: &str) -> String {
	let brief = without_carried(brief);
	let level = (deepest_heading(brief) + 1).min(MAX_HEADING);
	let bodies: Vec<String> = preloaded(root, bot_id)
		.into_iter()
		.map(|skill| {
			format!("{} {}\n\n{}", "#".repeat(level), skill.name, demoted(&skill.body, level))
		})
		.collect();
	let carried = bodies.join("\n\n");
	if carried.is_empty() {
		return brief.to_owned();
	}
	format!("{brief}\n\n{CARRIED_OPEN}\n\n{carried}\n\n{CARRIED_CLOSE}")
}

/// Every skill of the bot's that asked to be carried, in the order the disk names
/// them: two writes over the same directory produce the same file. A bundle with no
/// `skills/` directory has none, which is every bot nobody dropped one into.
fn preloaded(root: &Path, bot_id: &str) -> Vec<Skill> {
	skills(root, bot_id).into_iter().filter(|skill| skill.is_preloaded).collect()
}

/// Every directory under the bot's `skills/`, by name. Sorted so two writes over the
/// same disk produce the same file, and empty for a bundle nobody has put a skill in.
fn skill_dirs(root: &Path, bot_id: &str) -> Vec<PathBuf> {
	let mut directories: Vec<PathBuf> = fs::read_dir(dir(root, bot_id).join(SKILLS_DIR))
		.into_iter()
		.flatten()
		.flatten()
		.map(|entry| entry.path())
		.collect();
	directories.sort();
	directories
}

/// A skill of the bot's, whole. `id` is the directory it lives in, which is the one
/// name two of them cannot share and the only one that survives a rename: what the
/// skill is called is free text in its frontmatter, and changing it moves nothing on
/// the disk.
///
/// `is_preloaded` is whether its body is carried into the agent file — see
/// [`set_skill_preloaded`].
pub struct Skill {
	pub id: String,
	pub name: String,
	pub description: String,
	pub body: String,
	pub is_preloaded: bool,
}

/// What a skill is written from. The mark is not here: it is set on its own, because
/// it changes what the bot is rather than what the skill says.
pub struct SkillDraft {
	pub name: String,
	pub description: String,
	pub body: String,
}

/// Every skill in the bot's bundle, by directory name. A skill dropped in by hand is
/// one of them: nothing here asks who wrote a file.
pub fn skills(root: &Path, bot_id: &str) -> Vec<Skill> {
	skill_dirs(root, bot_id).iter().filter_map(|path| read_skill(path)).collect()
}

/// A new skill, at the directory its name slugs to — or beside it, when something is
/// already there. The name and the description are the frontmatter a skill is
/// offered by; the mark is not written, so a new skill is text on the disk and
/// nothing in the bot's prompt until it is marked.
pub fn create_skill(root: &Path, bot: &Bot, draft: &SkillDraft) -> std::io::Result<Skill> {
	let path = free_skill_dir(root, &bot.id, &draft.name);
	written_skill(root, bot, &path, drafted(None, draft))
}

/// What the skill says, changed. The file is read and edited rather than written
/// from a template: a `SKILL.md` a hand or another tool wrote carries keys this app
/// knows nothing about, and they are put back exactly as they were found.
pub fn update_skill(
	root: &Path,
	bot: &Bot,
	skill_id: &str,
	draft: &SkillDraft,
) -> std::io::Result<Skill> {
	let path = skill_dir(root, &bot.id, skill_id)?;
	let text = fs::read_to_string(path.join(SKILL_NAME)).unwrap_or_default();
	written_skill(root, bot, &path, drafted(Some(&text), draft))
}

/// Whether the skill's body is carried into the bot's agent file. Both marks move
/// together — see [`INVOCATION_KEY`] — and the agent is rewritten, since this is the
/// one skill change that changes what the bot was told.
pub fn set_skill_preloaded(
	root: &Path,
	bot: &Bot,
	skill_id: &str,
	is_preloaded: bool,
) -> std::io::Result<Skill> {
	let path = skill_dir(root, &bot.id, skill_id)?;
	let text = fs::read_to_string(path.join(SKILL_NAME)).unwrap_or_default();
	written_skill(root, bot, &path, marked(&text, is_preloaded))
}

/// The skill, taken away whole: its own directory and nothing outside it. The path
/// is resolved by scanning the bot's own skills rather than joined from the id, so
/// an id naming anything else names no skill at all.
pub fn remove_skill(root: &Path, bot: &Bot, skill_id: &str) -> std::io::Result<()> {
	let path = skill_dir(root, &bot.id, skill_id)?;
	fs::remove_dir_all(path)?;
	rewrite_agent(root, bot)
}

/// The file written, the agent rewritten, and the skill read back off the disk —
/// which is what a caller is answered with, so what it holds is what the file says
/// rather than what the write meant.
fn written_skill(root: &Path, bot: &Bot, path: &Path, text: String) -> std::io::Result<Skill> {
	private_files::replace(&path.join(SKILL_NAME), text.as_bytes())?;
	rewrite_agent(root, bot)?;
	read_skill(path).ok_or_else(|| {
		std::io::Error::new(std::io::ErrorKind::NotFound, "the skill was not written")
	})
}

/// The bot's agent file, laid down again over the brief the disk holds. The brief is
/// nobody's to change here: a skill was marked, not a prompt rewritten, so what comes
/// through is what the file already said — the stored value only for a bundle there
/// is nothing to read.
fn rewrite_agent(root: &Path, bot: &Bot) -> std::io::Result<()> {
	let brief = instructions(root, &bot.id).unwrap_or_else(|| bot.instructions.clone());
	write_briefed(root, bot, &brief)
}

/// The skill in a directory, whatever it says about being carried. A name the
/// frontmatter does not carry is the directory's own, so a file somebody wrote
/// without one is still offered under something a reader recognises.
fn read_skill(path: &Path) -> Option<Skill> {
	let text = fs::read_to_string(path.join(SKILL_NAME)).ok()?;
	let id = path.file_name()?.to_string_lossy().into_owned();
	let named = front_value(&text, NAME_KEY).filter(|found| !found.is_empty());
	Some(Skill {
		name: named.unwrap_or_else(|| id.clone()),
		description: front_value(&text, DESCRIPTION_KEY).unwrap_or_default(),
		body: body(&text).to_owned(),
		is_preloaded: front_value(&text, PRELOAD_KEY).as_deref() == Some(MARKED),
		id,
	})
}

/// Where one of the bot's own skills lives. `NotFound` for an id that is not the name
/// of one of them, which is also what a caller reaching for a path of its own gets.
fn skill_dir(root: &Path, bot_id: &str, skill_id: &str) -> std::io::Result<PathBuf> {
	skill_dirs(root, bot_id)
		.into_iter()
		.find(|path| path.file_name().is_some_and(|name| name == skill_id))
		.ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "no such skill"))
}

/// Where a new skill goes: the directory its name slugs to, unless something is
/// already sitting there. Two skills a reader called the same thing are two
/// directories, and a skill dropped in by hand is never written over.
fn free_skill_dir(root: &Path, bot_id: &str, name: &str) -> PathBuf {
	let skills = dir(root, bot_id).join(SKILLS_DIR);
	let base = slug(name);
	let preferred = skills.join(&base);
	if !preferred.exists() {
		return preferred;
	}
	(2u32..)
		.map(|next| skills.join(format!("{base}-{next}")))
		.find(|path| !path.exists())
		.unwrap_or(preferred)
}

/// The file a draft leaves: the two keys a draft owns set, the body replaced, and
/// every other key of a file that was already there left exactly where it was.
fn drafted(existing: Option<&str>, draft: &SkillDraft) -> String {
	let mut parts = parts(existing.unwrap_or_default());
	parts.front = with_key(&parts.front, &[NAME_KEY], &quoted(&draft.name));
	parts.front = with_key(&parts.front, &[DESCRIPTION_KEY], &quoted(&draft.description));
	parts.body = format!("\n{}\n", draft.body.trim());
	rendered(&parts)
}

/// The same file with both marks written, or with both taken away. The body is not
/// touched — this is a key changing, not a skill being rewritten.
fn marked(text: &str, is_preloaded: bool) -> String {
	let path = [METADATA_KEY, OPENNEST_KEY, PRELOAD_KEY];
	let mut parts = parts(text);
	parts.front = if is_preloaded {
		with_key(&with_key(&parts.front, &path, MARKED), &[INVOCATION_KEY], MARKED)
	} else {
		without_key(&without_key(&parts.front, &path), &[INVOCATION_KEY])
	};
	rendered(&parts)
}

/// A skill file as something to edit: its frontmatter, and everything under it
/// verbatim. A file carrying none is all body, and one written back grows the
/// frontmatter it never had.
struct Parts {
	front: String,
	body: String,
}

fn parts(text: &str) -> Parts {
	match split_frontmatter(text) {
		Some((front, body)) => {
			Parts { front: front.trim_matches('\n').to_owned(), body: body.to_owned() }
		}
		None => {
			Parts { front: String::new(), body: format!("\n{}", text.trim_start_matches('\n')) }
		}
	}
}

fn rendered(parts: &Parts) -> String {
	format!("{FENCE}\n{}\n{FENCE}\n{}", parts.front, parts.body)
}

/// Frontmatter with one key set, wherever in the map it sits. A key already there is
/// replaced along with whatever was nested under it; a key that is not is added at
/// the end of the deepest map on its path that does exist, and the rest of the path
/// is written under it.
fn with_key(front: &str, path: &[&str], value: &str) -> String {
	let mut lines: Vec<String> = front.lines().map(str::to_owned).collect();
	let mut from = 0;
	let mut until = lines.len();
	let mut indent = 0;
	for (depth, key) in path.iter().enumerate() {
		let Some(at) = key_line(&lines, from, until, indent, key) else {
			let grown = branch(&path[depth..], indent, value);
			lines.splice(until..until, grown);
			return lines.join("\n");
		};
		if depth + 1 == path.len() {
			let end = block_end(&lines, at);
			lines.splice(at..end, [format!("{}{key}: {value}", " ".repeat(indent))]);
			return lines.join("\n");
		}
		from = at + 1;
		until = block_end(&lines, at);
		indent = child_indent(&lines, from, until).unwrap_or(indent + INDENT);
	}
	lines.join("\n")
}

/// Frontmatter with one key taken away, and with every map its going leaves empty
/// taken away too — a `metadata` holding nothing else is a key this module put there
/// and nobody else's to keep. A path the file does not carry changes nothing.
fn without_key(front: &str, path: &[&str]) -> String {
	let mut lines: Vec<String> = front.lines().map(str::to_owned).collect();
	let mut found: Vec<usize> = Vec::new();
	let mut from = 0;
	let mut until = lines.len();
	let mut indent = 0;
	for key in path {
		let Some(at) = key_line(&lines, from, until, indent, key) else {
			return front.to_owned();
		};
		found.push(at);
		from = at + 1;
		until = block_end(&lines, at);
		indent = child_indent(&lines, from, until).unwrap_or(indent + INDENT);
	}
	let Some(leaf) = found.pop() else {
		return front.to_owned();
	};
	let end = block_end(&lines, leaf);
	lines.drain(leaf..end);
	while let Some(parent) = found.pop() {
		if block_end(&lines, parent) != parent + 1 {
			break;
		}
		lines.remove(parent);
	}
	lines.join("\n")
}

/// A path written out as nested lines, the last one carrying the value.
fn branch(path: &[&str], indent: usize, value: &str) -> Vec<String> {
	path.iter()
		.enumerate()
		.map(|(step, key)| {
			let pad = " ".repeat(indent + step * INDENT);
			if step + 1 == path.len() {
				format!("{pad}{key}: {value}")
			} else {
				format!("{pad}{key}:")
			}
		})
		.collect()
}

/// Where a key sits at one depth of one map, or `None` for a map that does not carry
/// it. Found by indentation, so a `name` nested in a map is never mistaken for the
/// one at the top.
fn key_line(
	lines: &[String],
	from: usize,
	until: usize,
	indent: usize,
	key: &str,
) -> Option<usize> {
	(from..until.min(lines.len())).find(|index| {
		let line = &lines[*index];
		indent_of(line) == indent && key_of(line) == Some(key)
	})
}

/// Where a key's block ends: the first line after it that is indented no deeper than
/// it is. Blank lines belong to whatever follows them, so a map ending the
/// frontmatter is not held open by one.
fn block_end(lines: &[String], at: usize) -> usize {
	let indent = indent_of(&lines[at]);
	let mut end = at + 1;
	for (index, line) in lines.iter().enumerate().skip(at + 1) {
		if line.trim().is_empty() {
			continue;
		}
		if indent_of(line) <= indent {
			break;
		}
		end = index + 1;
	}
	end
}

/// How deep the lines of a block are indented, or `None` for a block with none. What
/// a key added to it is indented by, so a file nesting with four spaces keeps doing
/// so.
fn child_indent(lines: &[String], from: usize, until: usize) -> Option<usize> {
	lines
		.get(from..until.min(lines.len()))?
		.iter()
		.find(|line| !line.trim().is_empty())
		.map(|line| indent_of(line))
}

fn indent_of(line: &str) -> usize {
	line.len() - line.trim_start().len()
}

fn key_of(line: &str) -> Option<&str> {
	Some(line.split_once(':')?.0.trim())
}

/// The brief: everything before the generated region. Taken from the opening marker
/// rather than between the two, so a file whose closing marker was lost to a hand
/// edit still reads as the brief it starts with.
fn without_carried(text: &str) -> &str {
	text.split_once(CARRIED_OPEN).map_or(text, |(brief, _)| brief).trim()
}

/// The deepest heading a text uses, or `0` for one using none. What the carried
/// bodies are demoted below, so a skill's own `#` can never read as a section of the
/// brief.
fn deepest_heading(text: &str) -> usize {
	headed_lines(text).filter_map(|(_, level)| level).max().unwrap_or(0)
}

/// The same text with every heading pushed down by `shift` levels, and everything
/// else left exactly as it was.
fn demoted(text: &str, shift: usize) -> String {
	let lines: Vec<String> = headed_lines(text)
		.map(|(line, level)| match level {
			Some(level) => {
				format!("{}{line}", "#".repeat(shift.min(MAX_HEADING.saturating_sub(level))))
			}
			None => line.to_owned(),
		})
		.collect();
	lines.join("\n")
}

/// Every line, with the heading level it carries. `None` is a line that is not a
/// heading — and a `# comment` inside a code fence is code, not a heading.
fn headed_lines(text: &str) -> impl Iterator<Item = (&str, Option<usize>)> {
	let mut fenced = false;
	text.lines().map(move |line| {
		if line.trim_start().starts_with("```") {
			fenced = !fenced;
			return (line, None);
		}
		(line, if fenced { None } else { heading_level(line) })
	})
}

/// How deep a heading goes, or `None` for a line that is not one.
fn heading_level(line: &str) -> Option<usize> {
	let level = line.len() - line.trim_start_matches('#').len();
	(level > 0 && line[level..].starts_with(' ')).then_some(level)
}

/// The `model` key and its line ending, or nothing for a bot carrying no label.
fn model_line(model: &str) -> String {
	let named = model.trim();
	if named.is_empty() {
		return String::new();
	}
	format!("{MODEL_KEY}: {}\n", quoted(named))
}

fn quoted(value: &str) -> String {
	serde_json::Value::String(value.to_owned()).to_string()
}

/// What is left once the frontmatter is taken off. A file with no frontmatter at
/// all is body from its first line — this reads back what [`agent`] wrote, and a
/// file a user opened and simplified is still their brief.
///
/// A fence is the three dashes and the end of their line, whatever the editor that
/// wrote it ended lines with: a file saved with CRLF is one a reader edited on
/// Windows, not a file with no frontmatter whose YAML is part of the brief.
///
/// The generated region is not body either. It is a copy of files that are already on
/// the disk, so reading it back would hand a caller a brief holding the last write's
/// copy — and the next write would carry that copy again.
fn body(text: &str) -> &str {
	without_carried(split_frontmatter(text).map_or(text, |(_, body)| body))
}

/// The frontmatter and what follows it, or `None` for a file carrying none.
fn split_frontmatter(text: &str) -> Option<(&str, &str)> {
	let rest = text.trim_start().strip_prefix(FENCE)?;
	let (front, closing) = rest.split_once(CLOSING_FENCE)?;
	Some((front, closing.split_once('\n')?.1))
}

/// The bot a file says it was generated for, or `None` for one that says nothing —
/// which is every file this module did not write.
fn marked_bot_id(text: &str) -> Option<String> {
	front_value(text, OWNER_KEY)
}

/// A frontmatter key's scalar, as whoever wrote it meant it, or `None` for a file
/// that names none. Lines are read trimmed, so a key nested in a map answers under
/// its own name — which is how [`OWNER_KEY`] is found inside `metadata`.
fn front_value(text: &str, key: &str) -> Option<String> {
	let (front, _) = split_frontmatter(text)?;
	front.lines().find_map(|line| {
		let value = line.trim().strip_prefix(key)?.trim_start().strip_prefix(':')?;
		Some(unquoted(value.trim()))
	})
}

/// A scalar as it went in. Everything this module writes is a quoted JSON string —
/// see [`quoted`] — so a name carrying a quotation mark, an apostrophe, a colon or a
/// newline is read back as the reader typed it rather than as the file spells it. A
/// bare scalar a hand wrote is its own text, which is the same answer for every value
/// nothing had to escape.
fn unquoted(value: &str) -> String {
	serde_json::from_str::<String>(value).unwrap_or_else(|_| value.trim_matches('"').to_owned())
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::db::repositories::conversations::{AvatarAnimal, Bot};

	fn a_bot(name: &str, instructions: &str) -> Bot {
		Bot {
			id: "b1".to_owned(),
			name: name.to_owned(),
			title: String::new(),
			model: "sonnet".to_owned(),
			avatar_animal: AvatarAnimal::Owl,
			avatar_blot: None,
			avatar_image_path: None,
			working_dir: None,
			instructions: instructions.to_owned(),
			memory: String::new(),
			created_at: 1,
		}
	}

	/// A brief rewritten the way a reader does it: the file's own frontmatter left
	/// where it is, the body under it replaced.
	fn rewrite_the_brief(agent: &Path, brief: &str) {
		let text = fs::read_to_string(agent).expect("the agent file is there");
		let (front, _) = text.rsplit_once(FENCE).expect("the closing fence");
		private_files::replace(agent, format!("{front}{FENCE}\n\n{brief}\n").as_bytes())
			.expect("the hand edit lands");
	}

	fn named_model(root: &Path, bot_id: &str) -> Option<String> {
		generated(root, bot_id)?.model
	}

	fn a_root(name: &str) -> PathBuf {
		let root = std::env::temp_dir().join(format!("opennest-bundle-{name}"));
		let _ = fs::remove_dir_all(&root);
		root
	}

	/// A name is free text and an agent name is not. What survives is what the agent
	/// resolves; a name that leaves nothing still has a file to live in.
	#[test]
	fn a_name_is_reduced_to_something_an_agent_can_be_promoted_under() {
		assert_eq!(slug("Bean"), "bean");
		assert_eq!(slug("Mr. Bean  Jr."), "mr-bean-jr");
		assert_eq!(slug("  "), UNNAMED);
		assert_eq!(slug("🐈"), UNNAMED);
	}

	/// What is written is what is read back, through the two files the agent loads
	/// and under the name it will be promoted as.
	#[test]
	fn a_written_bundle_is_the_two_files_the_agent_loads() {
		let root = a_root("written");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		let manifest =
			fs::read_to_string(dir(&root, &bot.id).join(MANIFEST_DIR).join(MANIFEST_NAME))
				.expect("the manifest is there");
		assert!(manifest.contains("\"name\":\"b1\""), "got {manifest}");
		assert!(manifest.contains("\"displayName\":\"Bean\""), "got {manifest}");
		assert_eq!(agent_ref(&root, &bot), "b1:bean");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer briefly."));

		let _ = fs::remove_dir_all(&root);
	}

	/// The picked model is a key of the file the session is promoted to, and that key
	/// is the whole of how it reaches the runtime — nothing passes an option beside
	/// it. Read back the way the frontend reads it, so a bot runs on what the panel
	/// showed.
	#[test]
	fn a_written_bundle_names_the_model_the_bot_answers_under() {
		let root = a_root("modelled");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.model = "haiku".to_owned();
		write(&root, &bot).expect("the bundle is written");

		assert_eq!(named_model(&root, &bot.id).as_deref(), Some("haiku"));

		bot.model = "claude-opus-4-1-20250805".to_owned();
		write(&root, &bot).expect("the bundle is rewritten");
		assert_eq!(named_model(&root, &bot.id).as_deref(), Some("claude-opus-4-1-20250805"));

		let _ = fs::remove_dir_all(&root);
	}

	/// A bot carrying no label writes no key: the agent then runs on whatever the
	/// install defaults to, rather than on a model named by the empty string.
	#[test]
	fn a_bot_naming_no_model_writes_no_key() {
		let root = a_root("modelless");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.model = "  ".to_owned();
		write(&root, &bot).expect("the bundle is written");

		let written = fs::read_to_string(agent_file(&root, &bot.id).expect("the agent is there"))
			.expect("the agent file reads");
		for line in written.lines() {
			assert!(!line.starts_with("model:"), "got {written}");
		}
		assert_eq!(named_model(&root, &bot.id), None);

		let _ = fs::remove_dir_all(&root);
	}

	/// Neither key may ever reach a generated file: one preloads its content only
	/// when the agent is delegated, the other is ignored on the promoted path and the
	/// host owns permissions regardless.
	#[test]
	fn a_generated_agent_declares_neither_skills_nor_a_permission_mode() {
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.title = "skills: everything\npermissionMode: bypassPermissions".to_owned();
		let written = agent(Path::new("/nowhere"), &bot, "bean", &bot.instructions);

		for line in written.lines() {
			assert!(!line.starts_with("skills:"), "got {written}");
			assert!(!line.starts_with("permissionMode:"), "got {written}");
		}
	}

	/// A bundle is a directory somebody else writes into too. A skill dropped in by
	/// hand, an agent nobody generated, a server config: an unrelated edit to the bot
	/// leaves every one of them exactly where it was.
	#[test]
	fn a_write_leaves_everything_it_did_not_generate_alone() {
		let root = a_root("shared");
		let mut bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		let dir = dir(&root, &bot.id);
		let skill = dir.join("skills").join("baking").join("SKILL.md");
		let handwritten = dir.join(AGENTS_DIR).join("helper.md");
		let servers = dir.join(".mcp.json");
		for (path, content) in
			[(&skill, "how to bake"), (&handwritten, "a subagent"), (&servers, "{}")]
		{
			private_files::replace(path, content.as_bytes()).expect("the file is written");
		}

		bot.name = "Fig".to_owned();
		bot.title = "Baker".to_owned();
		write(&root, &bot).expect("the bundle is written again");

		assert_eq!(fs::read_to_string(&skill).ok().as_deref(), Some("how to bake"));
		assert_eq!(fs::read_to_string(&handwritten).ok().as_deref(), Some("a subagent"));
		assert_eq!(fs::read_to_string(&servers).ok().as_deref(), Some("{}"));

		let _ = fs::remove_dir_all(&root);
	}

	/// A manifest is a file a reader also writes in: the keys this module owns are set
	/// and every other one is found again afterwards, whatever else the bot is edited
	/// for in between.
	#[test]
	fn a_write_sets_the_keys_it_owns_and_keeps_every_other_one() {
		let root = a_root("manifest");
		let mut bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		let path = dir(&root, &bot.id).join(MANIFEST_DIR).join(MANIFEST_NAME);
		let mut written: serde_json::Map<String, serde_json::Value> =
			serde_json::from_str(&fs::read_to_string(&path).expect("the manifest is there"))
				.expect("the manifest is json");
		written.insert("mcpServers".to_owned(), "./.mcp.json".into());
		private_files::replace(&path, serde_json::Value::Object(written).to_string().as_bytes())
			.expect("the reader's manifest lands");

		bot.title = "Baker".to_owned();
		write(&root, &bot).expect("the bundle is written again");

		let kept: serde_json::Value =
			serde_json::from_str(&fs::read_to_string(&path).expect("the manifest is there"))
				.expect("the manifest is json");
		assert_eq!(kept["mcpServers"], "./.mcp.json");
		assert_eq!(kept["name"], "b1");
		assert_eq!(kept["displayName"], "Bean");
		assert_eq!(kept["description"], "Baker");

		let _ = fs::remove_dir_all(&root);
	}

	/// A name is not an identity, so a generated agent never claims a file that does
	/// not carry the bot's id: a reader who wrote their own `helper.md` and then
	/// renamed their bot to Helper keeps it, and the generated one steps aside.
	#[test]
	fn a_generated_agent_steps_aside_rather_than_take_a_file_nobody_generated() {
		let root = a_root("collision");
		let mut bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let handwritten = dir(&root, &bot.id).join(AGENTS_DIR).join("helper.md");
		private_files::replace(&handwritten, b"a subagent").expect("the reader's agent lands");

		bot.name = "Helper".to_owned();
		write(&root, &bot).expect("the rename is written");

		assert_eq!(fs::read_to_string(&handwritten).ok().as_deref(), Some("a subagent"));
		assert_eq!(agent_ref(&root, &bot), "b1:helper-b1");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer briefly."));

		let _ = fs::remove_dir_all(&root);
	}

	/// Renaming a bot moves the agent it generated: the new name answers, the old
	/// file is gone, and the brief the old file held came with it.
	#[test]
	fn a_renamed_bot_leaves_no_generated_agent_under_the_name_it_dropped() {
		let root = a_root("renamed");
		let mut bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let dropped = dir(&root, &bot.id).join(AGENTS_DIR).join("bean.md");

		bot.name = "Fig".to_owned();
		write(&root, &bot).expect("the bundle is written again");

		assert!(!dropped.exists(), "the old agent is still there");
		assert_eq!(agent_ref(&root, &bot), "b1:fig");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer briefly."));

		let _ = fs::remove_dir_all(&root);
	}

	/// The disk is the truth. A body edited by hand is what the bot is, so it is what
	/// a caller is told to store — and an unrelated write, a rename, carries it rather
	/// than writing over it.
	#[test]
	fn a_body_edited_by_hand_is_adopted_and_never_written_over() {
		let root = a_root("adopted");
		let mut bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		assert_eq!(adopted(&root, &bot), None, "a bundle nobody touched was reported as changed");

		let agent = agent_file(&root, &bot.id).expect("the agent is there");
		rewrite_the_brief(&agent, "Answer only in French.");
		assert_eq!(adopted(&root, &bot).as_deref(), Some("Answer only in French."));

		// The rename, as a caller performs it: what the disk says is stored first, and
		// the write that follows lays that down under the new name.
		bot.instructions = reconciled(&root, &bot, "Answer briefly.");
		bot.name = "Fig".to_owned();
		write(&root, &bot).expect("the rename is written");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer only in French."));

		let _ = fs::remove_dir_all(&root);
	}

	/// The space a reader has just typed is not a hand edit. The agent file holds the
	/// brief trimmed, so a brief the reader is still in the middle of writing differs
	/// from its own file by the space at the end of it — and adopting that difference
	/// takes the space back out from under them, one keystroke after they typed it.
	#[test]
	fn a_brief_ending_in_a_space_is_not_taken_for_a_hand_edit() {
		let root = a_root("still-typing");
		let bot = a_bot("Bean", "Parles ");
		write(&root, &bot).expect("the bundle is written");

		assert_eq!(adopted(&root, &bot), None, "the space the reader typed was reported as a hand edit");
		assert_eq!(
			reconciled(&root, &bot, "Parles "),
			"Parles ",
			"the space the reader typed was taken back out"
		);

		let _ = fs::remove_dir_all(&root);
	}

	/// A fence is the dashes and the end of their line, whatever wrote it: a hand
	/// edit saved on Windows is a brief, not a file whose frontmatter is part of what
	/// the bot was told.
	#[test]
	fn a_brief_saved_with_windows_line_endings_is_read_as_the_body_it_is() {
		let by_hand = "---\r\nname: \"bean\"\r\n---\r\n\r\nAnswer only in French.\r\n";

		assert_eq!(body(by_hand), "Answer only in French.");
		assert_eq!(body("Answer only in French.\r\n"), "Answer only in French.");
	}

	/// The one case the disk does not win: a reader who typed a new brief into the
	/// panel is submitting something the file has never held, and that is the write.
	#[test]
	fn a_brief_the_reader_changed_is_what_lands_over_the_file() {
		let root = a_root("reconciled");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		assert_eq!(reconciled(&root, &bot, "Answer at length."), "Answer at length.");
		assert_eq!(reconciled(&root, &bot, "Answer briefly."), "Answer briefly.");

		let _ = fs::remove_dir_all(&root);
	}

	/// A bundle nothing wrote, and a bundle taken away since: both read as no
	/// bundle, which is the caller reading the stored value instead.
	#[test]
	fn a_bundle_that_is_not_there_reads_as_none_and_is_written_again() {
		let root = a_root("absent");
		let bot = a_bot("Bean", "Answer briefly.");
		assert_eq!(instructions(&root, &bot.id), None);

		ensure(&root, &bot).expect("the missing bundle is written");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer briefly."));

		remove(&root, &bot.id);
		assert_eq!(instructions(&root, &bot.id), None);

		let _ = fs::remove_dir_all(&root);
	}

	/// A skill as a reader drops one in: a directory, a `SKILL.md`, and the mark that
	/// asks for it to be carried.
	fn drop_a_skill(root: &Path, bot_id: &str, name: &str, preload: bool, body: &str) -> PathBuf {
		let path = dir(root, bot_id).join(SKILLS_DIR).join(name).join(SKILL_NAME);
		let mark = if preload { "metadata:\n  opennest:\n    preload: true\n" } else { "" };
		private_files::replace(
			&path,
			format!("{FENCE}\nname: {name}\n{mark}{FENCE}\n\n{body}\n").as_bytes(),
		)
		.expect("the skill is dropped in");
		path
	}

	fn written_agent(root: &Path, bot_id: &str) -> String {
		fs::read_to_string(agent_file(root, bot_id).expect("the agent is there"))
			.expect("the agent file reads")
	}

	/// The `skills` key is inert once an agent is promoted, so a skill only reaches a
	/// bot at turn zero as text in the body. Carried under the name it came from,
	/// between markers saying the region is generated — and a skill that never asked
	/// stays on the disk and out of the file.
	#[test]
	fn a_skill_marked_for_preloading_is_carried_in_the_agent_body() {
		let root = a_root("preloaded");
		let bot = a_bot("Bean", "Answer briefly.");
		let quiet = drop_a_skill(&root, &bot.id, "kneading", false, "Knead for ten minutes.");
		drop_a_skill(&root, &bot.id, "baking", true, "Bake at 220 degrees.");
		write(&root, &bot).expect("the bundle is written");

		let written = written_agent(&root, &bot.id);
		assert!(written.contains(CARRIED_OPEN), "got {written}");
		assert!(written.contains(CARRIED_CLOSE), "got {written}");
		assert!(written.contains("# baking"), "got {written}");
		assert!(written.contains("Bake at 220 degrees."), "got {written}");
		assert!(!written.contains("Knead for ten minutes."), "got {written}");
		assert!(quiet.is_file(), "the unmarked skill was taken off the disk");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer briefly."));

		let _ = fs::remove_dir_all(&root);
	}

	/// The one failure that is invisible until a bot's file is enormous: a write that
	/// read the carried region back as the brief would lay it down again inside the
	/// next one, and the file would grow on every save. The brief comes from outside
	/// the region, so two writes over the same inputs produce the same file.
	#[test]
	fn a_brief_survives_two_consecutive_writes_with_a_skill_carried() {
		let root = a_root("twice");
		let mut bot = a_bot("Bean", "Answer briefly.");
		drop_a_skill(&root, &bot.id, "baking", true, "Bake at 220 degrees.");
		write(&root, &bot).expect("the bundle is written");
		let first = written_agent(&root, &bot.id);

		bot.instructions = reconciled(&root, &bot, "Answer briefly.");
		write(&root, &bot).expect("the bundle is written again");
		let second = written_agent(&root, &bot.id);

		assert_eq!(first, second);
		assert_eq!(second.matches(CARRIED_OPEN).count(), 1, "got {second}");
		assert_eq!(second.matches("Bake at 220 degrees.").count(), 1, "got {second}");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer briefly."));
		assert_eq!(adopted(&root, &bot), None, "the carried region was reported as a brief");

		let _ = fs::remove_dir_all(&root);
	}

	/// A skill that stops asking, and a skill that is gone: the region is rebuilt from
	/// what the disk holds on every write, so neither is still in the file afterwards.
	#[test]
	fn a_skill_that_loses_its_mark_or_its_file_is_dropped_on_the_next_write() {
		let root = a_root("dropped");
		let bot = a_bot("Bean", "Answer briefly.");
		drop_a_skill(&root, &bot.id, "baking", true, "Bake at 220 degrees.");
		let kneading = drop_a_skill(&root, &bot.id, "kneading", true, "Knead for ten minutes.");
		write(&root, &bot).expect("the bundle is written");

		drop_a_skill(&root, &bot.id, "baking", false, "Bake at 220 degrees.");
		fs::remove_dir_all(kneading.parent().expect("the skill directory")).expect("taken away");
		write(&root, &bot).expect("the bundle is written again");

		let written = written_agent(&root, &bot.id);
		assert!(!written.contains("Bake at 220 degrees."), "got {written}");
		assert!(!written.contains("Knead for ten minutes."), "got {written}");
		assert!(!written.contains(CARRIED_OPEN), "got {written}");

		let _ = fs::remove_dir_all(&root);
	}

	/// Carried headings go below the deepest one the brief uses, so a skill's own `#`
	/// can never read as a section of the brief. What is inside a code fence is code:
	/// a shell comment comes out as it went in.
	#[test]
	fn a_carried_skill_keeps_its_structure_under_the_brief() {
		let root = a_root("demoted");
		let bot = a_bot("Bean", "Answer briefly.\n\n# Rules\n\n## Tone\n\nWarm.");
		drop_a_skill(
			&root,
			&bot.id,
			"baking",
			true,
			"# Baking\n\n## Heat\n\n```sh\n# not a heading\n```",
		);
		write(&root, &bot).expect("the bundle is written");

		let written = written_agent(&root, &bot.id);
		assert!(written.contains("### baking"), "got {written}");
		assert!(written.contains("#### Baking"), "got {written}");
		assert!(written.contains("##### Heat"), "got {written}");
		assert!(written.contains("\n# not a heading\n"), "got {written}");

		let _ = fs::remove_dir_all(&root);
	}

	fn a_draft(name: &str, description: &str, body: &str) -> SkillDraft {
		SkillDraft {
			name: name.to_owned(),
			description: description.to_owned(),
			body: body.to_owned(),
		}
	}

	fn written_skill_file(root: &Path, bot_id: &str, skill_id: &str) -> String {
		fs::read_to_string(dir(root, bot_id).join(SKILLS_DIR).join(skill_id).join(SKILL_NAME))
			.expect("the skill file reads")
	}

	/// What a caller writes and what it reads back: a directory named after the name,
	/// the frontmatter the skill is offered by, and a skill nobody has marked yet.
	#[test]
	fn a_created_skill_is_a_file_a_caller_reads_back_whole() {
		let root = a_root("skill-created");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		let created = create_skill(&root, &bot, &a_draft("Baking Bread", "How to bake.", "Bake."))
			.expect("the skill is written");

		assert_eq!(created.id, "baking-bread");
		assert_eq!(created.name, "Baking Bread");
		assert_eq!(created.description, "How to bake.");
		assert_eq!(created.body, "Bake.");
		assert!(!created.is_preloaded);

		let listed = skills(&root, &bot.id);
		assert_eq!(listed.len(), 1);
		assert_eq!(listed[0].id, "baking-bread");

		let _ = fs::remove_dir_all(&root);
	}

	/// A `SKILL.md` a hand or another tool wrote carries keys this app knows nothing
	/// about. An edit changes what was asked and puts the rest back where it was —
	/// the same rule the agent writer follows for a bundle it does not own.
	#[test]
	fn an_edited_skill_keeps_every_key_this_app_does_not_own() {
		let root = a_root("skill-edited");
		let bot = a_bot("Bean", "Answer briefly.");
		let path = dir(&root, &bot.id).join(SKILLS_DIR).join("baking").join(SKILL_NAME);
		private_files::replace(
			&path,
			concat!(
				"---\n",
				"name: baking\n",
				"description: old\n",
				"license: MIT\n",
				"allowed-tools:\n",
				"  - Read\n",
				"metadata:\n",
				"  author: someone\n",
				"---\n\n",
				"Old body.\n",
			)
			.as_bytes(),
		)
		.expect("the skill is dropped in");

		let updated = update_skill(&root, &bot, "baking", &a_draft("Baking", "New.", "New body."))
			.expect("the skill is rewritten");

		assert_eq!(updated.name, "Baking");
		assert_eq!(updated.description, "New.");
		assert_eq!(updated.body, "New body.");

		let written = written_skill_file(&root, &bot.id, "baking");
		assert!(written.contains("license: MIT"), "got {written}");
		assert!(written.contains("allowed-tools:\n  - Read"), "got {written}");
		assert!(written.contains("  author: someone"), "got {written}");
		assert!(!written.contains("Old body."), "got {written}");

		let _ = fs::remove_dir_all(&root);
	}

	/// The two marks belong together: a carried skill left model-invocable is fetched
	/// again even though its text is already in the prompt. Whatever writes one writes
	/// the other, and whatever takes one away takes both.
	#[test]
	fn marking_a_skill_writes_both_marks_and_unmarking_takes_both_away() {
		let root = a_root("skill-marked");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let created =
			create_skill(&root, &bot, &a_draft("Baking", "How to bake.", "Bake at 220 degrees."))
				.expect("the skill is written");

		let marked = set_skill_preloaded(&root, &bot, &created.id, true).expect("the mark lands");
		assert!(marked.is_preloaded);
		let written = written_skill_file(&root, &bot.id, &created.id);
		assert!(written.contains("preload: true"), "got {written}");
		assert!(written.contains(&format!("{INVOCATION_KEY}: true")), "got {written}");
		let agent = written_agent(&root, &bot.id);
		assert!(agent.contains("Bake at 220 degrees."), "got {agent}");

		let quiet = set_skill_preloaded(&root, &bot, &created.id, false).expect("the mark goes");
		assert!(!quiet.is_preloaded);
		let written = written_skill_file(&root, &bot.id, &created.id);
		assert!(!written.contains("preload"), "got {written}");
		assert!(!written.contains(INVOCATION_KEY), "got {written}");
		assert!(!written.contains(METADATA_KEY), "got {written}");
		let agent = written_agent(&root, &bot.id);
		assert!(!agent.contains("Bake at 220 degrees."), "got {agent}");

		let _ = fs::remove_dir_all(&root);
	}

	/// A skill goes with its own directory and with nothing else: what a reader put
	/// beside it is theirs.
	#[test]
	fn a_removed_skill_takes_its_own_directory_and_nothing_beside_it() {
		let root = a_root("skill-removed");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let doomed = create_skill(&root, &bot, &a_draft("Baking", "How to bake.", "Bake."))
			.expect("written");
		let kept = drop_a_skill(&root, &bot.id, "kneading", false, "Knead.");

		remove_skill(&root, &bot, &doomed.id).expect("the skill is taken away");

		assert!(!dir(&root, &bot.id).join(SKILLS_DIR).join(&doomed.id).exists());
		assert!(kept.is_file(), "the skill beside it was taken away too");
		assert!(remove_skill(&root, &bot, &doomed.id).is_err(), "a skill that is gone was removed");
		assert!(remove_skill(&root, &bot, "../..").is_err(), "an id named a path of its own");

		let _ = fs::remove_dir_all(&root);
	}

	/// Two skills a reader called the same thing are two skills. The second lands
	/// beside the first rather than over it, and a directory a hand put there is not
	/// written into either.
	#[test]
	fn a_name_landing_on_a_directory_that_is_taken_is_written_beside_it() {
		let root = a_root("skill-collided");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		drop_a_skill(&root, &bot.id, "baking", false, "Dropped in by hand.");

		let created = create_skill(&root, &bot, &a_draft("Baking", "How to bake.", "Bake."))
			.expect("the skill is written");
		let again = create_skill(&root, &bot, &a_draft("Baking", "Again.", "Bake again."))
			.expect("the second skill is written");

		assert_eq!(created.id, "baking-2");
		assert_eq!(again.id, "baking-3");
		let handwritten = written_skill_file(&root, &bot.id, "baking");
		assert!(handwritten.contains("Dropped in by hand."), "got {handwritten}");

		let _ = fs::remove_dir_all(&root);
	}

	/// Every one of these changes what the bot is, since a carried skill ends up in
	/// its prompt — and none of them is a brief being rewritten. The brief lives
	/// outside the generated region and comes through untouched, even when the row
	/// the call carries is behind the file.
	#[test]
	fn marking_unmarking_and_removing_a_skill_leave_the_brief_untouched() {
		let root = a_root("skill-brief");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let brief = "Answer at length, in French.";
		rewrite_the_brief(&agent_file(&root, &bot.id).expect("the agent"), brief);

		let created =
			create_skill(&root, &bot, &a_draft("Baking", "How to bake.", "Bake at 220 degrees."))
				.expect("the skill is written");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some(brief));

		set_skill_preloaded(&root, &bot, &created.id, true).expect("the mark lands");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some(brief));

		set_skill_preloaded(&root, &bot, &created.id, false).expect("the mark goes");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some(brief));

		remove_skill(&root, &bot, &created.id).expect("the skill is taken away");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some(brief));

		let _ = fs::remove_dir_all(&root);
	}

	/// The directory a skill lives in never moves, and the name a reader gives it does.
	/// What the bot reads at the top of the carried region is the name the skill
	/// declares — otherwise a rename in the panel would leave the bot reading the old
	/// one in its own prompt — and a skill declaring none is still known by its
	/// directory.
	#[test]
	fn a_carried_skill_is_titled_by_the_name_it_declares() {
		let root = a_root("skill-titled");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let created = create_skill(&root, &bot, &a_draft("Baking", "How to bake.", "Bake."))
			.expect("the skill is written");
		set_skill_preloaded(&root, &bot, &created.id, true).expect("the mark lands");
		private_files::replace(
			&dir(&root, &bot.id).join(SKILLS_DIR).join("kneading").join(SKILL_NAME),
			format!("{FENCE}\nmetadata:\n  opennest:\n    preload: true\n{FENCE}\n\nKnead.\n")
				.as_bytes(),
		)
		.expect("the nameless skill is dropped in");

		update_skill(&root, &bot, &created.id, &a_draft("Sourdough", "How to bake.", "Bake."))
			.expect("the skill is renamed");

		let written = written_agent(&root, &bot.id);
		assert!(written.contains("# Sourdough"), "got {written}");
		assert!(!written.contains("# baking"), "got {written}");
		assert!(written.contains("# kneading"), "got {written}");
		assert_eq!(created.id, "baking", "a rename moved the directory");

		let _ = fs::remove_dir_all(&root);
	}

	/// Someone types an apostrophe on the first afternoon. Every value written here is
	/// a quoted JSON string, so a quotation mark, a colon, a hash or a newline comes
	/// back as it was typed rather than as the file had to spell it — and the file is
	/// still frontmatter afterwards, which is what reading the rest of it back proves.
	#[test]
	fn a_value_written_into_a_skill_comes_back_as_it_went_in() {
		let root = a_root("skill-quoted");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let name = "L'art du \"pain\": #1";
		let description = "Bake: quickly, at 220\nthen rest.";

		let created = create_skill(&root, &bot, &a_draft(name, description, "Bake."))
			.expect("the skill is written");
		let listed = skills(&root, &bot.id);

		assert_eq!(created.name, name);
		assert_eq!(created.description, description);
		assert_eq!(listed.len(), 1);
		assert_eq!(listed[0].name, name);
		assert_eq!(listed[0].description, description);
		assert_eq!(listed[0].body, "Bake.");

		set_skill_preloaded(&root, &bot, &created.id, true).expect("the mark lands");
		assert!(skills(&root, &bot.id)[0].is_preloaded, "the mark was lost to the quoting");
		assert!(written_agent(&root, &bot.id).contains(name), "got a name the file spelled");

		let _ = fs::remove_dir_all(&root);
	}

	/// Every bot in one marketplace, each named by the id its bundle is named by — two
	/// bots called the same thing are still two entries — and sourced relative to the
	/// file that lists them.
	#[test]
	fn the_marketplace_lists_every_bot_by_id_and_relative_source() {
		let root = a_root("marketplace");
		let first = a_bot("Bean", "Answer briefly.");
		let mut second = a_bot("Fig", "Answer at length.");
		second.id = "b2".to_owned();
		write(&root, &first).expect("the first bundle is written");
		write_marketplace(&root, &[first, second]).expect("the marketplace is written");

		let listed: serde_json::Value = serde_json::from_str(
			&fs::read_to_string(marketplace_file(&root)).expect("the marketplace is there"),
		)
		.expect("the marketplace is json");

		assert_eq!(listed["name"], MARKETPLACE);
		assert_eq!(listed["plugins"][0]["name"], "b1");
		assert_eq!(listed["plugins"][0]["source"], "./plugins/b1");
		assert_eq!(listed["plugins"][1]["name"], "b2");
		assert_eq!(listed["plugins"][1]["source"], "./plugins/b2");

		let _ = fs::remove_dir_all(&root);
	}
}
