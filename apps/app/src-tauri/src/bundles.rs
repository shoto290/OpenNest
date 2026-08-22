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
//!     skills/<name>/SKILL.md          what the bot remembered, one directory each
//! ```
//!
//! What the host owns is not in there: the `learn` rules every bot writes its memory
//! under are one plugin of the app's own, loaded beside the bot's for the same
//! session — see [`system`].
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
//! **A bot is told where its own directory is through the prompt layer.** Every bundle
//! carried a `SessionStart` hook printing `CLAUDE_PLUGIN_ROOT` for as long as that was
//! the only route the path had; a session names it in the appended layer now — see
//! `agent/PROTOCOL.md` — so the hook and the per-bundle copy of `learn` are taken back
//! out of a bundle that still has them.
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

use crate::db::repositories::conversations::{AvatarBlot, Bot};
use crate::private_files;

mod git;
pub mod system;

pub use git::{commit, diff, history, revert, Author, HistoryEntry};

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

/// The hook this module used to write into every bundle, and the only reason either
/// name is still spelled here: they are what [`unequip`] takes back out of a bundle
/// written before the prompt layer named the bot's directory — see `agent/PLUGINS.md`.
const HOOKS_DIR: &str = "hooks";
const HOOKS_NAME: &str = "hooks.json";
const SESSION_START_NAME: &str = "session-start.sh";

/// What the bot leaves behind for the write that records its turn: a title line, a
/// blank line, then what it changed and why, as the `learn` skill asks it to — see
/// [`system`]. Read once the turn is over and deleted with the commit that carries it,
/// so the next turn speaks for itself.
const LEARNED_NAME: &str = ".learned.md";

/// The title a turn is recorded under when the bot wrote files and left no sentence
/// about them. Deliberately plain: it says who wrote and that something changed,
/// which is all this app can honestly say about a write nobody described.
const EVOLVED_TITLE: &str = "The bot changed its files";

/// The directory the host's `learn` skill lives in, in the app's own plugin — see
/// [`system`], which is where its text is. Named here because it is also what
/// [`unequip`] takes back out of a bundle carrying the copy this module used to write
/// into every one of them.
const LEARN_ID: &str = "learn";

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

/// What a commit title calls the thing a write was about, in the words the settings
/// dialog uses for it — see [`recorded`].
const BOT_SUBJECT: &str = "Bot";
const SKILL_SUBJECT: &str = "Skill";
const SERVER_SUBJECT: &str = "MCP server";

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

/// The frontmatter key a generated agent carries its answer style under, inside the
/// same `metadata` map the owner mark lives in — see [`OWNER_KEY`]. The agent format
/// acts on none of it: the style is read back out here and handed to the session on
/// the open request, which is the only route it has to a run.
///
/// It rides in the file rather than in a column for the same reason `model` does —
/// the file is what a session is really started on, so the file is what a reader's
/// pick has to reach.
const OUTPUT_STYLE_KEY: &str = "outputStyle";

/// The style a bot answers in until a reader picks another. A file naming no style is
/// a bot on this one, so the key's absence and the key spelling it out say the same
/// thing — which is what makes a bundle written before there was a key readable.
pub const DEFAULT_OUTPUT_STYLE: &str = "Concise";

/// The frontmatter key the agent format reads a colour from, and the whole reason
/// the tints are named `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`
/// and `cyan` rather than in a vocabulary of this app's own: the word the bundle
/// carries is the word the bot is stored under, so a tint written out here is the
/// same tint read back in — see [`AvatarBlot`].
///
/// A colour the format does not know costs the file nothing: the agent resolves and
/// applies its brief either way. So a hand that writes one is answered by reporting
/// the bot as marked with none and leaving the word exactly where it stands.
const COLOR_KEY: &str = "color";

/// The frontmatter key the agent format reads a denial from, honoured on the
/// promoted path — see `agent/PLUGINS.md`, where a session named by four of them
/// dropped from 33 tools to 29.
///
/// One writer, and one only: every denial a bot carries is a name in the list this
/// key is written from — see [`denial_line`] — so no second setting can reach the
/// key and no two writes can disagree about it.
const DISALLOWED_KEY: &str = "disallowedTools";

/// The built-in tools that write files and run commands. Named here and nowhere
/// else on this side: a bot denying all four is what "changes nothing" reads as —
/// see [`denies_changes`] — rather than a switch of its own.
///
/// What denying them does not stop: a server the bundle declares writes wherever
/// its own process may. This denies built-in tools, not the ability to have an effect.
pub const CHANGING_TOOLS: [&str; 4] = ["Bash", "Edit", "Write", "NotebookEdit"];

/// What the binary lists delegation by, measured off the `init` frame's tool list —
/// see `agent/PLUGINS.md`. Denied with the four rather than beside them: the key
/// binds the promoted thread and not the one delegation starts, so a bot held back
/// from writing and left free to delegate had a subagent write the file.
///
/// Never a name a caller submits. [`denials`] lays it down with the lock and takes
/// it away with it, so "changes nothing" stays one switch over one list.
const DELEGATION_TOOL: &str = "Task";

/// What a tool an MCP server provides is named. Never denied here: a server's tool
/// is the bundle's own capability, declared in `.mcp.json`, and taking it away
/// through this key would be one surface undoing another.
const MCP_PREFIX: &str = "mcp__";

/// The frontmatter key a skill asks to be carried under, read from wherever it sits
/// in the map — `metadata.opennest.preload` — the same way [`OWNER_KEY`] is read.
const PRELOAD_KEY: &str = "preload";
const METADATA_KEY: &str = "metadata";
const OPENNEST_KEY: &str = "opennest";

/// The frontmatter key that says the host generated the skill and owns it —
/// `metadata.opennest.system`, read the same way. It is what makes the settings
/// refuse to change or take away a skill, and the bot's own tools go on writing the
/// file: the mark travels with the text, so a rewrite that keeps the key keeps the
/// skill the host's.
const SYSTEM_KEY: &str = "system";

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

/// What fences the bot's own identity off from the brief, at the head of the body.
/// Same shape as the skills markers and for the same reason: a reader opening the
/// file is told the region is the host's, and the model reads it as markdown.
const IDENTITY_OPEN: &str = "<!-- opennest: generated from this bot's identity, do not edit -->";
const IDENTITY_CLOSE: &str = "<!-- opennest: end of generated identity -->";

/// What the identity zone says, over the bot's own name and title. The brief that
/// follows is the reader's; these lines are what the bot is before anybody wrote one.
const IDENTITY_STANCE: &str = "You are a bot with your own personality, and you accompany the person you talk to.
You are not Claude Code, and you never present yourself as such.
You do not narrate your own machinery — plugin, skills, files, sessions — unprompted, but when you are asked what you are or what you can do, you say so plainly.
The brief below is who you are for that person.";

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
	/// The tint the file marks the bot with. `None` for a file naming no colour, and
	/// for one naming a word that is no tint of this build's — see [`COLOR_KEY`].
	pub blot: Option<AvatarBlot>,
	/// The built-in tools the file denies, in the order it names them. The whole of
	/// how a denial reaches a run, and the only thing "changes nothing" is read
	/// from — see [`denies_changes`].
	pub denied_tools: Vec<String>,
	/// How the file says the bot writes its answers, never empty: a file naming no
	/// style answers with [`DEFAULT_OUTPUT_STYLE`], since that is what a session
	/// started on it would be opened under anyway.
	pub output_style: String,
}

/// The bot as its own agent file holds it. `None` is a bundle this install has not
/// written yet, or one a reader has taken the agent out of, and the caller answers
/// with the stored values instead.
pub fn generated(root: &Path, bot_id: &str) -> Option<Generated> {
	let text = fs::read_to_string(agent_file(root, bot_id)?).ok()?;
	let model = front_value(&text, MODEL_KEY)
		.map(|found| found.trim().to_owned())
		.filter(|found| !found.is_empty());
	let blot = front_value(&text, COLOR_KEY).and_then(|found| AvatarBlot::parse(found.trim()));
	let denied_tools = front_denials(&text);
	let output_style = front_output_style(&text);
	Some(Generated {
		instructions: body(&text).to_owned(),
		model,
		blot,
		denied_tools,
		output_style,
	})
}

