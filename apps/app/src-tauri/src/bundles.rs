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
//! writes into — a skill dropped in by hand, an executable the next wave puts there
//! — so nothing here removes what it did not put down, and the
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
//!
//! **A server reaches a bot through `.mcp.json`.** The one surface that raises a
//! bot's capability rather than reducing it: a declared server starts a process on
//! the reader's machine at the next launch. This module owns the `mcpServers` map in
//! that file and nothing else in it, and the manifest's pointer at the file is a
//! projection of whether the file is there.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
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

/// Where a bot's MCP servers are declared, and what the manifest points at so they
/// are loaded with the bundle — measured connecting as `plugin:<bot id>:<server>`,
/// see `agent/PLUGINS.md`. This module owns the `mcpServers` map inside that file
/// and nothing else in it.
const MCP_NAME: &str = ".mcp.json";
const SERVERS_KEY: &str = "mcpServers";
const MCP_SOURCE: &str = "./.mcp.json";

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

/// Every other frontmatter key a `SKILL.md` is read and written under. The list is
/// the whole of what this module names: a key outside it is somebody else's, kept
/// exactly where it was found on every write — see [`drafted`].
const WHEN_TO_USE_KEY: &str = "when_to_use";
const ARGUMENT_HINT_KEY: &str = "argument-hint";
const ARGUMENTS_KEY: &str = "arguments";
const USER_INVOCABLE_KEY: &str = "user-invocable";
const ALLOWED_TOOLS_KEY: &str = "allowed-tools";
const DISALLOWED_TOOLS_KEY: &str = "disallowed-tools";
const EFFORT_KEY: &str = "effort";
const CONTEXT_KEY: &str = "context";
const AGENT_KEY: &str = "agent";
const BACKGROUND_KEY: &str = "background";
const HOOKS_KEY: &str = "hooks";
const PATHS_KEY: &str = "paths";
const SHELL_KEY: &str = "shell";
const LICENSE_KEY: &str = "license";
const COMPATIBILITY_KEY: &str = "compatibility";

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
	let generated = generated_agent(root, &bot.id);
	let agent_path = free_agent_path(root, bot, generated.as_deref());
	let name = agent_path.file_stem().unwrap_or_default().to_string_lossy().into_owned();

	rewrite_manifest(root, bot)?;
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
/// See [`edited`] for what counts as a difference at all.
pub fn adopted(root: &Path, bot: &Bot) -> Option<String> {
	instructions(root, &bot.id).filter(|found| edited(found, &bot.instructions))
}

/// Whether a body read off the disk is a brief somebody really wrote, rather than the
/// stored one as the file holds it.
///
/// [`agent`] lays the body down trimmed, so a brief the reader is in the middle of
/// typing differs from its own file by the space at the end of it. Preferring the
/// file there takes that space back out from under them, one answer after they
/// pressed it — which is a brief that can never be given a second word.
pub fn edited(found: &str, stored: &str) -> bool {
	found != stored.trim()
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
fn manifest(path: &Path, bundle: &Path, bot: &Bot) -> String {
	let mut kept = object_at(path);
	kept.insert("name".to_owned(), bot.id.clone().into());
	kept.insert("version".to_owned(), VERSION.into());
	kept.insert("displayName".to_owned(), bot.name.clone().into());
	kept.insert("description".to_owned(), describe(bot).into());
	declare_servers(&mut kept, bundle);
	serde_json::Value::Object(kept).to_string()
}

/// The manifest laid down again over whatever it says now, without touching the
/// agent file. What a server write needs: the declaration is derived from the disk,
/// and nothing about a server is a reason to rewrite a brief.
fn rewrite_manifest(root: &Path, bot: &Bot) -> std::io::Result<()> {
	let bundle = dir(root, &bot.id);
	let path = manifest_file(&bundle);
	private_files::replace(&path, manifest(&path, &bundle, bot).as_bytes())
}

fn manifest_file(bundle: &Path) -> PathBuf {
	bundle.join(MANIFEST_DIR).join(MANIFEST_NAME)
}

/// The manifest's pointer at the bundle's own server file, added while that file is
/// there and the manifest carries no pointer of its own.
///
/// Never taken away here. A value written by hand cannot be told from this module's
/// by looking at it, and a brief being saved is no reason to decide: the one write
/// that knows the file has gone is the one that took it — see
/// [`undeclare_servers`].
fn declare_servers(kept: &mut serde_json::Map<String, serde_json::Value>, bundle: &Path) {
	if bundle.join(MCP_NAME).is_file() && !kept.contains_key(SERVERS_KEY) {
		kept.insert(SERVERS_KEY.to_owned(), MCP_SOURCE.into());
	}
}

/// This module's own pointer taken back out once the file it pointed at has gone. A
/// manifest left aimed at a file that is not there is a bundle that fails to load,
/// and it is the one key this module removes at all.
///
/// Nothing happens while the file is still there, and a value the reader wrote
/// themselves is left exactly where it is — it may be aimed at something this module
/// knows nothing about.
fn undeclare_servers(root: &Path, bot: &Bot) -> std::io::Result<()> {
	let bundle = dir(root, &bot.id);
	if bundle.join(MCP_NAME).is_file() {
		return Ok(());
	}
	let path = manifest_file(&bundle);
	let mut kept = object_at(&path);
	if kept.get(SERVERS_KEY).and_then(serde_json::Value::as_str) != Some(MCP_SOURCE) {
		return Ok(());
	}
	kept.remove(SERVERS_KEY);
	private_files::replace(&path, serde_json::Value::Object(kept).to_string().as_bytes())
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
	pub front: SkillFront,
}

/// What a skill is written from. The mark is not here: it is set on its own, because
/// it changes what the bot is rather than what the skill says.
pub struct SkillDraft {
	pub name: String,
	pub description: String,
	pub body: String,
	pub front: SkillFront,
}

/// Every frontmatter key of a skill past its name and its description, read off the
/// disk and written back under the spelling the agent reads them by.
///
/// `None` is a key the file does not carry, and — on the way in — a key the caller
/// did not offer, which is left exactly as the file has it. An empty value is a key
/// asked to go: a caller clears a field by sending it empty, not by leaving it out,
/// so a panel showing three fields never takes away the seventeen it does not show.
///
/// The four lists are lists here whatever the file spells them as: a `SKILL.md`
/// written by hand carries `allowed-tools: Read, Write` as often as it carries a
/// sequence, and both mean the same two tools.
///
/// `hooks`, `metadata` and `compatibility` are whatever the file says. Their shape is
/// the agent's to define and nothing here narrows it — `metadata` in particular is
/// where this app keeps its own mark, which a write puts back under
/// `metadata.opennest.preload` however the caller spelled the rest.
///
/// This is the type the frontend meets, camelCased and flattened into a skill by
/// [`crate::conversations::contract`] rather than mirrored there: these are the
/// frontmatter's own keys, so there is no second spelling for a mirror to protect.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SkillFront {
	pub when_to_use: Option<String>,
	pub argument_hint: Option<String>,
	pub arguments: Option<Vec<String>>,
	pub disable_model_invocation: Option<bool>,
	pub user_invocable: Option<bool>,
	pub allowed_tools: Option<Vec<String>>,
	pub disallowed_tools: Option<Vec<String>>,
	pub model: Option<String>,
	pub effort: Option<String>,
	pub context: Option<String>,
	pub agent: Option<String>,
	pub background: Option<bool>,
	pub hooks: Option<serde_json::Value>,
	pub paths: Option<Vec<String>>,
	pub shell: Option<String>,
	pub metadata: Option<serde_json::Value>,
	pub license: Option<String>,
	pub compatibility: Option<serde_json::Value>,
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
	written_skill(root, bot, &path, drafted(None, draft)?)
}

/// What the skill says, changed. The file is read and edited rather than written
/// from a template: a `SKILL.md` a hand or another tool wrote carries keys this app
/// knows nothing about, and they are put back exactly as they were found.
///
/// Frontmatter this module cannot read refuses the write and leaves the file exactly
/// as it is — see [`checked_front`].
pub fn update_skill(
	root: &Path,
	bot: &Bot,
	skill_id: &str,
	draft: &SkillDraft,
) -> std::io::Result<Skill> {
	let path = skill_dir(root, &bot.id, skill_id)?;
	let text = fs::read_to_string(path.join(SKILL_NAME)).unwrap_or_default();
	written_skill(root, bot, &path, drafted(Some(&text), draft)?)
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
	written_skill(root, bot, &path, marked(&text, is_preloaded)?)
}

/// The skill, taken away whole: its own directory and nothing outside it. The path
/// is resolved by scanning the bot's own skills rather than joined from the id, so
/// an id naming anything else names no skill at all.
pub fn remove_skill(root: &Path, bot: &Bot, skill_id: &str) -> std::io::Result<()> {
	let path = skill_dir(root, &bot.id, skill_id)?;
	fs::remove_dir_all(path)?;
	rewrite_agent(root, bot)
}

/// An MCP server the bot's bundle declares. `name` is the key it is declared under,
/// which is the one name two of a bundle's servers cannot share and what it connects
/// as — `plugin:<bot id>:<name>`. `config` is what the file says, verbatim: a command
/// to run, its arguments and its environment, or whatever else a transport asks for.
pub struct McpServer {
	pub name: String,
	pub config: serde_json::Value,
}

/// Every server the bot's bundle declares, by name. A `.mcp.json` a hand or another
/// tool wrote is read the same way, and a bundle carrying none — which is every
/// bundle until something writes one — declares none.
pub fn mcp_servers(root: &Path, bot_id: &str) -> Vec<McpServer> {
	declared(&mcp_file(root, bot_id))
		.into_iter()
		.map(|(name, config)| McpServer { name, config })
		.collect()
}

/// The server written under the name given, added or replaced. Every other server in
/// the file stays exactly as it was, and so does every key of the file this module
/// does not own: it is read and edited, never written from a template.
///
/// A configuration that is not a JSON object is refused before anything is written.
/// The refusal says what was wrong with the shape and never what was offered — a
/// configuration is a command to run and an environment that often holds a token,
/// and neither belongs in a message that travels.
///
/// The answer is the write rather than a read back off the disk, unlike
/// [`written_skill`]: a skill goes into frontmatter this module has to spell and read
/// again, and a configuration goes into the file as the JSON value it already is.
pub fn set_mcp_server(
	root: &Path,
	bot: &Bot,
	name: &str,
	config: &serde_json::Value,
) -> std::io::Result<McpServer> {
	if !config.is_object() {
		return Err(std::io::Error::new(
			std::io::ErrorKind::InvalidInput,
			"a server configuration must be a JSON object",
		));
	}
	let path = mcp_file(root, &bot.id);
	let mut servers = declared(&path);
	servers.insert(name.to_owned(), config.clone());
	write_servers(&path, servers)?;
	rewrite_manifest(root, bot)?;
	Ok(McpServer { name: name.to_owned(), config: config.clone() })
}