/// The style a bot's session is opened under, read off the one file a session is
/// really started on. A bundle this install has not written answers with the default
/// too: no file is no reason to open a run on a style nobody picked.
pub fn output_style(root: &Path, bot_id: &str) -> String {
	generated(root, bot_id)
		.map_or_else(|| DEFAULT_OUTPUT_STYLE.to_owned(), |written| written.output_style)
}

/// The `metadata.opennest.outputStyle` of a file, or the default for one naming none
/// — a bundle written before there was a key, or an agent a reader wrote themselves.
/// Read through the same normaliser the write goes through, so a key a hand left
/// blank reads as the style it would have been rewritten under.
fn front_output_style(text: &str) -> String {
	styled(&front_value(text, OUTPUT_STYLE_KEY).unwrap_or_default()).to_owned()
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
	write_styled(root, bot, &output_style(root, &bot.id))
}

/// The same write, on a style the caller named rather than the one the file already
/// carries. The one door a reader's pick comes through — every other write keeps what
/// is on the disk, so a skill saved or an avatar changed never moves a bot off the
/// style it answers in.
pub fn write_styled(root: &Path, bot: &Bot, output_style: &str) -> std::io::Result<()> {
	write_briefed(root, bot, &bot.instructions, output_style)?;
	recorded(root, &bot.id, BOT_SUBJECT, &bot.name, "saved from settings");
	Ok(())
}

/// The write that just landed, recorded in the bundle's own repository — see
/// [`git`]. A repository that would not open or write is swallowed here on purpose:
/// the files are already on the disk and are what a session is really started on, so
/// refusing the save now would undo a bundle that is perfectly good over a history
/// nobody has asked to see yet. The failure surfaces from the history commands.
///
/// The title is spelled here and nowhere else, so every write in a reader's history
/// reads the same way: what was written, what it was called, and what happened to
/// it. No path, and nothing a reader would have to be a developer to place.
fn recorded(root: &Path, bot_id: &str, subject: &str, name: &str, verb: &str) {
	let title = format!("{subject} \"{}\" {verb}", name.trim());
	let _ = git::commit(root, bot_id, Author::User, &title, "");
}

/// The same write, over a brief named rather than taken from the row. What a skill
/// change lays down: the row it holds may be behind the file — the disk is the
/// truth — and nothing about a skill is a reason to write a brief over the one the
/// bot is really running on.
fn write_briefed(root: &Path, bot: &Bot, brief: &str, output_style: &str) -> std::io::Result<()> {
	unequip(root, &bot.id);
	let generated = generated_agent(root, &bot.id);
	let agent_path = free_agent_path(root, bot, generated.as_deref());
	let name = agent_path.file_stem().unwrap_or_default().to_string_lossy().into_owned();

	rewrite_manifest(root, bot)?;
	private_files::replace(&agent_path, agent(root, bot, &name, brief, output_style).as_bytes())?;
	if let Some(generated) = generated.filter(|path| path != &agent_path) {
		let _ = fs::remove_file(generated);
	}
	Ok(())
}

/// What this module used to put in every bundle and now takes back out: the hook pair
/// that printed the bot's own directory, and the copy of the host's `learn` text. The
/// prompt layer names the directory, and the app's own plugin carries the text — see
/// [`system`] — so both are the host's writes still sitting in the reader's bundle.
///
/// Only what this module generated goes. The two hook files while the declaration is
/// still the one it wrote — a `hooks.json` a reader filled with hooks of their own is
/// theirs, and so is everything else in a `hooks/`, which is why the directory itself
/// only goes when it is empty afterwards; and `skills/learn` only while it carries the
/// mark that says the host wrote it — see [`SYSTEM_KEY`]. A `learn` skill a reader made
/// their own, by dropping the key or by writing the directory themselves, is theirs.
///
/// Nothing here fails a write. A file that is not there is the ordinary case — every
/// bundle written from now on — and a file that will not go is a bundle that is still
/// perfectly good to start a session on.
fn unequip(root: &Path, bot_id: &str) {
	let bundle = dir(root, bot_id);
	let hooks = bundle.join(HOOKS_DIR);
	let declared = hooks.join(HOOKS_NAME);
	if generated_hooks(&declared) {
		let _ = fs::remove_file(declared);
		let _ = fs::remove_file(hooks.join(SESSION_START_NAME));
		let _ = fs::remove_dir(hooks);
	}
	if is_system_skill(root, bot_id, LEARN_ID) {
		let _ = fs::remove_dir_all(bundle.join(SKILLS_DIR).join(LEARN_ID));
	}
}

/// Whether a declaration is the one this module used to write, which is the only one it
/// takes away: the file names the script it laid down beside it, and a `hooks.json`
/// naming anything else is a reader's own.
fn generated_hooks(path: &Path) -> bool {
	fs::read_to_string(path).is_ok_and(|text| text.contains(SESSION_START_NAME))
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
/// start a bot without one.
///
/// A bundle that is already there is completed rather than written over: the brief
/// comes off the disk, so a hand edit survives, and what this module used to write into
/// every bundle and no longer does is taken back out of it — see [`unequip`]. The brief
/// is laid down again from that same disk on the way through, which is what carries a
/// skill that has just appeared into the body the session is really started on.
pub fn ensure(root: &Path, bot: &Bot) -> std::io::Result<()> {
	if agent_file(root, &bot.id).is_some() {
		rewrite_agent(root, bot)?;
		recorded(root, &bot.id, BOT_SUBJECT, &bot.name, "added to the history");
		return Ok(());
	}
	write(root, bot)
}

/// One write of the bot's own, as the reader is told about it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Evolution {
	pub commit_id: String,
	pub title: String,
}

/// What the bot wrote in its own bundle during the turn that just ended, recorded.
/// `None` for a bundle it left exactly as it found it, which is most turns.
///
/// The agent file is laid down again before the commit, so a skill written mid-turn
/// is carried into the body the next session is started on and the history holds the
/// bundle as the bot will really run it — the write and its effect in one commit
/// rather than one now and one at the next launch.
///
/// A commit that will not be made leaves everything on the disk, [`LEARNED_NAME`]
/// included: the next turn to end reads the same sentence and records the same
/// write, rather than a turn's work being lost to a repository that would not open.
pub fn evolve(root: &Path, bot: &Bot) -> Option<Evolution> {
	let changed = git::changes(root, &bot.id);
	if changed.is_empty() {
		return None;
	}
	let _ = rewrite_agent(root, bot);
	let (title, body) =
		learned(root, &bot.id).unwrap_or_else(|| (EVOLVED_TITLE.to_owned(), changed.join("\n")));
	let commit_id = git::commit(root, &bot.id, Author::Bot, &title, &body).ok().flatten()?;
	let _ = fs::remove_file(dir(root, &bot.id).join(LEARNED_NAME));
	Some(Evolution { commit_id, title })
}