/// The server taken out of the file, and the rest of it left as it was. A name the
/// bundle does not declare is `NotFound`, which is also what a caller holding a list
/// one gesture out of date gets.
pub fn remove_mcp_server(root: &Path, bot: &Bot, name: &str) -> std::io::Result<()> {
	let path = mcp_file(root, &bot.id);
	let mut servers = declared(&path);
	if servers.remove(name).is_none() {
		return Err(std::io::Error::new(std::io::ErrorKind::NotFound, "no such server"));
	}
	write_servers(&path, servers)?;
	rewrite_manifest(root, bot)?;
	undeclare_servers(root, bot)
}

/// The file with its `mcpServers` map replaced and every other key put back where it
/// was found. The last server going takes the file with it, so a bundle declaring
/// nothing is a bundle with no server file rather than one holding an empty map —
/// unless the file carries keys of somebody else's, which are not this module's to
/// take away with its own.
fn write_servers(
	path: &Path,
	servers: serde_json::Map<String, serde_json::Value>,
) -> std::io::Result<()> {
	let mut kept = object_at(path);
	if servers.is_empty() {
		kept.remove(SERVERS_KEY);
		if kept.is_empty() {
			return match fs::remove_file(path) {
				Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(error),
				_ => Ok(()),
			};
		}
	} else {
		kept.insert(SERVERS_KEY.to_owned(), serde_json::Value::Object(servers));
	}
	private_files::replace(path, serde_json::Value::Object(kept).to_string().as_bytes())
}

fn mcp_file(root: &Path, bot_id: &str) -> PathBuf {
	dir(root, bot_id).join(MCP_NAME)
}

/// What a server file declares, as something to edit. Sorted by name, because the
/// map is one: two reads over one disk answer in one order, and two writes leave one
/// file.
fn declared(path: &Path) -> serde_json::Map<String, serde_json::Value> {
	match object_at(path).remove(SERVERS_KEY) {
		Some(serde_json::Value::Object(servers)) => servers,
		_ => serde_json::Map::new(),
	}
}

/// A JSON object off the disk. A file that is not there, is not JSON, or is JSON that
/// is not an object reads as an empty one — which is a file with nothing of anyone's
/// to keep.
fn object_at(path: &Path) -> serde_json::Map<String, serde_json::Value> {
	fs::read_to_string(path)
		.ok()
		.and_then(|text| serde_json::from_str(&text).ok())
		.unwrap_or_default()
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
		front: read_front(&text),
		id,
	})
}