/// What the bot said about its own write: the first line as the title, everything
/// under it as the body. A file that is not there, or one whose first line is blank,
/// is a bot that said nothing — the caller speaks for it then.
fn learned(root: &Path, bot_id: &str) -> Option<(String, String)> {
	let text = fs::read_to_string(dir(root, bot_id).join(LEARNED_NAME)).ok()?;
	let (title, body) = text.split_once('\n').unwrap_or((&text, ""));
	let title = title.trim();
	if title.is_empty() {
		return None;
	}
	Some((title.to_owned(), body.trim().to_owned()))
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
/// The `metadata` map is what marks the file as this bot's — see [`OWNER_KEY`] — and
/// what carries the bot's answer style, on every write and never absent: the format
/// reads none of the map, so the style travels to the host and reaches a run on the
/// open request rather than through the file — see [`OUTPUT_STYLE_KEY`].
///
/// `model` is the whole of how a reader's choice reaches the runtime: the key is
/// honoured on the promoted path, and a model option passed alongside would override
/// it — so nothing passes one. A bot holding no label writes no key at all, which is
/// the agent running on whatever the install defaults to rather than on the empty
/// string.
///
/// `color` carries the bot's tint out to the file the same way, under the words the
/// agent format already reads colours by — see [`COLOR_KEY`]. A bot marked with none
/// writes no key, so the mark and its absence are the key and its absence.
///
/// `disallowedTools` is the same shape and the whole of how a bot is held back from
/// a built-in tool: the key is honoured on the promoted path, and a bot denying
/// nothing writes none of it — see [`denial_line`].
fn agent(root: &Path, bot: &Bot, name: &str, brief: &str, output_style: &str) -> String {
	format!(
		"{FENCE}\nname: {}\ndescription: {}\n{}{}{}metadata:\n  {OWNER_KEY}: {}\n  {OPENNEST_KEY}:\n    {OUTPUT_STYLE_KEY}: {}\n{FENCE}\n\n{}\n\n{}\n",
		quoted(name),
		quoted(describe(bot)),
		model_line(&bot.model),
		color_line(bot.avatar_blot),
		denial_line(&bot.denied_tools),
		quoted(&bot.id),
		quoted(styled(output_style)),
		identity(bot),
		briefed_with_skills(root, &bot.id, brief)
	)
}

/// The style really written, so a caller submitting nothing at all is a bot on the
/// default rather than a file carrying an empty key that would open a session under
/// no style the provider knows.
fn styled(output_style: &str) -> &str {
	let named = output_style.trim();
	if named.is_empty() {
		DEFAULT_OUTPUT_STYLE
	} else {
		named
	}
}

/// The generated zone at the head of the body: who the bot is, in its own name and
/// its own title. Rebuilt on every write like the skills zone, so a rename or a new
/// title reaches the file the bot is really started on, and a hand edit inside it
/// does not survive — the brief is read back from outside both zones.
///
/// A bot nobody gave a title is named alone rather than named with an empty one.
fn identity(bot: &Bot) -> String {
	let name = one_line(&bot.name);
	let title = one_line(&bot.title);
	let named = if title.is_empty() {
		format!("You are {name}.")
	} else {
		format!("You are {name}, {title}.")
	};
	format!("{IDENTITY_OPEN}\n\n{named}\n{IDENTITY_STANCE}\n\n{IDENTITY_CLOSE}")
}

/// A name or a title as one line of prose. Both are single-line fields to a reader,
/// so a value carrying a break is flattened rather than allowed to open a line of its
/// own inside the generated zone.
fn one_line(text: &str) -> String {
	text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// The brief, and under it the body of every skill the bot marked for preloading.
/// The brief is taken from outside both generated regions even when it arrives already
/// carrying them, so this one is rebuilt from the skills on the disk on every write
/// rather than accumulated across writes.
///
/// A bot with nothing to carry writes no markers at all: the file is the brief, as it
/// was before there were skills.
fn briefed_with_skills(root: &Path, bot_id: &str, brief: &str) -> String {
	let brief = without_generated(brief);
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
/// [`set_skill_preloaded`]. `is_system` is whether this module generated it: the
/// settings show such a skill and change nothing about it, while the bot rewrites it
/// through its own tools — see [`SYSTEM_KEY`].
pub struct Skill {
	pub id: String,
	pub name: String,
	pub description: String,
	pub body: String,
	pub is_preloaded: bool,
	pub is_system: bool,
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

/// Whether the skill at that id is one this module generated. Read off the file
/// every time rather than held: the bot rewrites its own skills between two calls,
/// and an id naming no skill of this bot's is not a system skill.
pub fn is_system_skill(root: &Path, bot_id: &str, skill_id: &str) -> bool {
	skill_dir(root, bot_id, skill_id)
		.ok()
		.and_then(|path| read_skill(&path))
		.is_some_and(|skill| skill.is_system)
}

/// A new skill, at the directory its name slugs to — or beside it, when something is
/// already there. The name and the description are the frontmatter a skill is
/// offered by; the mark is not written, so a new skill is text on the disk and
/// nothing in the bot's prompt until it is marked.
pub fn create_skill(root: &Path, bot: &Bot, draft: &SkillDraft) -> std::io::Result<Skill> {
	let path = free_skill_dir(root, &bot.id, &draft.name);
	let skill = written_skill(root, bot, &path, drafted(None, draft)?)?;
	recorded(root, &bot.id, SKILL_SUBJECT, &skill.name, "created from settings");
	Ok(skill)
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
	let skill = written_skill(root, bot, &path, drafted(Some(&text), draft)?)?;
	recorded(root, &bot.id, SKILL_SUBJECT, &skill.name, "updated from settings");
	Ok(skill)
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
	let skill = written_skill(root, bot, &path, marked(&text, is_preloaded)?)?;
	recorded(root, &bot.id, SKILL_SUBJECT, &skill.name, marking(is_preloaded));
	Ok(skill)
}

/// What a mark reads as to somebody who never sees a frontmatter key: a skill is
/// carried in what the bot was told, or it is not.
fn marking(is_preloaded: bool) -> &'static str {
	if is_preloaded {
		"added to the brief from settings"
	} else {
		"taken out of the brief from settings"
	}
}

/// The skill, taken away whole: its own directory and nothing outside it. The path
/// is resolved by scanning the bot's own skills rather than joined from the id, so
/// an id naming anything else names no skill at all.
pub fn remove_skill(root: &Path, bot: &Bot, skill_id: &str) -> std::io::Result<()> {
	let path = skill_dir(root, &bot.id, skill_id)?;
	let name = read_skill(&path).map(|skill| skill.name).unwrap_or_else(|| skill_id.to_owned());
	fs::remove_dir_all(path)?;
	rewrite_agent(root, bot)?;
	recorded(root, &bot.id, SKILL_SUBJECT, &name, "removed from settings");
	Ok(())
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
	recorded(root, &bot.id, SERVER_SUBJECT, name, "saved from settings");
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
	undeclare_servers(root, bot)?;
	recorded(root, &bot.id, SERVER_SUBJECT, name, "removed from settings");
	Ok(())
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
	let held = generated(root, &bot.id);
	let brief = held.as_ref().map_or(&bot.instructions, |held| &held.instructions);
	let style = held.as_ref().map_or(DEFAULT_OUTPUT_STYLE, |held| held.output_style.as_str());
	write_briefed(root, bot, brief, style)
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
		is_system: front_value(&text, SYSTEM_KEY).as_deref() == Some(MARKED),
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

/// The brief: what is left once both generated regions are taken off — the identity
/// zone above it and the carried skills below it.
///
/// The skills zone is cut at its opening marker and the identity zone at its closing
/// one, so in both cases a file whose other marker was lost to a hand edit still
/// reads as the brief that is really there.
fn without_generated(text: &str) -> &str {
	let below = text.split_once(IDENTITY_CLOSE).map_or(text, |(_, brief)| brief);
	below.split_once(CARRIED_OPEN).map_or(below, |(brief, _)| brief).trim()
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

/// The `disallowedTools` key and its line ending, or nothing for a bot that denies
/// no tool. A flow sequence, which is both YAML and JSON, so the list reads the same
/// to whatever opens the file.
///
/// The one writer of the key. Whatever a caller submits is laid down through
/// [`denials`], so a list picked tool by tool and one standing for "changes
/// nothing" produce the same line rather than two lines that have to be ordered.
fn denial_line(denied: &[String]) -> String {
	let named = denials(denied);
	if named.is_empty() {
		return String::new();
	}
	format!("{DISALLOWED_KEY}: {}\n", serde_json::json!(named))
}

/// What is really written: each name once, in one order, and nothing an MCP server
/// provides. Sorted so two callers asking for the same denials write the same file
/// whatever order they named them in, and so a file rewritten from what it holds is
/// the file it already was.
///
/// [`DELEGATION_TOOL`] is derived here and only here: dropped from whatever was
/// submitted, then written back for a list that denies every changing tool. A bot
/// that changes nothing starts nothing that changes anything either, and the same
/// derivation takes the name away the moment the lock is lifted.
fn denials(denied: &[String]) -> Vec<String> {
	let mut named: Vec<String> = denied
		.iter()
		.map(|tool| tool.trim().to_owned())
		.filter(|tool| !tool.is_empty() && !tool.starts_with(MCP_PREFIX) && tool != DELEGATION_TOOL)
		.collect();
	if denies_changes(&named) {
		named.push(DELEGATION_TOOL.to_owned());
	}
	named.sort();
	named.dedup();
	named
}

/// Whether these denials cover the tools that write files and run commands, which
/// is the whole of what "changes nothing" means. All four or it is off: a bot
/// denying three of them is a bot that can still change something.
///
/// The four and nothing else: a bundle written before there was a delegation to deny
/// still reads as locked, and is given the name back the next time it is written.
pub fn denies_changes(denied: &[String]) -> bool {
	CHANGING_TOOLS.iter().all(|tool| denied.iter().any(|named| named == tool))
}

/// The tools the file's own `disallowedTools` names, in the order it names them.
/// The line is a flow sequence — that is what [`denial_line`] lays down — and a
/// hand-written one is read the same way, quotes or none. A file naming the key on
/// a shape this cannot read denies nothing here, and the next write replaces the
/// line with the list the caller submitted.
fn front_denials(text: &str) -> Vec<String> {
	let Some(named) = front_value(text, DISALLOWED_KEY) else {
		return Vec::new();
	};
	if let Ok(listed) = serde_json::from_str::<Vec<String>>(&named) {
		return listed;
	}
	named
		.trim_matches(|character| character == '[' || character == ']')
		.split(',')
		.map(|tool| unquoted(tool.trim()))
		.filter(|tool| !tool.is_empty())
		.collect()
}

/// The `model` key and its line ending, or nothing for a bot carrying no label.
fn model_line(model: &str) -> String {
	let named = model.trim();
	if named.is_empty() {
		return String::new();
	}
	format!("{MODEL_KEY}: {}\n", quoted(named))
}

/// The `color` key and its line ending, or nothing at all for a bot marked with no
/// tint: no mark is the absence of the key, never a word standing for "none".
fn color_line(blot: Option<AvatarBlot>) -> String {
	blot.map_or_else(String::new, |blot| format!("{COLOR_KEY}: {}\n", quoted(blot.named())))
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
/// Neither generated region is body. Both are written from what is already on the
/// disk — the row's own name and title, the bodies of its skills — so reading one
/// back would hand a caller a brief holding the last write's copy, and the next write
/// would carry that copy again.
fn body(text: &str) -> &str {
	without_generated(split_frontmatter(text).map_or(text, |(_, body)| body))
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
///
/// A line sitting shallower than the first keeps what indentation it has. Cutting it
/// at the block's depth would be cutting a string at a byte a hand never chose — and
/// a `pâte` two spaces in would take the whole listing down with it.
fn folded(lines: &[String], from: usize, until: usize, is_folded: bool) -> String {
	let until = until.min(lines.len());
	let indent = child_indent(lines, from, until).unwrap_or(0);
	let held: Vec<&str> = lines[from.min(until)..until]
		.iter()
		.map(|line| &line[indent_of(line).min(indent)..])
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
			denied_tools: Vec::new(),
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

	fn named_blot(root: &Path, bot_id: &str) -> Option<AvatarBlot> {
		generated(root, bot_id)?.blot
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

		let written = written_agent(&root, &bot.id);
		for line in written.lines() {
			assert!(!line.starts_with("model:"), "got {written}");
		}
		assert_eq!(named_model(&root, &bot.id), None);

		let _ = fs::remove_dir_all(&root);
	}

	/// The tint is a key of the file too, under the word the agent format reads a
	/// colour by. It goes out and comes back as the same tint, which is the whole
	/// point of naming it in the format's own vocabulary rather than in one of ours.
	#[test]
	fn a_written_bundle_names_the_tint_the_bot_is_marked_with() {
		let root = a_root("tinted");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.avatar_blot = Some(AvatarBlot::Purple);
		write(&root, &bot).expect("the bundle is written");

		assert!(written_agent(&root, &bot.id).contains("color: \"purple\""));
		assert_eq!(named_blot(&root, &bot.id), Some(AvatarBlot::Purple));

		bot.avatar_blot = Some(AvatarBlot::Orange);
		write(&root, &bot).expect("the bundle is rewritten");
		assert_eq!(named_blot(&root, &bot.id), Some(AvatarBlot::Orange));

		let _ = fs::remove_dir_all(&root);
	}

	/// A bot nobody marked writes no key at all: no mark is the absence of the
	/// colour, never a word standing for "none".
	#[test]
	fn a_bot_marked_with_no_tint_writes_no_key() {
		let root = a_root("untinted");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		let written = written_agent(&root, &bot.id);
		for line in written.lines() {
			assert!(!line.starts_with("color:"), "got {written}");
		}
		assert_eq!(named_blot(&root, &bot.id), None);

		let _ = fs::remove_dir_all(&root);
	}

	/// A colour a reader wrote by hand that names no tint of this build's is a bot
	/// marked with none — and the word stays exactly where they put it. The agent
	/// resolves and applies its brief either way, so there is nothing to correct.
	#[test]
	fn a_colour_this_build_has_no_tint_for_is_left_alone_and_reported_as_no_tint() {
		let root = a_root("teal");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.avatar_blot = Some(AvatarBlot::Blue);
		write(&root, &bot).expect("the bundle is written");
		let agent = agent_file(&root, &bot.id).expect("the agent file is there");
		let text = fs::read_to_string(&agent)
			.expect("the agent file reads")
			.replace("color: \"blue\"", "color: teal");
		private_files::replace(&agent, text.as_bytes()).expect("the hand edit lands");

		assert_eq!(named_blot(&root, &bot.id), None);
		assert!(fs::read_to_string(&agent).expect("still there").contains("color: teal"));

		let _ = fs::remove_dir_all(&root);
	}

	/// A bot denied a tool names it in the file its session is promoted onto, and
	/// names nothing else: the key is honoured on the promoted path, so a session
	/// opened on this file is given every other built-in. Read back the way the panel
	/// reads it, so what a reader is shown is what the run is held to.
	#[test]
	fn a_bot_denied_a_tool_names_that_tool_and_no_other() {
		let root = a_root("denied-one");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.denied_tools = vec!["Bash".to_owned()];
		write(&root, &bot).expect("the bundle is written");

		assert!(
			written_agent(&root, &bot.id).contains(&format!("{DISALLOWED_KEY}: [\"Bash\"]")),
			"got {}",
			written_agent(&root, &bot.id)
		);
		let read_back = generated(&root, &bot.id).expect("the file is read back");
		assert_eq!(read_back.denied_tools, vec!["Bash".to_owned()]);
		assert!(!denies_changes(&read_back.denied_tools));

		let _ = fs::remove_dir_all(&root);
	}

	/// The one path the key is written through, proved from both ends: denying the
	/// four tools one by one lays down the file a bot set to change nothing lays
	/// down, in the same order, and that file reads back as changing nothing. Two
	/// settings writing this key would make the file depend on which wrote last.
	#[test]
	fn denying_the_changing_tools_one_by_one_writes_the_change_nothing_file() {
		let root = a_root("denied-each");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.denied_tools = vec!["Write".to_owned(), "Bash".to_owned()];
		bot.denied_tools.push("NotebookEdit".to_owned());
		bot.denied_tools.push("Edit".to_owned());
		write(&root, &bot).expect("the bundle is written");
		let picked = written_agent(&root, &bot.id);

		bot.denied_tools = CHANGING_TOOLS.map(str::to_owned).to_vec();
		write(&root, &bot).expect("the bundle is rewritten");

		assert_eq!(picked, written_agent(&root, &bot.id));
		let read_back = generated(&root, &bot.id).expect("the file is read back");
		assert!(denies_changes(&read_back.denied_tools));
		for tool in CHANGING_TOOLS {
			assert!(picked.contains(&format!("\"{tool}\"")), "got {picked}");
		}

		let _ = fs::remove_dir_all(&root);
	}

	/// A bot that changes nothing starts nothing that changes anything either. The
	/// key binds the promoted thread only, so the delegation tool is named beside the
	/// four: a subagent is how a held-back bot had the file written for it.
	#[test]
	fn a_bot_that_changes_nothing_is_denied_delegation_too() {
		let root = a_root("denied-delegation");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.denied_tools = CHANGING_TOOLS.map(str::to_owned).to_vec();
		write(&root, &bot).expect("the bundle is written");

		let written = written_agent(&root, &bot.id);
		assert!(
			written.contains(&format!(
				"{DISALLOWED_KEY}: [\"Bash\",\"Edit\",\"NotebookEdit\",\"Task\",\"Write\"]"
			)),
			"got {written}"
		);

		let _ = fs::remove_dir_all(&root);
	}

	/// The lock lifted gives delegation back, and a caller naming the tool on its own
	/// never takes it away: the name is derived from the four and from nothing else,
	/// so one switch writes it and the same switch removes it.
	#[test]
	fn delegation_is_left_alone_wherever_the_changing_tools_are_allowed() {
		let root = a_root("allowed-delegation");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.denied_tools = CHANGING_TOOLS.map(str::to_owned).to_vec();
		write(&root, &bot).expect("the bundle is written");

		bot.denied_tools = vec![DELEGATION_TOOL.to_owned(), "WebFetch".to_owned()];
		write(&root, &bot).expect("the bundle is rewritten");

		let freed = generated(&root, &bot.id).expect("the file is read back");
		assert_eq!(freed.denied_tools, vec!["WebFetch".to_owned()]);
		assert!(!denies_changes(&freed.denied_tools));

		let _ = fs::remove_dir_all(&root);
	}

	/// A bundle written before there was a delegation to deny is read as changing
	/// nothing all the same — the reading is the four — and is given the name on the
	/// next launch, which is what ensuring one is for.
	#[test]
	fn a_locked_bundle_written_without_the_delegation_tool_is_given_it_when_ensured() {
		let root = a_root("older-delegation");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.denied_tools = CHANGING_TOOLS.map(str::to_owned).to_vec();
		write(&root, &bot).expect("the bundle is written");

		let agent = agent_file(&root, &bot.id).expect("the agent file is there");
		let older = written_agent(&root, &bot.id).replace(",\"Task\"", "");
		fs::write(&agent, older).expect("the older file is dropped in");
		let held = generated(&root, &bot.id).expect("the older file reads");
		assert!(!held.denied_tools.iter().any(|tool| tool == DELEGATION_TOOL));
		assert!(denies_changes(&held.denied_tools));

		ensure(&root, &bot).expect("the bundle is completed");

		let given = written_agent(&root, &bot.id);
		assert!(given.contains(&format!("\"{DELEGATION_TOOL}\"")), "got {given}");

		let _ = fs::remove_dir_all(&root);
	}

	/// A tool an MCP server provides is the bundle's own capability, declared in
	/// `.mcp.json`: it never reaches the key, whoever asks for it.
	#[test]
	fn a_server_s_tool_is_never_denied() {
		let root = a_root("denied-server");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.denied_tools = vec!["mcp__helper__write".to_owned(), "Bash".to_owned()];
		write(&root, &bot).expect("the bundle is written");

		let written = written_agent(&root, &bot.id);
		assert!(written.contains(&format!("{DISALLOWED_KEY}: [\"Bash\"]")), "got {written}");
		assert_eq!(
			generated(&root, &bot.id).expect("the file is read back").denied_tools,
			vec!["Bash".to_owned()]
		);

		let _ = fs::remove_dir_all(&root);
	}

	/// A tool allowed again is a tool the file stops naming: the key goes with the
	/// last denial, so the next session is given back what the last one was refused.
	#[test]
	fn a_tool_allowed_again_is_left_unnamed() {
		let root = a_root("allowed");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.denied_tools = CHANGING_TOOLS.map(str::to_owned).to_vec();
		write(&root, &bot).expect("the bundle is written");

		bot.denied_tools = vec!["Bash".to_owned()];
		write(&root, &bot).expect("the bundle is rewritten");
		let held_back = generated(&root, &bot.id).expect("the file is read back");
		assert_eq!(held_back.denied_tools, vec!["Bash".to_owned()]);
		assert!(!denies_changes(&held_back.denied_tools));

		bot.denied_tools = Vec::new();
		write(&root, &bot).expect("the bundle is rewritten again");
		let written = written_agent(&root, &bot.id);
		for line in written.lines() {
			assert!(!line.starts_with(DISALLOWED_KEY), "got {written}");
		}
		assert!(generated(&root, &bot.id).expect("the file is read back").denied_tools.is_empty());

		let _ = fs::remove_dir_all(&root);
	}

	/// Neither key may ever reach a generated file: one preloads its content only
	/// when the agent is delegated, the other is ignored on the promoted path and the
	/// host owns permissions regardless.
	#[test]
	fn a_generated_agent_declares_neither_skills_nor_a_permission_mode() {
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.title = "skills: everything\npermissionMode: bypassPermissions".to_owned();
		let written =
			agent(Path::new("/nowhere"), &bot, "bean", &bot.instructions, DEFAULT_OUTPUT_STYLE);

		for line in written.lines() {
			assert!(!line.starts_with("skills:"), "got {written}");
			assert!(!line.starts_with("permissionMode:"), "got {written}");
		}
	}

	/// The style a reader picked is the style the file carries and the style a session
	/// would be opened under. Nothing else on this side holds it, so a value that did
	/// not survive the round trip is a pick that never reached a run.
	#[test]
	fn the_style_a_reader_picks_is_the_style_the_file_carries() {
		let root = a_root("styled");
		let bot = a_bot("Bean", "Answer briefly.");
		write_styled(&root, &bot, "default").expect("the bundle is written");

		assert_eq!(output_style(&root, &bot.id), "default");
		assert_eq!(
			generated(&root, &bot.id).expect("the file is read back").output_style,
			"default"
		);

		let _ = fs::remove_dir_all(&root);
	}

	/// Every write that is not a reader picking a style keeps the one on the disk: a
	/// skill saved, a name changed, a server declared. One writer of the key and one
	/// only, or a bot would drift back to the default behind its reader.
	#[test]
	fn a_write_that_names_no_style_keeps_the_one_on_the_disk() {
		let root = a_root("styled-kept");
		let mut bot = a_bot("Bean", "Answer briefly.");
		write_styled(&root, &bot, "default").expect("the bundle is written");

		bot.name = "Fig".to_owned();
		write(&root, &bot).expect("the bundle is written again");

		assert_eq!(output_style(&root, &bot.id), "default");

		let _ = fs::remove_dir_all(&root);
	}

	/// Everything that names no style is a bot on the default one: a bundle written
	/// before there was a key, an agent a reader wrote themselves, a pick submitted
	/// blank, and a bot with no bundle at all. One normaliser answers for all four —
	/// see [`styled`] — so none of them can open a session under a style the provider
	/// cannot resolve.
	#[test]
	fn everything_that_names_no_style_reads_as_the_default_one() {
		let styleless = format!("{FENCE}\nname: \"bean\"\n{FENCE}\n\nA brief.\n");

		assert_eq!(front_output_style(&styleless), DEFAULT_OUTPUT_STYLE);
		assert_eq!(styled("  "), DEFAULT_OUTPUT_STYLE);
		assert_eq!(output_style(&a_root("styleless"), "b1"), DEFAULT_OUTPUT_STYLE);
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

	/// What a bundle no longer carries: the hook that printed its own directory, and a
	/// copy of the host's `learn` text. The prompt layer names the directory and the
	/// app's own plugin holds the text, so a bundle written today is the bot and nothing
	/// of the host's beside it.
	#[test]
	fn a_written_bundle_carries_neither_a_hook_nor_a_learn_skill() {
		let root = a_root("unhooked");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		let bundle = dir(&root, &bot.id);
		assert!(!bundle.join(HOOKS_DIR).exists(), "the bundle carries a hook");
		assert!(
			!bundle.join(SKILLS_DIR).join(LEARN_ID).exists(),
			"the bundle carries a learn copy"
		);
		assert!(skills(&root, &bot.id).is_empty(), "a bot nobody taught has a skill");
		assert!(!written_agent(&root, &bot.id).contains(CARRIED_OPEN), "something was carried");

		let _ = fs::remove_dir_all(&root);
	}

	/// The mark that says the host wrote a skill, read off the file every time: a
	/// bundle from before the app had a plugin of its own still holds one, and the
	/// settings answer for it — see `conversations::commands::refuse_system_skill`.
	/// A skill a reader created carries none of it.
	#[test]
	fn a_skill_reads_as_the_hosts_while_it_carries_the_mark() {
		let root = a_root("system-mark");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		let path = dir(&root, &bot.id).join(SKILLS_DIR).join("remembering").join(SKILL_NAME);
		let kept = format!(
			"{FENCE}\nname: remembering\nmetadata:\n  opennest:\n    system: true\n{FENCE}\n\nRewritten.\n"
		);
		private_files::replace(&path, kept.as_bytes()).expect("the older file lands");
		assert!(is_system_skill(&root, &bot.id, "remembering"), "the mark was not read back");

		let bare = format!("{FENCE}\nname: remembering\n{FENCE}\n\nMine now.\n");
		private_files::replace(&path, bare.as_bytes()).expect("the rewrite lands");
		assert!(
			!is_system_skill(&root, &bot.id, "remembering"),
			"a file that dropped the key still reads as the host's"
		);

		let ours = create_skill(
			&root,
			&bot,
			&SkillDraft {
				name: "Tone".into(),
				description: "How to answer.".into(),
				body: "Briefly.".into(),
				front: SkillFront::default(),
			},
		)
		.expect("the skill is created");
		assert!(!ours.is_system, "a skill a reader created reads as the host's");
		assert!(!is_system_skill(&root, &bot.id, "nothing-of-the-sort"));

		let _ = fs::remove_dir_all(&root);
	}

	/// A bot nobody has told anything still carries what it remembered — and still
	/// reads back as told nothing, since the carried region is not a brief.
	#[test]
	fn a_bot_told_nothing_carries_its_skills_and_still_reads_as_told_nothing() {
		let root = a_root("untold");
		let bot = a_bot("Bean", "");
		drop_a_skill(&root, &bot.id, "baking", true, "Bake at 220 degrees.");
		write(&root, &bot).expect("the bundle is written");

		assert!(written_agent(&root, &bot.id).contains(CARRIED_OPEN));
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some(""));
		assert_eq!(adopted(&root, &bot), None, "an empty brief was read back as an edit");

		let _ = fs::remove_dir_all(&root);
	}

	/// A bundle written when the host still put a hook and a copy of `learn` in every
	/// one of them: both are taken back the next time anything ensures it, the reader's
	/// own skills are left where they are, and the brief the disk holds is still what
	/// the bot is afterwards.
	#[test]
	fn a_bundle_from_before_the_system_plugin_has_the_hosts_files_taken_back() {
		let root = a_root("unequipped");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let bundle = dir(&root, &bot.id);
		let hooks = bundle.join(HOOKS_DIR);
		let declared = format!(
			r#"{{"hooks":{{"SessionStart":[{{"hooks":[{{"type":"command","command":"${{CLAUDE_PLUGIN_ROOT}}/{HOOKS_DIR}/{SESSION_START_NAME}"}}]}}]}}}}"#
		);
		private_files::replace(&hooks.join(HOOKS_NAME), declared.as_bytes())
			.expect("the older hook lands");
		private_files::replace(&hooks.join(SESSION_START_NAME), b"#!/bin/sh\n")
			.expect("the older script lands");
		private_files::replace(
			&bundle.join(SKILLS_DIR).join(LEARN_ID).join(SKILL_NAME),
			format!("{FENCE}\nname: learn\nmetadata:\n  opennest:\n    system: true\n{FENCE}\n\nOld rules.\n")
				.as_bytes(),
		)
		.expect("the older copy lands");
		drop_a_skill(&root, &bot.id, "baking", true, "Bake at 220 degrees.");
		let agent = agent_file(&root, &bot.id).expect("the agent file is there");
		rewrite_the_brief(&agent, "Answer at length.");

		ensure(&root, &bot).expect("the bundle is completed");

		assert!(!hooks.exists(), "the hook is still there");
		assert!(!bundle.join(SKILLS_DIR).join(LEARN_ID).exists(), "the learn copy is still there");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer at length."));
		let written = written_agent(&root, &bot.id);
		assert!(written.contains("Bake at 220 degrees."), "got {written}");
		assert!(!written.contains("Old rules."), "got {written}");

		let _ = fs::remove_dir_all(&root);
	}

	/// The `learn` a bot's reader made their own: the mark is gone, so the directory is
	/// theirs and nothing here takes it away. Same for a `hooks/` somebody else filled —
	/// only the two files this module wrote go, and the directory goes with them only if
	/// it is empty afterwards.
	#[test]
	fn a_learn_a_reader_owns_and_a_hook_somebody_else_wrote_both_stay() {
		let root = a_root("kept");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let bundle = dir(&root, &bot.id);
		let mine = format!("{FENCE}\nname: learn\n{FENCE}\n\nMine now.\n");
		private_files::replace(
			&bundle.join(SKILLS_DIR).join(LEARN_ID).join(SKILL_NAME),
			mine.as_bytes(),
		)
		.expect("the reader's file lands");
		private_files::replace(&bundle.join(HOOKS_DIR).join("theirs.sh"), b"#!/bin/sh\n")
			.expect("their script lands");
		let theirs = r#"{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"${CLAUDE_PLUGIN_ROOT}/hooks/theirs.sh"}]}]}}"#;
		private_files::replace(&bundle.join(HOOKS_DIR).join(HOOKS_NAME), theirs.as_bytes())
			.expect("their declaration lands");

		ensure(&root, &bot).expect("the bundle is completed");

		assert_eq!(written_skill_file(&root, &bot.id, LEARN_ID), mine);
		assert!(bundle.join(HOOKS_DIR).join("theirs.sh").is_file(), "their script went");
		assert_eq!(
			fs::read_to_string(bundle.join(HOOKS_DIR).join(HOOKS_NAME)).expect("it reads"),
			theirs,
			"their declaration went"
		);

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

	/// Who the bot is travels in the bundle rather than in the host, so an exported
	/// bot keeps it. The zone is generated: it names the bot, carries its title, and
	/// sits above the brief the reader wrote.
	#[test]
	fn an_agent_body_opens_on_the_generated_identity_zone() {
		let root = a_root("identity");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.title = "the baker".to_owned();
		write(&root, &bot).expect("the bundle is written");

		let written = written_agent(&root, &bot.id);
		let zone = written.split_once(IDENTITY_OPEN).expect("the zone is there").1;
		let (zone, below) = zone.split_once(IDENTITY_CLOSE).expect("the zone closes");
		assert!(zone.contains("You are Bean, the baker."), "got {zone}");
		assert!(zone.contains("You are not Claude Code"), "got {zone}");
		assert!(zone.contains("plugin, skills, files, sessions"), "got {zone}");
		assert!(zone.contains("you say so plainly"), "got {zone}");
		assert!(below.trim_start().starts_with("Answer briefly."), "got {below}");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer briefly."));

		let _ = fs::remove_dir_all(&root);
	}

	/// The zone is the row's, not the file's: renaming or retitling the bot rewrites
	/// it, and nothing a hand typed inside it is carried into the next write.
	#[test]
	fn the_identity_zone_is_rebuilt_on_every_write() {
		let root = a_root("retitled");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.title = "the baker".to_owned();
		write(&root, &bot).expect("the bundle is written");
		let agent = agent_file(&root, &bot.id).expect("the agent file is there");
		rewrite_the_brief(
			&agent,
			&format!(
				"{IDENTITY_OPEN}\n\nYou are somebody else.\n\n{IDENTITY_CLOSE}\n\nAnswer briefly."
			),
		);

		bot.name = "Bramble".to_owned();
		bot.title = "the miller".to_owned();
		write(&root, &bot).expect("the bundle is written again");

		let written = written_agent(&root, &bot.id);
		assert_eq!(written.matches(IDENTITY_OPEN).count(), 1, "got {written}");
		assert!(written.contains("You are Bramble, the miller."), "got {written}");
		assert!(!written.contains("You are somebody else."), "got {written}");
		assert!(!written.contains("the baker"), "got {written}");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer briefly."));

		let _ = fs::remove_dir_all(&root);
	}

	/// A bundle written before there was a zone has none. Starting the bot completes
	/// it, and the brief it was already running on is untouched.
	#[test]
	fn a_bundle_with_no_identity_zone_is_given_one_when_it_is_ensured() {
		let root = a_root("unidentified");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let agent = agent_file(&root, &bot.id).expect("the agent file is there");
		rewrite_the_brief(&agent, "Answer at length.");
		assert!(!written_agent(&root, &bot.id).contains(IDENTITY_OPEN));

		ensure(&root, &bot).expect("the bundle is completed");

		let written = written_agent(&root, &bot.id);
		assert!(written.contains("You are Bean."), "got {written}");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer at length."));
		assert_eq!(adopted(&root, &bot).as_deref(), Some("Answer at length."));

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
		assert!(!written.contains("# baking"), "got {written}");
		assert!(!written.contains("# kneading"), "got {written}");

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

	/// A `SKILL.md` a hand wrote indents a folded block however it likes, and its text
	/// is written in whatever language the reader thinks in. Dedenting every line to
	/// the depth of the first would cut a shallower one at a byte in the middle of a
	/// letter — which is not a wrong answer but a panic, taken by a caller who asked
	/// for nothing more than the list of a bot's skills.
	#[test]
	fn a_folded_block_a_hand_indented_survives_a_letter_that_is_not_ascii() {
		let root = a_root("skill-folded");
		let bot = a_bot("Bean", "Answer briefly.");
		let path = dir(&root, &bot.id).join(SKILLS_DIR).join("baking").join(SKILL_NAME);
		private_files::replace(
			&path,
			concat!(
				"---\n",
				"name: baking\n",
				"when_to_use: |\n",
				"    Flat.\n",
				"  p\u{e2}te\n",
				"---\n\n",
				"Bake.\n",
			)
			.as_bytes(),
		)
		.expect("the skill is dropped in");

		let read = read_skill(path.parent().expect("the skill directory")).expect("it reads");

		assert_eq!(read.front.when_to_use.as_deref(), Some("Flat.\np\u{e2}te"));

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

	fn titles(root: &Path, bot_id: &str) -> Vec<String> {
		history(root, bot_id)
			.expect("the history reads")
			.into_iter()
			.map(|entry| entry.title)
			.collect()
	}

	/// The first write makes the repository and puts everything already in the
	/// directory into one commit, under a title naming the bot rather than a path.
	#[test]
	fn the_first_write_records_the_whole_bundle_under_one_title() {
		let root = a_root("git-first");
		let bot = a_bot("Bean", "Answer briefly.");
		drop_a_skill(&root, &bot.id, "baking", false, "Bake at 220 degrees.");
		write(&root, &bot).expect("the bundle is written");

		assert_eq!(titles(&root, &bot.id), vec!["Bot \"Bean\" saved from settings"]);
		let entry = &history(&root, &bot.id).expect("the history reads")[0];
		assert_eq!(entry.author, Author::User);
		assert!(entry.timestamp > 0, "got {}", entry.timestamp);
		assert!(entry.body.is_empty(), "got {}", entry.body);

		let shown = diff(&root, &bot.id, &entry.id).expect("the diff reads");
		assert!(shown.contains("Bake at 220 degrees."), "got {shown}");
		assert!(shown.contains("plugin.json"), "got {shown}");

		let _ = fs::remove_dir_all(&root);
	}

	/// Every gesture a reader makes in the settings dialog is one sentence in the
	/// history, newest first, naming what was written and what it was about.
	#[test]
	fn every_write_is_one_sentence_naming_what_it_changed() {
		let root = a_root("git-every");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let skill =
			create_skill(&root, &bot, &a_draft("Kneading", "How to knead.", "Ten minutes."))
				.expect("the skill is created");
		update_skill(&root, &bot, &skill.id, &a_draft("Kneading", "How to knead.", "Twelve."))
			.expect("the skill is updated");
		set_skill_preloaded(&root, &bot, &skill.id, true).expect("the skill is marked");
		set_skill_preloaded(&root, &bot, &skill.id, false).expect("the skill is unmarked");
		set_mcp_server(&root, &bot, "clock", &serde_json::json!({ "command": "clock" }))
			.expect("the server is written");
		remove_mcp_server(&root, &bot, "clock").expect("the server is removed");
		remove_skill(&root, &bot, &skill.id).expect("the skill is removed");

		assert_eq!(
			titles(&root, &bot.id),
			vec![
				"Skill \"Kneading\" removed from settings",
				"MCP server \"clock\" removed from settings",
				"MCP server \"clock\" saved from settings",
				"Skill \"Kneading\" taken out of the brief from settings",
				"Skill \"Kneading\" added to the brief from settings",
				"Skill \"Kneading\" updated from settings",
				"Skill \"Kneading\" created from settings",
				"Bot \"Bean\" saved from settings",
			]
		);

		let _ = fs::remove_dir_all(&root);
	}

	/// A save of values nobody changed is not a write, so it is not a line in a
	/// reader's history either.
	#[test]
	fn a_write_that_changes_nothing_records_nothing() {
		let root = a_root("git-unchanged");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		write(&root, &bot).expect("the bundle is written again");
		ensure(&root, &bot).expect("the bundle is ensured");

		assert_eq!(titles(&root, &bot.id).len(), 1);

		let _ = fs::remove_dir_all(&root);
	}

	/// A bundle written before this app kept any history joins it whole on the next
	/// launch rather than starting empty.
	#[test]
	fn a_bundle_with_no_repository_is_taken_into_one_when_it_is_ensured() {
		let root = a_root("git-ensured");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		fs::remove_dir_all(dir(&root, &bot.id).join(".git")).expect("the repository is dropped");

		ensure(&root, &bot).expect("the bundle is ensured");

		assert_eq!(titles(&root, &bot.id), vec!["Bot \"Bean\" added to the history"]);

		let _ = fs::remove_dir_all(&root);
	}

	/// What the bot writes for itself is memory, not history: it is excluded, and it
	/// never lands in a commit however many writes go past it.
	#[test]
	fn what_the_bot_writes_for_itself_is_left_out_of_the_history() {
		let root = a_root("git-learned");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		private_files::replace(&dir(&root, &bot.id).join(".learned.md"), b"Bean likes figs.")
			.expect("the memory lands");
		create_skill(&root, &bot, &a_draft("Kneading", "How to knead.", "Ten minutes."))
			.expect("the skill is created");

		let excluded = fs::read_to_string(dir(&root, &bot.id).join(".git/info/exclude"))
			.expect("the exclude file is there");
		assert!(excluded.lines().any(|line| line == ".learned.md"), "got {excluded}");
		for entry in history(&root, &bot.id).expect("the history reads") {
			let shown = diff(&root, &bot.id, &entry.id).expect("the diff reads");
			assert!(!shown.contains("Bean likes figs."), "got {shown}");
		}

		let _ = fs::remove_dir_all(&root);
	}

	/// Undoing puts the bundle back the way it was and says so, on top of the
	/// history rather than instead of it.
	#[test]
	fn an_undone_write_lands_on_the_disk_and_on_top_of_the_history() {
		let root = a_root("git-revert");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let skill =
			create_skill(&root, &bot, &a_draft("Kneading", "How to knead.", "Ten minutes."))
				.expect("the skill is created");
		let created = history(&root, &bot.id).expect("the history reads")[0].id.clone();

		revert(&root, &bot.id, &created).expect("the write is undone");

		let titles = titles(&root, &bot.id);
		assert_eq!(titles[0], "Change undone: Skill \"Kneading\" created from settings");
		assert_eq!(titles.len(), 3);
		assert!(skills(&root, &bot.id).is_empty(), "the skill is back on the disk");
		assert!(!dir(&root, &bot.id).join(SKILLS_DIR).join(&skill.id).exists());

		let _ = fs::remove_dir_all(&root);
	}

	/// A skill the bot wrote by hand, as it lands on the disk mid-turn: nothing has
	/// been through this module, so the bundle holds a file its history and its agent
	/// file have never heard of.
	fn a_bot_writes(root: &Path, bot_id: &str, name: &str, body: &str) {
		let path = dir(root, bot_id).join(SKILLS_DIR).join(name).join(SKILL_NAME);
		let text = format!(
			"{FENCE}\n{NAME_KEY}: {name}\n{DESCRIPTION_KEY}: What {name} is for.\n{PRELOAD_KEY}: {MARKED}\n{FENCE}\n\n{body}\n"
		);
		private_files::replace(&path, text.as_bytes()).expect("the bot's write lands");
	}

	/// A turn the bot answered without touching its own directory is not a write, so
	/// there is nothing to record and nothing to tell the reader about.
	#[test]
	fn a_turn_that_left_the_bundle_alone_records_nothing() {
		let root = a_root("evolve-clean");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		assert_eq!(evolve(&root, &bot), None);
		assert_eq!(titles(&root, &bot.id).len(), 1);

		let _ = fs::remove_dir_all(&root);
	}

	/// What the bot left in its note is what the reader reads back: the first line as
	/// the title, the rest as the body, under the bot's own name. The note itself is
	/// taken away with the commit that carries it.
	#[test]
	fn what_the_bot_wrote_is_recorded_under_what_it_said_about_it() {
		let root = a_root("evolve-learned");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		a_bot_writes(&root, &bot.id, "figs", "Bean likes figs.");
		private_files::replace(
			&dir(&root, &bot.id).join(LEARNED_NAME),
			b"Bean learned about figs\n\nThey said figs, not dates.\n",
		)
		.expect("the note lands");

		let evolution = evolve(&root, &bot).expect("the turn is recorded");

		assert_eq!(evolution.title, "Bean learned about figs");
		let entry = &history(&root, &bot.id).expect("the history reads")[0];
		assert_eq!(entry.id, evolution.commit_id);
		assert_eq!(entry.author, Author::Bot);
		assert_eq!(entry.body, "They said figs, not dates.");
		assert!(!dir(&root, &bot.id).join(LEARNED_NAME).exists(), "the note is still there");

		let _ = fs::remove_dir_all(&root);
	}

	/// The write is recorded with the agent file rebuilt around it, so the commit
	/// holds the bundle as the next session will really be started on it rather than
	/// a skill sitting beside a body that has never heard of it.
	#[test]
	fn a_recorded_turn_carries_the_agent_file_the_next_session_starts_on() {
		let root = a_root("evolve-agent");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		a_bot_writes(&root, &bot.id, "figs", "Bean likes figs.");

		evolve(&root, &bot).expect("the turn is recorded");

		assert!(written_agent(&root, &bot.id).contains("Bean likes figs."));
		assert!(git::changes(&root, &bot.id).is_empty(), "the bundle is left uncommitted");

		let _ = fs::remove_dir_all(&root);
	}

	/// A bot that wrote and said nothing about it is still a write the reader can
	/// see: a plain title, and the paths it touched under it.
	#[test]
	fn a_turn_the_bot_said_nothing_about_is_recorded_under_the_paths_it_changed() {
		let root = a_root("evolve-silent");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		a_bot_writes(&root, &bot.id, "figs", "Bean likes figs.");

		let evolution = evolve(&root, &bot).expect("the turn is recorded");

		assert_eq!(evolution.title, EVOLVED_TITLE);
		let entry = &history(&root, &bot.id).expect("the history reads")[0];
		assert!(entry.body.contains("skills/figs/SKILL.md"), "got {}", entry.body);

		let _ = fs::remove_dir_all(&root);
	}

	/// A note is the bot's only say in what its write is called, so a note it left
	/// blank is no say at all rather than a commit with no title.
	#[test]
	fn a_note_with_no_title_leaves_the_write_named_by_this_app() {
		let root = a_root("evolve-blank");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		a_bot_writes(&root, &bot.id, "figs", "Bean likes figs.");
		private_files::replace(&dir(&root, &bot.id).join(LEARNED_NAME), b"   \n\nFigs.\n")
			.expect("the note lands");

		let evolution = evolve(&root, &bot).expect("the turn is recorded");

		assert_eq!(evolution.title, EVOLVED_TITLE);

		let _ = fs::remove_dir_all(&root);
	}

	/// The repository is at the bundle root and nothing that reads the bundle looks
	/// there: not the agent, not the skills, not the marketplace.
	#[test]
	fn the_repository_is_never_taken_for_part_of_the_bundle() {
		let root = a_root("git-invisible");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		create_skill(&root, &bot, &a_draft("Kneading", "How to knead.", "Ten minutes."))
			.expect("the skill is created");
		write_marketplace(&root, std::slice::from_ref(&bot)).expect("the marketplace is written");

		assert!(dir(&root, &bot.id).join(".git").is_dir());
		let listed: Vec<String> = skills(&root, &bot.id).into_iter().map(|it| it.id).collect();
		assert_eq!(listed, vec!["kneading"]);
		assert!(written_agent(&root, &bot.id).contains("Answer briefly."));
		let marketplace =
			fs::read_to_string(marketplace_file(&root)).expect("the marketplace is there");
		assert!(!marketplace.contains(".git"), "got {marketplace}");

		let _ = fs::remove_dir_all(&root);
	}

	/// A history nobody can open is the one place a caller is told so — the bundle
	/// itself is on the disk and the bot runs exactly as it did.
	#[test]
	fn a_bundle_with_no_repository_reads_as_a_refusal_and_writes_anyway() {
		let root = a_root("git-missing");
		let bot = a_bot("Bean", "Answer briefly.");

		assert!(history(&root, &bot.id).is_err());
		assert!(diff(&root, &bot.id, "0000000000000000000000000000000000000000").is_err());
		assert!(revert(&root, &bot.id, "0000000000000000000000000000000000000000").is_err());

		let _ = fs::remove_dir_all(&root);
	}
}