/// Every key of [`SkillFront`] the file carries. Frontmatter this module cannot read
/// answers as a skill carrying none rather than as no skill at all: a listing is not
/// where a reader should first hear that a file is malformed, and a write over the
/// same file refuses — see [`checked_front`].
fn read_front(text: &str) -> SkillFront {
	let map = mapped_lines(split_frontmatter(text).map_or("", |(front, _)| front));
	let text_at = |key: &str| map.get(key).map(as_text);
	let list_at = |key: &str| map.get(key).map(as_list);
	let flag_at = |key: &str| map.get(key).and_then(as_flag);
	SkillFront {
		when_to_use: text_at(WHEN_TO_USE_KEY),
		argument_hint: text_at(ARGUMENT_HINT_KEY),
		arguments: list_at(ARGUMENTS_KEY),
		disable_model_invocation: flag_at(INVOCATION_KEY),
		user_invocable: flag_at(USER_INVOCABLE_KEY),
		allowed_tools: list_at(ALLOWED_TOOLS_KEY),
		disallowed_tools: list_at(DISALLOWED_TOOLS_KEY),
		model: text_at(MODEL_KEY),
		effort: text_at(EFFORT_KEY),
		context: text_at(CONTEXT_KEY),
		agent: text_at(AGENT_KEY),
		background: flag_at(BACKGROUND_KEY),
		hooks: map.get(HOOKS_KEY).cloned(),
		paths: list_at(PATHS_KEY),
		shell: text_at(SHELL_KEY),
		metadata: map.get(METADATA_KEY).cloned(),
		license: text_at(LICENSE_KEY),
		compatibility: map.get(COMPATIBILITY_KEY).cloned(),
	}
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

/// The file a draft leaves: the keys the draft carries set, the body replaced, and
/// every other key of a file that was already there left exactly where it was.
///
/// The name and the description are written on every save, empty or not — the two
/// keys the format asks a skill for are the file's shape rather than fields a reader
/// may leave out. Every other key is written only when the draft offers it, taken
/// away when the draft offers it empty, and never touched otherwise.
fn drafted(existing: Option<&str>, draft: &SkillDraft) -> std::io::Result<String> {
	let existing = existing.unwrap_or_default();
	let mut parts = checked_front(existing)?;
	parts.front = with_key(&parts.front, &[NAME_KEY], &quoted(&draft.name));
	parts.front = with_key(&parts.front, &[DESCRIPTION_KEY], &quoted(&draft.description));
	for (key, value) in offered(&draft.front, existing) {
		parts.front = written_front(&parts.front, key, value.as_ref());
	}
	parts.body = format!("\n{}\n", draft.body.trim());
	Ok(rendered(&parts))
}

/// What a draft asks of the frontmatter, key by key: the value it offered, or nothing
/// at all for a key it left out. `metadata` is the one value the caller does not have
/// the last word on — the mark the file carries goes back into it, since whether a
/// bot carries the skill is not a field of the skill.
fn offered(front: &SkillFront, existing: &str) -> Vec<(&'static str, Option<serde_json::Value>)> {
	let text = |value: &Option<String>| value.clone().map(serde_json::Value::from);
	let list = |value: &Option<Vec<String>>| value.clone().map(serde_json::Value::from);
	let flag = |value: &Option<bool>| (*value).map(serde_json::Value::from);
	vec![
		(WHEN_TO_USE_KEY, text(&front.when_to_use)),
		(ARGUMENT_HINT_KEY, text(&front.argument_hint)),
		(ARGUMENTS_KEY, list(&front.arguments)),
		(INVOCATION_KEY, flag(&front.disable_model_invocation)),
		(USER_INVOCABLE_KEY, flag(&front.user_invocable)),
		(ALLOWED_TOOLS_KEY, list(&front.allowed_tools)),
		(DISALLOWED_TOOLS_KEY, list(&front.disallowed_tools)),
		(MODEL_KEY, text(&front.model)),
		(EFFORT_KEY, text(&front.effort)),
		(CONTEXT_KEY, text(&front.context)),
		(AGENT_KEY, text(&front.agent)),
		(BACKGROUND_KEY, flag(&front.background)),
		(HOOKS_KEY, front.hooks.clone()),
		(PATHS_KEY, list(&front.paths)),
		(SHELL_KEY, text(&front.shell)),
		(METADATA_KEY, front.metadata.clone().map(|held| remarked(held, existing))),
		(LICENSE_KEY, text(&front.license)),
		(COMPATIBILITY_KEY, front.compatibility.clone()),
	]
}

/// The metadata a caller offered, with the mark the file already carries put back
/// under `metadata.opennest.preload`. A caller rewriting the map has no way to know
/// what the bot was told, and a mark lost this way is a body silently dropped out of
/// a prompt on the next write.
fn remarked(offered: serde_json::Value, existing: &str) -> serde_json::Value {
	let Some(mark) = front_value(existing, PRELOAD_KEY) else {
		return offered;
	};
	let mut map = match offered {
		serde_json::Value::Object(map) => map,
		_ => serde_json::Map::new(),
	};
	let mut nest = match map.remove(OPENNEST_KEY) {
		Some(serde_json::Value::Object(nest)) => nest,
		_ => serde_json::Map::new(),
	};
	nest.insert(PRELOAD_KEY.to_owned(), mark.into());
	map.insert(OPENNEST_KEY.to_owned(), serde_json::Value::Object(nest));
	serde_json::Value::Object(map)
}

/// The same file with both marks written, or with both taken away. The body is not
/// touched — this is a key changing, not a skill being rewritten.
fn marked(text: &str, is_preloaded: bool) -> std::io::Result<String> {
	let path = [METADATA_KEY, OPENNEST_KEY, PRELOAD_KEY];
	let mut parts = checked_front(text)?;
	parts.front = if is_preloaded {
		with_key(&with_key(&parts.front, &path, MARKED), &[INVOCATION_KEY], MARKED)
	} else {
		without_key(&without_key(&parts.front, &path), &[INVOCATION_KEY])
	};
	Ok(rendered(&parts))
}

/// The file split, and refused when its frontmatter is not something this module can
/// read: an opening fence nothing closes, or a line at the top of the map that names
/// no key. Either would be rewritten into something else, so nothing is written at
/// all and the caller is told — a `SKILL.md` a reader is in the middle of editing by
/// hand is theirs, not this app's to flatten.
fn checked_front(text: &str) -> std::io::Result<Parts> {
	let unreadable = |detail: &str| {
		std::io::Error::new(std::io::ErrorKind::InvalidData, format!("the frontmatter {detail}"))
	};
	if !text.trim().is_empty()
		&& text.trim_start().starts_with(FENCE)
		&& split_frontmatter(text).is_none()
	{
		return Err(unreadable("opens with a fence that nothing closes"));
	}
	let parts = parts(text);
	match parts.front.lines().find(|line| !readable(line)) {
		Some(line) => Err(unreadable(&format!("carries a line naming no key: {}", line.trim()))),
		None => Ok(parts),
	}
}

/// Whether a frontmatter line is one this module can put back where it found it: a
/// blank, a comment, anything nested under a key, or a key of its own. A top-level
/// line that is none of those is a file spelled some other way.
fn readable(line: &str) -> bool {
	let trimmed = line.trim();
	trimmed.is_empty() || trimmed.starts_with('#') || indent_of(line) > 0 || keyed(trimmed)
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
	let leaf = path.last().copied().unwrap_or_default();
	with_block(front, path, vec![format!("{leaf}: {value}")])
}

/// The same, for a key worth more than one line: `written` is the key's whole block
/// spelled at the left margin, and it lands wherever on the path the key belongs.
fn with_block(front: &str, path: &[&str], written: Vec<String>) -> String {
	let mut lines: Vec<String> = front.lines().map(str::to_owned).collect();
	let mut from = 0;
	let mut until = lines.len();
	let mut indent = 0;
	for (depth, key) in path.iter().enumerate() {
		let Some(at) = key_line(&lines, from, until, indent, key) else {
			let grown = branch(&path[depth..], indent, written);
			lines.splice(until..until, grown);
			return lines.join("\n");
		};
		if depth + 1 == path.len() {
			let end = block_end(&lines, at);
			lines.splice(at..end, indented(written, indent));
			return lines.join("\n");
		}
		from = at + 1;
		until = block_end(&lines, at);
		indent = child_indent(&lines, from, until).unwrap_or(indent + INDENT);
	}
	lines.join("\n")
}

/// Frontmatter with one top-level key written whole, or taken away when what it was
/// offered is empty. A value the caller did not offer at all leaves the file alone,
/// down to the spelling: a key nobody edited is a key nobody rewrote.
///
/// The value goes in as block YAML rather than as one flow line, because that is the
/// shape the rest of this module reads a file back in — see [`front_value`], which
/// finds the mark by the line it sits on.
fn written_front(front: &str, key: &str, value: Option<&serde_json::Value>) -> String {
	match value {
		None => front.to_owned(),
		Some(value) if is_blank(value) => without_key(front, &[key]),
		Some(value) => with_block(front, &[key], yaml_lines(key, value, 0)),
	}
}

/// Whether a value asks for its key to go: nothing, the empty word, the empty list
/// and the empty map all mean a field a reader left empty.
fn is_blank(value: &serde_json::Value) -> bool {
	match value {
		serde_json::Value::Null => true,
		serde_json::Value::String(text) => text.is_empty(),
		serde_json::Value::Array(items) => items.is_empty(),
		serde_json::Value::Object(map) => map.is_empty(),
		_ => false,
	}
}

/// A value written out as YAML under its key. Scalars sit on the key's own line and
/// everything else is nested under it, so a file this module writes reads the way a
/// file a hand wrote does.
fn yaml_lines(key: &str, value: &serde_json::Value, indent: usize) -> Vec<String> {
	let pad = " ".repeat(indent);
	match value {
		serde_json::Value::Array(items) => {
			let mut lines = vec![format!("{pad}{key}:")];
			lines.extend(items.iter().flat_map(|item| item_lines(item, indent + INDENT)));
			lines
		}
		serde_json::Value::Object(map) => {
			let mut lines = vec![format!("{pad}{key}:")];
			lines.extend(
				map.iter().flat_map(|(nested, held)| yaml_lines(nested, held, indent + INDENT)),
			);
			lines
		}
		scalar => vec![format!("{pad}{key}: {}", written_scalar(scalar))],
	}
}

/// One item of a sequence. A map under a dash keeps its first key on the dash's own
/// line, which is how YAML spells it and how [`sequenced`] reads it back.
fn item_lines(item: &serde_json::Value, indent: usize) -> Vec<String> {
	let pad = " ".repeat(indent);
	match item {
		serde_json::Value::Object(map) if !map.is_empty() => {
			let mut lines: Vec<String> =
				map.iter().flat_map(|(key, held)| yaml_lines(key, held, indent + INDENT)).collect();
			lines[0] = format!("{pad}- {}", lines[0].trim_start());
			lines
		}
		serde_json::Value::Array(items) => {
			let mut lines = vec![format!("{pad}-")];
			lines.extend(items.iter().flat_map(|held| item_lines(held, indent + INDENT)));
			lines
		}
		scalar => vec![format!("{pad}- {}", written_scalar(scalar))],
	}
}

/// A scalar as the file spells it. Text is quoted whatever it says — a colon, a hash
/// or a newline in a description would otherwise make the file mean something else —
/// and a flag, a number and nothing keep the words YAML reads them by.
fn written_scalar(value: &serde_json::Value) -> String {
	match value {
		serde_json::Value::String(text) => quoted(text),
		serde_json::Value::Null => "null".to_owned(),
		other => other.to_string(),
	}
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

/// A path written out as nested lines, the deepest of them carrying the block.
fn branch(path: &[&str], indent: usize, written: Vec<String>) -> Vec<String> {
	let depth = path.len().saturating_sub(1);
	let mut grown: Vec<String> = path[..depth]
		.iter()
		.enumerate()
		.map(|(step, key)| format!("{}{key}:", " ".repeat(indent + step * INDENT)))
		.collect();
	grown.extend(indented(written, indent + depth * INDENT));
	grown
}

/// The same lines, moved in by one map's worth of depth.
fn indented(lines: Vec<String>, indent: usize) -> Vec<String> {
	let pad = " ".repeat(indent);
	lines.into_iter().map(|line| format!("{pad}{line}")).collect()
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

/// The whole of a frontmatter as values, by key. Every map this module writes it
/// reads back, and a `SKILL.md` a hand wrote reads the same way: nested maps,
/// sequences, flow lists and folded text all answer as what they say.
fn mapped_lines(front: &str) -> serde_json::Map<String, serde_json::Value> {
	let lines: Vec<String> = front.lines().map(str::to_owned).collect();
	let end = lines.len();
	mapped(&lines, 0, end)
}

/// One map, from its first line to the end of its block. Lines nested deeper belong
/// to the key above them, and a line naming no key at this depth is skipped rather
/// than guessed at — a write over that file is refused elsewhere, see
/// [`checked_front`].
fn mapped(
	lines: &[String],
	from: usize,
	until: usize,
) -> serde_json::Map<String, serde_json::Value> {
	let until = until.min(lines.len());
	let indent = child_indent(lines, from, until).unwrap_or(0);
	let mut map = serde_json::Map::new();
	let mut index = from;
	while index < until {
		let line = &lines[index];
		let trimmed = line.trim();
		if trimmed.is_empty() || indent_of(line) != indent || !keyed(trimmed) {
			index += 1;
			continue;
		}
		let end = block_end(lines, index);
		let (key, inline) = trimmed.split_once(':').unwrap_or((trimmed, ""));
		map.insert(key.trim().to_owned(), valued(inline.trim(), lines, index + 1, end));
		index = end;
	}
	map
}

/// One sequence. An item carrying a key of its own is the map that starts on the
/// dash's line — `- matcher: Bash` and everything indented under it — which is how a
/// hooks block is spelled.
fn sequenced(lines: &[String], from: usize, until: usize) -> Vec<serde_json::Value> {
	let until = until.min(lines.len());
	let indent = child_indent(lines, from, until).unwrap_or(0);
	let mut items = Vec::new();
	let mut index = from;
	while index < until {
		let line = &lines[index];
		let trimmed = line.trim();
		if trimmed.is_empty() || indent_of(line) != indent || !trimmed.starts_with('-') {
			index += 1;
			continue;
		}
		let inline = trimmed[1..].trim();
		let end = block_end(lines, index);
		if keyed(inline) {
			let mut held: Vec<String> = lines[index..end].to_vec();
			held[0] = held[0].replacen('-', " ", 1);
			let length = held.len();
			items.push(serde_json::Value::Object(mapped(&held, 0, length)));
		} else {
			items.push(valued(inline, lines, index + 1, end));
		}
		index = end;
	}
	items
}

/// What a key or a sequence item is worth: what sits on its own line, or the block
/// nested under it. A key with neither is nothing at all.
fn valued(inline: &str, lines: &[String], from: usize, until: usize) -> serde_json::Value {
	if matches!(inline, "|" | "|-" | "|+" | ">" | ">-" | ">+") {
		return serde_json::Value::String(folded(lines, from, until, inline.starts_with('>')));
	}
	if !inline.is_empty() && !inline.starts_with('#') {
		return scalar(inline);
	}
	if from >= until.min(lines.len()) {
		return serde_json::Value::Null;
	}
	if is_sequence(lines, from, until) {
		serde_json::Value::Array(sequenced(lines, from, until))
	} else {
		serde_json::Value::Object(mapped(lines, from, until))
	}
}

/// The text under a `|` or a `>`, dedented by however far its first line sits in. A
/// folded block joins its lines with spaces and a literal one keeps the newlines,
/// which is the difference the two marks name.
fn folded(lines: &[String], from: usize, until: usize, is_folded: bool) -> String {
	let until = until.min(lines.len());
	let indent = child_indent(lines, from, until).unwrap_or(0);
	let held: Vec<&str> = lines[from.min(until)..until]
		.iter()
		.map(|line| if line.len() > indent { &line[indent..] } else { line.trim() })
		.collect();
	held.join(if is_folded { " " } else { "\n" }).trim().to_owned()
}

/// Whether a block is a sequence rather than a map: its first line carries a dash and
/// nothing else claims it.
fn is_sequence(lines: &[String], from: usize, until: usize) -> bool {
	lines[from.min(lines.len())..until.min(lines.len())]
		.iter()
		.find(|line| !line.trim().is_empty())
		.is_some_and(|line| {
			let trimmed = line.trim();
			trimmed == "-" || trimmed.starts_with("- ")
		})
}

/// Whether a line names a key. A colon ends the key or is followed by a space, so a
/// URL and a quoted sentence carrying one are values rather than maps.
fn keyed(text: &str) -> bool {
	if text.starts_with('"') || text.starts_with('\'') || text.starts_with('-') {
		return false;
	}
	text.ends_with(':') || text.split_once(": ").is_some()
}

/// One scalar as the file means it: a flag, a number, nothing, or text — quoted
/// either way round, or bare, in which case it is its own words.
fn scalar(text: &str) -> serde_json::Value {
	if let Some(held) = text.strip_prefix('\'').and_then(|rest| rest.strip_suffix('\'')) {
		return serde_json::Value::String(held.replace("''", "'"));
	}
	serde_json::from_str(text).unwrap_or_else(|_| serde_json::Value::String(unquoted(text)))
}

/// A value as text. Anything that is not text answers as the file spells it, so a
/// `model: 4` reads back as `4` rather than as nothing.
fn as_text(value: &serde_json::Value) -> String {
	match value {
		serde_json::Value::String(text) => text.clone(),
		serde_json::Value::Null => String::new(),
		other => other.to_string(),
	}
}

/// A value as a list. A sequence is one already; a single word is a list of one; and
/// a line a hand wrote as `Read, Write` or as `Read Write` is the two tools it names
/// — commas first, since a tool may be spelled `Bash(git status:*)`.
fn as_list(value: &serde_json::Value) -> Vec<String> {
	match value {
		serde_json::Value::Array(items) => items.iter().map(as_text).collect(),
		serde_json::Value::Null => Vec::new(),
		other => split_list(&as_text(other)),
	}
}

fn split_list(text: &str) -> Vec<String> {
	let held = text.trim().trim_start_matches('[').trim_end_matches(']');
	let pieces: Vec<&str> = if held.contains(',') {
		held.split(',').collect()
	} else {
		held.split_whitespace().collect()
	};
	pieces
		.into_iter()
		.map(|piece| unquoted(piece.trim()))
		.filter(|piece| !piece.is_empty())
		.collect()
}

/// A value as a flag. A file saying anything but yes or no says nothing this module
/// can carry as one, and answers as a key the skill does not hold.
fn as_flag(value: &serde_json::Value) -> Option<bool> {
	match value {
		serde_json::Value::Bool(flag) => Some(*flag),
		serde_json::Value::String(text) => match text.as_str() {
			"true" | "yes" => Some(true),
			"false" | "no" => Some(false),
			_ => None,
		},
		_ => None,
	}
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

		assert_eq!(
			adopted(&root, &bot),
			None,
			"the space the reader typed was reported as a hand edit"
		);
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

	/// A draft offering nothing past the three values a panel has always sent, which
	/// is also what every key the draft leaves out is written from: nothing at all.
	fn a_draft(name: &str, description: &str, body: &str) -> SkillDraft {
		SkillDraft {
			name: name.to_owned(),
			description: description.to_owned(),
			body: body.to_owned(),
			front: SkillFront::default(),
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

	/// A `SKILL.md` a hand wrote spells the same key half a dozen ways: a list as a
	/// sequence, as a comma-separated line or as words on one; a paragraph folded
	/// under a bar; a map nested under a map. Every one of them is one value here,
	/// and a panel binding a field to a key never has to know which way the file
	/// happened to say it.
	#[test]
	fn every_frontmatter_key_a_skill_carries_is_read_back_whatever_the_file_spells() {
		let root = a_root("skill-front-read");
		let bot = a_bot("Bean", "Answer briefly.");
		let path = dir(&root, &bot.id).join(SKILLS_DIR).join("baking").join(SKILL_NAME);
		private_files::replace(
			&path,
			concat!(
				"---\n",
				"name: baking\n",
				"description: How to bake.\n",
				"when_to_use: |\n",
				"  When the loaf is flat.\n",
				"  And when it is not.\n",
				"argument-hint: \"[loaf]\"\n",
				"arguments:\n",
				"  - flour\n",
				"  - water\n",
				"disable-model-invocation: true\n",
				"user-invocable: false\n",
				"allowed-tools: Read, Bash(git status:*)\n",
				"disallowed-tools: WebFetch WebSearch\n",
				"model: sonnet\n",
				"effort: high\n",
				"context: fresh\n",
				"agent: baker\n",
				"background: true\n",
				"hooks:\n",
				"  PreToolUse:\n",
				"    - matcher: Bash\n",
				"      command: echo\n",
				"paths:\n",
				"  - src\n",
				"shell: /bin/zsh\n",
				"metadata:\n",
				"  author: someone\n",
				"  opennest:\n",
				"    preload: true\n",
				"license: MIT\n",
				"compatibility:\n",
				"  claude-code: \">=2.0.0\"\n",
				"---\n\n",
				"Bake.\n",
			)
			.as_bytes(),
		)
		.expect("the skill is dropped in");

		let read = read_skill(path.parent().expect("the skill directory")).expect("it reads");
		let front = read.front;

		assert_eq!(read.body, "Bake.");
		assert!(read.is_preloaded);
		assert_eq!(
			front.when_to_use.as_deref(),
			Some("When the loaf is flat.\nAnd when it is not.")
		);
		assert_eq!(front.argument_hint.as_deref(), Some("[loaf]"));
		assert_eq!(front.arguments, Some(vec!["flour".to_owned(), "water".to_owned()]));
		assert_eq!(front.disable_model_invocation, Some(true));
		assert_eq!(front.user_invocable, Some(false));
		assert_eq!(
			front.allowed_tools,
			Some(vec!["Read".to_owned(), "Bash(git status:*)".to_owned()])
		);
		assert_eq!(
			front.disallowed_tools,
			Some(vec!["WebFetch".to_owned(), "WebSearch".to_owned()])
		);
		assert_eq!(front.model.as_deref(), Some("sonnet"));
		assert_eq!(front.effort.as_deref(), Some("high"));
		assert_eq!(front.context.as_deref(), Some("fresh"));
		assert_eq!(front.agent.as_deref(), Some("baker"));
		assert_eq!(front.background, Some(true));
		assert_eq!(
			front.hooks,
			Some(serde_json::json!({ "PreToolUse": [{ "matcher": "Bash", "command": "echo" }] }))
		);
		assert_eq!(front.paths, Some(vec!["src".to_owned()]));
		assert_eq!(front.shell.as_deref(), Some("/bin/zsh"));
		assert_eq!(
			front.metadata,
			Some(serde_json::json!({ "author": "someone", "opennest": { "preload": true } }))
		);
		assert_eq!(front.license.as_deref(), Some("MIT"));
		assert_eq!(front.compatibility, Some(serde_json::json!({ "claude-code": ">=2.0.0" })));

		let _ = fs::remove_dir_all(&root);
	}

	/// What a draft asks for and what it does not. A key it offers is written, a key
	/// it offers empty goes, a key it says nothing about is left exactly as the file
	/// has it — and a key this app has never heard of is not its business either way.
	#[test]
	fn a_draft_writes_what_it_offers_and_leaves_alone_what_it_does_not() {
		let root = a_root("skill-front-write");
		let bot = a_bot("Bean", "Answer briefly.");
		let path = dir(&root, &bot.id).join(SKILLS_DIR).join("baking").join(SKILL_NAME);
		private_files::replace(
			&path,
			concat!(
				"---\n",
				"name: baking\n",
				"description: old\n",
				"license: MIT\n",
				"effort: high\n",
				"homegrown: kept\n",
				"allowed-tools:\n",
				"  - Read\n",
				"---\n\n",
				"Old body.\n",
			)
			.as_bytes(),
		)
		.expect("the skill is dropped in");

		let draft = SkillDraft {
			front: SkillFront {
				allowed_tools: Some(vec!["Read".to_owned(), "Write".to_owned()]),
				model: Some("opus".to_owned()),
				user_invocable: Some(false),
				license: Some(String::new()),
				..SkillFront::default()
			},
			..a_draft("Baking", "New.", "New body.")
		};
		let updated = update_skill(&root, &bot, "baking", &draft).expect("the skill is rewritten");

		assert_eq!(updated.front.allowed_tools, Some(vec!["Read".to_owned(), "Write".to_owned()]));
		assert_eq!(updated.front.model.as_deref(), Some("opus"));
		assert_eq!(updated.front.user_invocable, Some(false));
		assert_eq!(updated.front.license, None);
		assert_eq!(updated.front.effort.as_deref(), Some("high"), "a key nobody offered moved");

		let written = written_skill_file(&root, &bot.id, "baking");
		assert!(written.contains("allowed-tools:\n  - \"Read\"\n  - \"Write\""), "got {written}");
		assert!(written.contains("model: \"opus\""), "got {written}");
		assert!(written.contains("user-invocable: false"), "got {written}");
		assert!(!written.contains("license"), "got {written}");
		assert!(written.contains("homegrown: kept"), "got {written}");

		let _ = fs::remove_dir_all(&root);
	}

	/// `metadata` is a reader's map to write and this app keeps its own mark inside
	/// it. A caller rewriting the map has no way to know what the bot was told, so the
	/// mark goes back where it was — losing it would drop the body out of the prompt
	/// on the next write, silently.
	#[test]
	fn metadata_a_caller_writes_keeps_the_mark_the_bot_carries() {
		let root = a_root("skill-metadata");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let created = create_skill(&root, &bot, &a_draft("Baking", "How.", "Bake at 220 degrees."))
			.expect("the skill is written");
		set_skill_preloaded(&root, &bot, &created.id, true).expect("the mark lands");

		let draft = SkillDraft {
			front: SkillFront {
				metadata: Some(serde_json::json!({ "author": "someone" })),
				..SkillFront::default()
			},
			..a_draft("Baking", "How.", "Bake at 220 degrees.")
		};
		let updated =
			update_skill(&root, &bot, &created.id, &draft).expect("the skill is rewritten");

		assert!(updated.is_preloaded, "the mark went with the map that carried it");
		assert_eq!(
			updated.front.metadata,
			Some(serde_json::json!({ "author": "someone", "opennest": { "preload": "true" } }))
		);
		let agent = written_agent(&root, &bot.id);
		assert!(agent.contains("Bake at 220 degrees."), "got {agent}");

		let _ = fs::remove_dir_all(&root);
	}

	/// A `SKILL.md` this module cannot read is not one it may rewrite: a fence nothing
	/// closes and a line naming no key would both come back as something else. Nothing
	/// is written, the caller is told, and the file is left for the hand that is in
	/// the middle of it.
	#[test]
	fn frontmatter_this_app_cannot_read_refuses_the_write_and_leaves_the_file() {
		let root = a_root("skill-unreadable");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let unclosed = "---\nname: baking\nstill typing\n";
		let strange = "---\nname: kneading\njust some prose\n---\n\nKnead.\n";
		for (id, text) in [("baking", unclosed), ("kneading", strange)] {
			let path = dir(&root, &bot.id).join(SKILLS_DIR).join(id).join(SKILL_NAME);
			private_files::replace(&path, text.as_bytes()).expect("the skill is dropped in");

			let refused = update_skill(&root, &bot, id, &a_draft("Baking", "New.", "New body."));

			assert!(refused.is_err(), "{id} was rewritten");
			assert_eq!(written_skill_file(&root, &bot.id, id), text, "{id} was touched");
			assert!(
				set_skill_preloaded(&root, &bot, id, true).is_err(),
				"{id} took a mark it could not carry"
			);
			assert_eq!(
				written_skill_file(&root, &bot.id, id),
				text,
				"{id} was touched by the mark"
			);
		}

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
