use std::collections::HashMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::{LazyLock, Mutex, MutexGuard, PoisonError};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

use crate::db::repositories::conversations::{AvatarBlot, Bot};
use crate::private_files;

mod git;
pub mod space;
pub mod system;
pub mod user;

pub use git::{Author, HistoryEntry};

const DIR_NAME: &str = "bots";

const PLUGINS_DIR: &str = "plugins";

const MANIFEST_DIR: &str = ".claude-plugin";
const MANIFEST_NAME: &str = "plugin.json";
const MARKETPLACE_NAME: &str = "marketplace.json";
const AGENTS_DIR: &str = "agents";
const AGENT_NAME: &str = "agent";
const AGENT_EXTENSION: &str = "md";

const SKILLS_DIR: &str = "skills";
const SKILL_NAME: &str = "SKILL.md";

const HOOKS_DIR: &str = "hooks";
const HOOKS_NAME: &str = "hooks.json";
const SESSION_START_NAME: &str = "session-start.sh";

const LEARNED_NAME: &str = ".learned.md";

const EVOLVED_TITLE: &str = "The bot changed its files";

const LEARN_ID: &str = "learn";

const SETTINGS_NAME: &str = "settings.json";

const PERMISSIONS_KEY: &str = "permissions";
const DEFAULT_MODE_KEY: &str = "defaultMode";
const DIRECTORIES_KEY: &str = "additionalDirectories";
const ALLOW_KEY: &str = "allow";
const ASK_KEY: &str = "ask";
const DENY_KEY: &str = "deny";
const AUTO_MODE: &str = "auto";

pub const PERMISSION_MODES: [&str; 5] = ["default", "acceptEdits", "plan", AUTO_MODE, "dontAsk"];

const MCP_NAME: &str = ".mcp.json";
const SERVERS_KEY: &str = "mcpServers";
const MCP_SOURCE: &str = "./.mcp.json";

const MARKETPLACE: &str = "opennest-bots";
const OWNER: &str = "OpenNest";

const VERSION: &str = "0.1.0";

const UNNAMED: &str = "bot";

const STAMP_LENGTH: usize = 8;

const BOT_SUBJECT: &str = "Bot";
const SKILL_SUBJECT: &str = "Skill";
const SKILL_FILE_SUBJECT: &str = "Skill file";
const SERVER_SUBJECT: &str = "MCP server";

const OWNER_KEY: &str = "opennestBotId";

const MODEL_KEY: &str = "model";

const OUTPUT_STYLE_KEY: &str = "outputStyle";

pub const DEFAULT_OUTPUT_STYLE: &str = "Concise";

const COLOR_KEY: &str = "color";

const DISALLOWED_KEY: &str = "disallowedTools";

pub const CHANGING_TOOLS: [&str; 4] = ["Bash", "Edit", "Write", "NotebookEdit"];

const DELEGATION_TOOL: &str = "Task";

const MCP_PREFIX: &str = "mcp__";

const PRELOAD_KEY: &str = "preload";
const METADATA_KEY: &str = "metadata";
const OPENNEST_KEY: &str = "opennest";

const SYSTEM_KEY: &str = "system";

const INVOCATION_KEY: &str = "disable-model-invocation";

const NAME_KEY: &str = "name";
const DESCRIPTION_KEY: &str = "description";

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

const MARKED: &str = "true";

const INDENT: usize = 2;

const CARRIED_OPEN: &str = "<!-- opennest: generated from this bot's skills, do not edit -->";
const CARRIED_CLOSE: &str = "<!-- opennest: end of generated skills -->";

const MEMORY_OPEN: &str = "<!-- opennest: what the bot learned, the bot keeps this -->";
const MEMORY_CLOSE: &str = "<!-- opennest: end of what the bot learned -->";

const IDENTITY_CLOSE: &str = "<!-- opennest: end of generated identity -->";

const IDENTITY_STANCE: &str = "You are a bot with your own personality, and you accompany the person you talk to.
You are not Claude Code, and you never present yourself as such.
You do not narrate your own machinery — plugin, skills, files, sessions — unprompted, but when you are asked what you are or what you can do, you say so plainly.
The brief below is who you are for that person.";

const MAX_HEADING: usize = 6;

const FENCE: &str = "---";
const CLOSING_FENCE: &str = "\n---";

static COMMITS: LazyLock<Mutex<HashMap<PathBuf, &'static Mutex<()>>>> =
	LazyLock::new(|| Mutex::new(HashMap::new()));

fn commits(bundle: &Path) -> &'static Mutex<()> {
	let mut held = COMMITS.lock().unwrap_or_else(PoisonError::into_inner);
	*held.entry(bundle.to_path_buf()).or_insert_with(|| Box::leak(Box::new(Mutex::new(()))))
}

pub(super) fn serialised(bundle: &Path) -> MutexGuard<'static, ()> {
	commits(bundle).lock().unwrap_or_else(PoisonError::into_inner)
}

fn serialised_both(
	source: &Path,
	target: &Path,
) -> (MutexGuard<'static, ()>, Option<MutexGuard<'static, ()>>) {
	if source == target {
		return (serialised(source), None);
	}
	let (first, second) = if source < target { (source, target) } else { (target, source) };
	(serialised(first), Some(serialised(second)))
}

pub fn root<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
	Some(app.path().app_data_dir().ok()?.join(DIR_NAME))
}

pub fn dir(root: &Path, bot_id: &str) -> PathBuf {
	let plugins = root.join(PLUGINS_DIR);
	held_dir(&plugins, bot_id).unwrap_or_else(|| plugins.join(bot_id))
}

fn held_dir(plugins: &Path, bot_id: &str) -> Option<PathBuf> {
	let by_id = plugins.join(bot_id);
	if by_id.is_dir() {
		return Some(by_id);
	}
	let suffix = format!("-{}", stamp(bot_id));
	fs::read_dir(plugins).ok()?.flatten().find_map(|entry| {
		let path = entry.path();
		let named = entry.file_name().to_string_lossy().ends_with(&suffix);
		(named && path.is_dir()).then_some(path)
	})
}

pub fn dir_name(bot: &Bot) -> String {
	format!("{}-{}", slug(&bot.name), stamp(&bot.id))
}

fn stamp(bot_id: &str) -> String {
	bot_id.chars().take(STAMP_LENGTH).collect()
}

fn settled(root: &Path, bot: &Bot) {
	let held = dir(root, &bot.id);
	let target = root.join(PLUGINS_DIR).join(dir_name(bot));
	if held == target || target.exists() {
		return;
	}
	if held.is_dir() {
		let _ = fs::rename(held, &target);
		return;
	}
	let _ = private_files::create_dir(&target);
}

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

pub fn agent_ref(bot: &Bot) -> String {
	format!("{}:{AGENT_NAME}", dir_name(bot))
}

fn generated_agent(root: &Path, bot_id: &str) -> Option<PathBuf> {
	fs::read_dir(dir(root, bot_id).join(AGENTS_DIR)).ok()?.flatten().find_map(|entry| {
		let path = entry.path();
		let text = fs::read_to_string(&path).ok()?;
		(marked_bot_id(&text)? == bot_id).then_some(path)
	})
}

pub fn marketplace_file(root: &Path) -> PathBuf {
	root.join(MANIFEST_DIR).join(MARKETPLACE_NAME)
}

pub fn agent_file(root: &Path, bot_id: &str) -> Option<PathBuf> {
	generated_agent(root, bot_id)
}

pub fn settings_file(root: &Path, bot_id: &str) -> Option<PathBuf> {
	let path = settings_path(root, bot_id);
	if !path.is_file() {
		return None;
	}
	forget_directories(&path);
	Some(path)
}

fn forget_directories(path: &Path) {
	let mut kept = object_at(path);
	let Some(serde_json::Value::Object(declared)) = kept.get_mut(PERMISSIONS_KEY) else {
		return;
	};
	if declared.remove(DIRECTORIES_KEY).is_none() {
		return;
	}
	let _ = private_files::replace(path, serde_json::Value::Object(kept).to_string().as_bytes());
}

fn settings_path(root: &Path, bot_id: &str) -> PathBuf {
	dir(root, bot_id).join(SETTINGS_NAME)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BotPermissions {
	pub default_mode: String,
	pub allow: Vec<String>,
	pub ask: Vec<String>,
	pub deny: Vec<String>,
}

impl Default for BotPermissions {
	fn default() -> Self {
		Self::unruled(false)
	}
}

impl BotPermissions {
	pub fn unruled(denies_changes: bool) -> Self {
		Self {
			default_mode: AUTO_MODE.to_owned(),
			allow: Vec::new(),
			ask: Vec::new(),
			deny: if denies_changes {
				CHANGING_TOOLS.map(str::to_owned).to_vec()
			} else {
				Vec::new()
			},
		}
	}

	pub fn unruled_like(denied_tools: &[String]) -> Self {
		Self::unruled(denies_changes(denied_tools))
	}

	pub fn accepted(self) -> Self {
		Self { default_mode: accepted_mode(&self.default_mode).to_owned(), ..self }
	}
}

pub fn permissions(root: &Path, bot_id: &str) -> Option<BotPermissions> {
	let declared = declared_permissions(&settings_path(root, bot_id))?;
	Some(BotPermissions {
		default_mode: declared_mode(&declared),
		allow: listed(&declared, ALLOW_KEY),
		ask: listed(&declared, ASK_KEY),
		deny: listed(&declared, DENY_KEY),
	})
}

pub fn set_permissions(
	root: &Path,
	bot: &Bot,
	permissions: &BotPermissions,
) -> std::io::Result<()> {
	let _serialised = serialised(&dir(root, &bot.id));
	let path = settings_path(root, &bot.id);
	let mut kept = object_at(&path);
	let mut declared = match kept.remove(PERMISSIONS_KEY) {
		Some(serde_json::Value::Object(held)) => held,
		_ => serde_json::Map::new(),
	};
	declared.insert(DEFAULT_MODE_KEY.to_owned(), accepted_mode(&permissions.default_mode).into());
	declared.remove(DIRECTORIES_KEY);
	for (key, items) in [
		(ALLOW_KEY, &permissions.allow),
		(ASK_KEY, &permissions.ask),
		(DENY_KEY, &permissions.deny),
	] {
		written_list(&mut declared, key, items);
	}
	kept.insert(PERMISSIONS_KEY.to_owned(), serde_json::Value::Object(declared));
	private_files::replace(&path, serde_json::Value::Object(kept).to_string().as_bytes())
}

fn written_list(
	declared: &mut serde_json::Map<String, serde_json::Value>,
	key: &str,
	items: &[String],
) {
	if items.is_empty() {
		declared.remove(key);
	} else {
		declared.insert(key.to_owned(), serde_json::json!(items));
	}
}

fn declared_permissions(path: &Path) -> Option<serde_json::Map<String, serde_json::Value>> {
	match object_at(path).remove(PERMISSIONS_KEY) {
		Some(serde_json::Value::Object(declared)) => Some(declared),
		_ => None,
	}
}

fn declared_mode(declared: &serde_json::Map<String, serde_json::Value>) -> String {
	accepted_mode(
		declared.get(DEFAULT_MODE_KEY).and_then(serde_json::Value::as_str).unwrap_or_default(),
	)
	.to_owned()
}

fn accepted_mode(mode: &str) -> &str {
	if PERMISSION_MODES.contains(&mode) {
		mode
	} else {
		AUTO_MODE
	}
}

fn listed(declared: &serde_json::Map<String, serde_json::Value>, key: &str) -> Vec<String> {
	declared.get(key).and_then(serde_json::Value::as_array).map_or_else(Vec::new, |values| {
		values.iter().filter_map(|value| value.as_str().map(str::to_owned)).collect()
	})
}

pub struct Generated {
	pub instructions: String,
	pub memory: String,
	pub model: Option<String>,
	pub blot: Option<AvatarBlot>,
	pub denied_tools: Vec<String>,
	pub output_style: String,
}

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
		memory: remembered(&text).to_owned(),
		model,
		blot,
		denied_tools,
		output_style,
	})
}

pub fn output_style(root: &Path, bot_id: &str) -> String {
	generated(root, bot_id)
		.map_or_else(|| DEFAULT_OUTPUT_STYLE.to_owned(), |written| written.output_style)
}

fn front_output_style(text: &str) -> String {
	styled(&front_value(text, OUTPUT_STYLE_KEY).unwrap_or_default()).to_owned()
}

pub fn instructions(root: &Path, bot_id: &str) -> Option<String> {
	Some(generated(root, bot_id)?.instructions)
}

pub fn write(root: &Path, bot: &Bot) -> std::io::Result<()> {
	let _serialised = serialised(&dir(root, &bot.id));
	write_serialised(root, bot)
}

fn write_serialised(root: &Path, bot: &Bot) -> std::io::Result<()> {
	write_styled_serialised(root, bot, &output_style(root, &bot.id))
}

pub fn write_styled(root: &Path, bot: &Bot, output_style: &str) -> std::io::Result<()> {
	let _serialised = serialised(&dir(root, &bot.id));
	write_styled_serialised(root, bot, output_style)
}

fn write_styled_serialised(root: &Path, bot: &Bot, output_style: &str) -> std::io::Result<()> {
	write_briefed(
		root,
		bot,
		Written {
			brief: &bot.instructions,
			memory: &kept_memory(root, bot),
			output_style,
			denied: &bot.denied_tools,
		},
	)?;
	settled(root, bot);
	recorded(&dir(root, &bot.id), BOT_SUBJECT, &bot.name, "saved from settings")
		.map_err(unrecorded)?;
	Ok(())
}

pub fn write_remembered(root: &Path, bot: &Bot, memory: &str) -> std::io::Result<()> {
	let bundle = dir(root, &bot.id);
	let _serialised = serialised(&bundle);
	rewrite_agent_holding(root, bot, memory)?;
	recorded(&bundle, BOT_SUBJECT, &bot.name, "memory saved from settings").map_err(unrecorded)?;
	Ok(())
}

pub fn inherit(root: &Path, source_id: &str, bot_id: &str) -> std::io::Result<()> {
	let source = dir(root, source_id);
	let target = dir(root, bot_id);
	let _serialised = serialised_both(&source, &target);
	copied_tree(&source.join(SKILLS_DIR), &target.join(SKILLS_DIR))?;
	copied_tree(&source.join(HOOKS_DIR), &target.join(HOOKS_DIR))?;
	copied_file(&source.join(MCP_NAME), &target.join(MCP_NAME))
}

fn copied_tree(source: &Path, target: &Path) -> std::io::Result<()> {
	if !source.is_dir() {
		return Ok(());
	}
	private_files::create_dir(target)?;
	for entry in fs::read_dir(source)? {
		let entry = entry?;
		let path = entry.path();
		let into = target.join(entry.file_name());
		if path.is_dir() {
			copied_tree(&path, &into)?;
		} else {
			copied_file(&path, &into)?;
		}
	}
	Ok(())
}

fn copied_file(source: &Path, target: &Path) -> std::io::Result<()> {
	if !source.is_file() {
		return Ok(());
	}
	private_files::replace(target, &fs::read(source)?)
}

fn recorded(bundle: &Path, subject: &str, name: &str, verb: &str) -> Result<(), git2::Error> {
	let title = format!("{subject} \"{}\" {verb}", name.trim());
	git::commit(bundle, Author::User, &title, "").map(|_| ())
}

pub(super) fn unrecorded(error: git2::Error) -> std::io::Error {
	std::io::Error::other(error)
}

struct Written<'a> {
	brief: &'a str,
	memory: &'a str,
	output_style: &'a str,
	denied: &'a [String],
}

fn write_briefed(root: &Path, bot: &Bot, written: Written) -> std::io::Result<()> {
	let generated = generated_agent(root, &bot.id);
	let agent_path = agent_path(root, &bot.id);
	let parts = checked_front(&held_agent(generated.as_deref()))?;

	unequip(root, &bot.id);
	rewrite_manifest(root, bot)?;
	private_files::replace(&agent_path, agent(parts, root, bot, written).as_bytes())?;
	if let Some(generated) = generated.filter(|path| path != &agent_path) {
		let _ = fs::remove_file(generated);
	}
	Ok(())
}

fn held_agent(path: Option<&Path>) -> String {
	path.and_then(|path| fs::read_to_string(path).ok()).unwrap_or_default()
}

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

fn generated_hooks(path: &Path) -> bool {
	fs::read_to_string(path).is_ok_and(|text| text.contains(SESSION_START_NAME))
}

fn agent_path(root: &Path, bot_id: &str) -> PathBuf {
	dir(root, bot_id).join(AGENTS_DIR).join(format!("{AGENT_NAME}.{AGENT_EXTENSION}"))
}

pub fn ensure(root: &Path, bot: &Bot) -> std::io::Result<()> {
	let _serialised = serialised(&dir(root, &bot.id));
	settled(root, bot);
	if agent_file(root, &bot.id).is_some() {
		rewrite_agent(root, bot)?;
		recorded(&dir(root, &bot.id), BOT_SUBJECT, &bot.name, "added to the history")
			.map_err(unrecorded)?;
		return Ok(());
	}
	write_serialised(root, bot)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Evolution {
	pub commit_id: String,
	pub title: String,
}

pub fn evolve(root: &Path, bot: &Bot) -> Option<Evolution> {
	let _serialised = serialised(&dir(root, &bot.id));
	evolve_serialised(root, bot)
}

fn evolve_serialised(root: &Path, bot: &Bot) -> Option<Evolution> {
	let bundle = dir(root, &bot.id);
	let changed = git::changes(&bundle);
	if changed.is_empty() {
		return None;
	}
	let _ = rewrite_agent(root, bot);
	let (title, body) =
		learned(&bundle).unwrap_or_else(|| (EVOLVED_TITLE.to_owned(), changed.join("\n")));
	let commit_id = git::commit(&bundle, Author::Bot, &title, &body).ok().flatten()?;
	let _ = fs::remove_file(bundle.join(LEARNED_NAME));
	Some(Evolution { commit_id, title })
}

fn learned(bundle: &Path) -> Option<(String, String)> {
	let text = fs::read_to_string(bundle.join(LEARNED_NAME)).ok()?;
	let (title, body) = text.split_once('\n').unwrap_or((&text, ""));
	let title = title.trim();
	if title.is_empty() {
		return None;
	}
	Some((title.to_owned(), body.trim().to_owned()))
}

pub fn adopted(root: &Path, bot: &Bot) -> Option<String> {
	instructions(root, &bot.id).filter(|found| edited(found, &bot.instructions))
}

pub fn adopted_memory(root: &Path, bot: &Bot) -> Option<String> {
	generated(root, &bot.id).map(|held| held.memory).filter(|found| edited(found, &bot.memory))
}

pub fn edited(found: &str, stored: &str) -> bool {
	found != stored.trim()
}

pub fn reconciled(root: &Path, bot: &Bot, submitted: &str) -> String {
	if submitted != bot.instructions {
		return submitted.to_owned();
	}
	adopted(root, bot).unwrap_or_else(|| bot.instructions.clone())
}

pub fn history(root: &Path, bot_id: &str) -> Result<Vec<HistoryEntry>, git2::Error> {
	history_at(&dir(root, bot_id))
}

pub fn history_at(bundle: &Path) -> Result<Vec<HistoryEntry>, git2::Error> {
	git::history(bundle)
}

pub fn diff(root: &Path, bot_id: &str, commit_id: &str) -> Result<String, git2::Error> {
	diff_at(&dir(root, bot_id), commit_id)
}

pub fn diff_at(bundle: &Path, commit_id: &str) -> Result<String, git2::Error> {
	git::diff(bundle, commit_id)
}

pub fn revert(root: &Path, bot_id: &str, commit_id: &str) -> Result<String, git2::Error> {
	revert_at(&dir(root, bot_id), commit_id)
}

pub fn revert_at(bundle: &Path, commit_id: &str) -> Result<String, git2::Error> {
	let _serialised = serialised(bundle);
	git::revert(bundle, commit_id)
}

pub fn remove(root: &Path, bot_id: &str) {
	let _ = fs::remove_dir_all(dir(root, bot_id));
}

pub fn write_marketplace(root: &Path, bots: &[Bot]) -> std::io::Result<()> {
	let plugins: Vec<serde_json::Value> = bots
		.iter()
		.map(|bot| {
			let named = dir_name(bot);
			serde_json::json!({
				"name": &named,
				"source": format!("./{PLUGINS_DIR}/{named}"),
				"description": describe(bot),
			})
		})
		.collect();
	let listed = serde_json::json!({
		"name": MARKETPLACE,
		"owner": { "name": OWNER },
		"plugins": plugins,
	});
	private_files::replace(&marketplace_file(root), indented_json(&listed).as_bytes())
}

fn describe(bot: &Bot) -> &str {
	if bot.title.trim().is_empty() {
		&bot.name
	} else {
		&bot.title
	}
}

fn manifest(path: &Path, bundle: &Path, bot: &Bot) -> String {
	let mut kept = object_at(path);
	kept.insert("name".to_owned(), dir_name(bot).into());
	kept.insert("version".to_owned(), VERSION.into());
	kept.insert("displayName".to_owned(), bot.name.clone().into());
	kept.insert("description".to_owned(), describe(bot).into());
	declare_servers(&mut kept, bundle);
	indented_json(&serde_json::Value::Object(kept))
}

fn indented_json(value: &serde_json::Value) -> String {
	serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string())
}

fn rewrite_manifest(root: &Path, bot: &Bot) -> std::io::Result<()> {
	let bundle = dir(root, &bot.id);
	let path = manifest_file(&bundle);
	private_files::replace(&path, manifest(&path, &bundle, bot).as_bytes())
}

fn manifest_file(bundle: &Path) -> PathBuf {
	bundle.join(MANIFEST_DIR).join(MANIFEST_NAME)
}

fn declare_servers(kept: &mut serde_json::Map<String, serde_json::Value>, bundle: &Path) {
	if bundle.join(MCP_NAME).is_file() && !kept.contains_key(SERVERS_KEY) {
		kept.insert(SERVERS_KEY.to_owned(), MCP_SOURCE.into());
	}
}

fn rewrite_declared_servers(bundle: &Path) -> std::io::Result<()> {
	let path = manifest_file(bundle);
	let kept = object_at(&path);
	let mut rewritten = kept.clone();
	if bundle.join(MCP_NAME).is_file() {
		declare_servers(&mut rewritten, bundle);
	} else if rewritten.get(SERVERS_KEY).and_then(serde_json::Value::as_str) == Some(MCP_SOURCE) {
		rewritten.remove(SERVERS_KEY);
	}
	if rewritten == kept {
		return Ok(());
	}
	private_files::replace(&path, indented_json(&serde_json::Value::Object(rewritten)).as_bytes())
}

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
	private_files::replace(&path, indented_json(&serde_json::Value::Object(kept)).as_bytes())
}

pub fn held_memory(written: Option<&Generated>, stored: &str) -> String {
	written
		.map(|held| held.memory.clone())
		.filter(|held| !held.is_empty())
		.unwrap_or_else(|| stored.trim().to_owned())
}

fn kept_memory(root: &Path, bot: &Bot) -> String {
	held_memory(generated(root, &bot.id).as_ref(), &bot.memory)
}

fn agent(mut parts: Parts, root: &Path, bot: &Bot, written: Written) -> String {
	parts.front = with_key(&parts.front, &[NAME_KEY], &quoted(AGENT_NAME));
	parts.front = with_key(&parts.front, &[DESCRIPTION_KEY], &quoted(describe(bot)));
	parts.front = keyed_line(&parts.front, MODEL_KEY, &model_value(&bot.model));
	parts.front = keyed_line(&parts.front, COLOR_KEY, &color_value(bot.avatar_blot));
	parts.front = keyed_line(&parts.front, DISALLOWED_KEY, &denial_value(written.denied));
	parts.front = with_key(&parts.front, &[METADATA_KEY, OWNER_KEY], &quoted(&bot.id));
	parts.front = with_key(
		&parts.front,
		&[METADATA_KEY, OPENNEST_KEY, OUTPUT_STYLE_KEY],
		&quoted(styled(written.output_style)),
	);
	parts.body =
		format!("\n{}\n", briefed_with_skills(root, &bot.id, written.brief, written.memory));
	rendered(&parts)
}

fn keyed_line(front: &str, key: &str, value: &str) -> String {
	if value.is_empty() {
		without_key(front, &[key])
	} else {
		with_key(front, &[key], value)
	}
}

fn styled(output_style: &str) -> &str {
	let named = output_style.trim();
	if named.is_empty() {
		DEFAULT_OUTPUT_STYLE
	} else {
		named
	}
}

pub fn identity(bot: &Bot) -> String {
	let name = one_line(&bot.name);
	let title = one_line(&bot.title);
	let named = if title.is_empty() {
		format!("You are {name}.")
	} else {
		format!("You are {name}, {title}.")
	};
	format!("{named}\n{IDENTITY_STANCE}")
}

fn one_line(text: &str) -> String {
	text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn briefed_with_skills(root: &Path, bot_id: &str, brief: &str, memory: &str) -> String {
	let remembered = block(MEMORY_OPEN, memory.trim(), MEMORY_CLOSE);
	let above = paragraphs(&[without_generated(brief), &remembered]);
	paragraphs(&[&above, &carried_skills(root, bot_id, &above)])
}

fn carried_skills(root: &Path, bot_id: &str, above: &str) -> String {
	let level = (deepest_heading(above) + 1).min(MAX_HEADING);
	let bodies: Vec<String> = preloaded(root, bot_id)
		.into_iter()
		.map(|skill| {
			format!("{} {}\n\n{}", "#".repeat(level), skill.name, demoted(&skill.body, level))
		})
		.collect();
	block(CARRIED_OPEN, &bodies.join("\n\n"), CARRIED_CLOSE)
}

fn block(open: &str, body: &str, close: &str) -> String {
	if body.is_empty() {
		return String::new();
	}
	format!("{open}\n\n{body}\n\n{close}")
}

fn paragraphs(parts: &[&str]) -> String {
	parts.iter().filter(|part| !part.is_empty()).copied().collect::<Vec<_>>().join("\n\n")
}

fn preloaded(root: &Path, bot_id: &str) -> Vec<Skill> {
	skills(root, bot_id).into_iter().filter(|skill| skill.is_preloaded).collect()
}

fn skill_dirs(bundle: &Path) -> Vec<PathBuf> {
	let mut directories: Vec<PathBuf> = fs::read_dir(bundle.join(SKILLS_DIR))
		.into_iter()
		.flatten()
		.flatten()
		.map(|entry| entry.path())
		.collect();
	directories.sort();
	directories
}

pub struct Skill {
	pub id: String,
	pub name: String,
	pub description: String,
	pub body: String,
	pub is_preloaded: bool,
	pub is_system: bool,
	pub files: Vec<String>,
	pub front: SkillFront,
}

pub struct SkillDraft {
	pub name: String,
	pub description: String,
	pub body: String,
	pub front: SkillFront,
}

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

pub fn skills(root: &Path, bot_id: &str) -> Vec<Skill> {
	skills_at(&dir(root, bot_id))
}

pub fn skills_at(bundle: &Path) -> Vec<Skill> {
	skill_dirs(bundle).iter().filter_map(|path| read_skill(path)).collect()
}

pub fn is_system_skill(root: &Path, bot_id: &str, skill_id: &str) -> bool {
	skill_dir(&dir(root, bot_id), skill_id)
		.is_ok_and(|path| front_value(&held_skill(&path), SYSTEM_KEY).as_deref() == Some(MARKED))
}

pub fn create_skill(root: &Path, bot: &Bot, draft: &SkillDraft) -> std::io::Result<Skill> {
	let bundle = dir(root, &bot.id);
	let _serialised = serialised(&bundle);
	let path = free_skill_dir(&bundle, &draft.name);
	let skill = written_skill(root, bot, &path, drafted(None, draft)?)?;
	recorded(&bundle, SKILL_SUBJECT, &skill.name, "created from settings").map_err(unrecorded)?;
	Ok(skill)
}

pub fn create_skill_at(bundle: &Path, draft: &SkillDraft) -> std::io::Result<Skill> {
	let _serialised = serialised(bundle);
	let skill = kept_skill(&free_skill_dir(bundle, &draft.name), drafted(None, draft)?)?;
	recorded(bundle, SKILL_SUBJECT, &skill.name, "created from settings").map_err(unrecorded)?;
	Ok(skill)
}

pub fn update_skill(
	root: &Path,
	bot: &Bot,
	skill_id: &str,
	draft: &SkillDraft,
) -> std::io::Result<Skill> {
	let bundle = dir(root, &bot.id);
	let _serialised = serialised(&bundle);
	let path = skill_dir(&bundle, skill_id)?;
	let text = drafted(Some(&held_skill(&path)), draft)?;
	let path = moved_skill_dir(&bundle, path, &draft.name)?;
	let skill = written_skill(root, bot, &path, text)?;
	recorded(&bundle, SKILL_SUBJECT, &skill.name, "updated from settings").map_err(unrecorded)?;
	Ok(skill)
}

pub fn update_skill_at(
	bundle: &Path,
	skill_id: &str,
	draft: &SkillDraft,
) -> std::io::Result<Skill> {
	let _serialised = serialised(bundle);
	let path = skill_dir(bundle, skill_id)?;
	let text = drafted(Some(&held_skill(&path)), draft)?;
	let path = moved_skill_dir(bundle, path, &draft.name)?;
	let skill = kept_skill(&path, text)?;
	recorded(bundle, SKILL_SUBJECT, &skill.name, "updated from settings").map_err(unrecorded)?;
	Ok(skill)
}

pub fn set_skill_preloaded(
	root: &Path,
	bot: &Bot,
	skill_id: &str,
	is_preloaded: bool,
) -> std::io::Result<Skill> {
	let bundle = dir(root, &bot.id);
	let _serialised = serialised(&bundle);
	let path = skill_dir(&bundle, skill_id)?;
	let skill = written_skill(root, bot, &path, marked(&held_skill(&path), is_preloaded)?)?;
	recorded(&bundle, SKILL_SUBJECT, &skill.name, marking(is_preloaded)).map_err(unrecorded)?;
	Ok(skill)
}

pub fn set_skill_preloaded_at(
	bundle: &Path,
	skill_id: &str,
	is_preloaded: bool,
) -> std::io::Result<Skill> {
	let _serialised = serialised(bundle);
	let path = skill_dir(bundle, skill_id)?;
	let skill = kept_skill(&path, marked(&held_skill(&path), is_preloaded)?)?;
	recorded(bundle, SKILL_SUBJECT, &skill.name, marking(is_preloaded)).map_err(unrecorded)?;
	Ok(skill)
}

fn held_skill(path: &Path) -> String {
	fs::read_to_string(path.join(SKILL_NAME)).unwrap_or_default()
}

fn marking(is_preloaded: bool) -> &'static str {
	if is_preloaded {
		"added to the brief from settings"
	} else {
		"taken out of the brief from settings"
	}
}

pub fn remove_skill(root: &Path, bot: &Bot, skill_id: &str) -> std::io::Result<()> {
	let bundle = dir(root, &bot.id);
	let _serialised = serialised(&bundle);
	let name = deleted_skill(&bundle, skill_id)?;
	rewrite_agent(root, bot)?;
	recorded(&bundle, SKILL_SUBJECT, &name, "removed from settings").map_err(unrecorded)?;
	Ok(())
}

pub fn remove_skill_at(bundle: &Path, skill_id: &str) -> std::io::Result<()> {
	let _serialised = serialised(bundle);
	let name = deleted_skill(bundle, skill_id)?;
	recorded(bundle, SKILL_SUBJECT, &name, "removed from settings").map_err(unrecorded)?;
	Ok(())
}

fn deleted_skill(bundle: &Path, skill_id: &str) -> std::io::Result<String> {
	let path = skill_dir(bundle, skill_id)?;
	let name = read_skill(&path).map(|skill| skill.name).unwrap_or_else(|| skill_id.to_owned());
	fs::remove_dir_all(path)?;
	Ok(name)
}

pub struct McpServer {
	pub name: String,
	pub config: serde_json::Value,
}

pub fn mcp_servers(root: &Path, bot_id: &str) -> Vec<McpServer> {
	mcp_servers_at(&dir(root, bot_id))
}

pub fn mcp_servers_at(bundle: &Path) -> Vec<McpServer> {
	declared(&bundle.join(MCP_NAME))
		.into_iter()
		.map(|(name, config)| McpServer { name, config })
		.collect()
}

pub fn set_mcp_server(
	root: &Path,
	bot: &Bot,
	name: &str,
	config: &serde_json::Value,
) -> std::io::Result<McpServer> {
	let bundle = dir(root, &bot.id);
	let _serialised = serialised(&bundle);
	let server = set_mcp_server_at(&bundle, name, config)?;
	rewrite_manifest(root, bot)?;
	recorded(&bundle, SERVER_SUBJECT, name, "saved from settings").map_err(unrecorded)?;
	Ok(server)
}

pub fn set_mcp_server_at(
	bundle: &Path,
	name: &str,
	config: &serde_json::Value,
) -> std::io::Result<McpServer> {
	if !config.is_object() {
		return Err(std::io::Error::new(
			std::io::ErrorKind::InvalidInput,
			"a server configuration must be a JSON object",
		));
	}
	let path = bundle.join(MCP_NAME);
	let mut servers = declared(&path);
	servers.insert(name.to_owned(), config.clone());
	write_servers(&path, servers)?;
	Ok(McpServer { name: name.to_owned(), config: config.clone() })
}

pub fn remove_mcp_server(root: &Path, bot: &Bot, name: &str) -> std::io::Result<()> {
	let bundle = dir(root, &bot.id);
	let _serialised = serialised(&bundle);
	remove_mcp_server_at(&bundle, name)?;
	rewrite_manifest(root, bot)?;
	undeclare_servers(root, bot)?;
	recorded(&bundle, SERVER_SUBJECT, name, "removed from settings").map_err(unrecorded)?;
	Ok(())
}

pub fn remove_mcp_server_at(bundle: &Path, name: &str) -> std::io::Result<()> {
	let path = bundle.join(MCP_NAME);
	let mut servers = declared(&path);
	if servers.remove(name).is_none() {
		return Err(std::io::Error::new(std::io::ErrorKind::NotFound, "no such server"));
	}
	write_servers(&path, servers)
}

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

fn declared(path: &Path) -> serde_json::Map<String, serde_json::Value> {
	match object_at(path).remove(SERVERS_KEY) {
		Some(serde_json::Value::Object(servers)) => servers,
		_ => serde_json::Map::new(),
	}
}

fn object_at(path: &Path) -> serde_json::Map<String, serde_json::Value> {
	fs::read_to_string(path)
		.ok()
		.and_then(|text| serde_json::from_str(&text).ok())
		.unwrap_or_default()
}

fn written_skill(root: &Path, bot: &Bot, path: &Path, text: String) -> std::io::Result<Skill> {
	let skill = kept_skill(path, text)?;
	rewrite_agent(root, bot)?;
	Ok(skill)
}

fn kept_skill(path: &Path, text: String) -> std::io::Result<Skill> {
	private_files::replace(&path.join(SKILL_NAME), text.as_bytes())?;
	read_skill(path).ok_or_else(|| {
		std::io::Error::new(std::io::ErrorKind::NotFound, "the skill was not written")
	})
}

fn rewrite_agent(root: &Path, bot: &Bot) -> std::io::Result<()> {
	rewrite_agent_holding(root, bot, &kept_memory(root, bot))
}

fn rewrite_agent_holding(root: &Path, bot: &Bot, memory: &str) -> std::io::Result<()> {
	let held = generated(root, &bot.id);
	let brief = held.as_ref().map_or(&bot.instructions, |held| &held.instructions);
	let style = held.as_ref().map_or(DEFAULT_OUTPUT_STYLE, |held| held.output_style.as_str());
	let denied = also_denied(bot, held.as_ref());
	write_briefed(root, bot, Written { brief, memory, output_style: style, denied: &denied })
}

fn also_denied(bot: &Bot, held: Option<&Generated>) -> Vec<String> {
	let mut kept = bot.denied_tools.clone();
	kept.extend(held.into_iter().flat_map(|held| held.denied_tools.iter().cloned()));
	kept
}

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
		files: skill_files(path),
		front: read_front(&text),
		id,
	})
}

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

fn skill_files(path: &Path) -> Vec<String> {
	let mut held = Vec::new();
	collect_skill_files(path, Path::new(""), &mut held);
	held.sort();
	held
}

fn collect_skill_files(root: &Path, relative: &Path, held: &mut Vec<String>) {
	for entry in fs::read_dir(root.join(relative)).into_iter().flatten().flatten() {
		let found = relative.join(entry.file_name());
		if entry.file_type().is_ok_and(|kind| kind.is_dir()) {
			collect_skill_files(root, &found, held);
		} else if found != Path::new(SKILL_NAME) {
			held.push(found.to_string_lossy().replace('\\', "/"));
		}
	}
}

fn skill_file_path(held: &Path, relative: &str) -> std::io::Result<PathBuf> {
	let found = Path::new(relative);
	let stays_inside = !relative.is_empty()
		&& found.components().all(|part| matches!(part, Component::Normal(_)))
		&& !links_away(held, found);
	if !stays_inside {
		return Err(std::io::Error::new(
			std::io::ErrorKind::InvalidInput,
			"a skill file path stays inside the skill",
		));
	}
	Ok(held.join(found))
}

fn links_away(held: &Path, relative: &Path) -> bool {
	let mut walked = held.to_path_buf();
	relative.components().any(|part| {
		walked.push(part);
		fs::symlink_metadata(&walked).is_ok_and(|found| found.file_type().is_symlink())
	})
}

pub fn skill_file(
	root: &Path,
	bot_id: &str,
	skill_id: &str,
	relative: &str,
) -> std::io::Result<String> {
	skill_file_at(&dir(root, bot_id), skill_id, relative)
}

pub fn skill_file_at(bundle: &Path, skill_id: &str, relative: &str) -> std::io::Result<String> {
	fs::read_to_string(skill_file_path(&skill_dir(bundle, skill_id)?, relative)?)
}

pub fn write_skill_file(
	root: &Path,
	bot_id: &str,
	skill_id: &str,
	relative: &str,
	text: &str,
) -> std::io::Result<Skill> {
	write_skill_file_at(&dir(root, bot_id), skill_id, relative, text)
}

pub fn write_skill_file_at(
	bundle: &Path,
	skill_id: &str,
	relative: &str,
	text: &str,
) -> std::io::Result<Skill> {
	let _serialised = serialised(bundle);
	let held = skill_dir(bundle, skill_id)?;
	private_files::replace(&skill_file_path(&held, relative)?, text.as_bytes())?;
	recorded(bundle, SKILL_FILE_SUBJECT, relative, "saved from settings").map_err(unrecorded)?;
	read_skill(&held).ok_or_else(|| {
		std::io::Error::new(std::io::ErrorKind::NotFound, "the skill file was not written")
	})
}

pub fn remove_skill_file(
	root: &Path,
	bot_id: &str,
	skill_id: &str,
	relative: &str,
) -> std::io::Result<()> {
	remove_skill_file_at(&dir(root, bot_id), skill_id, relative)
}

pub fn remove_skill_file_at(bundle: &Path, skill_id: &str, relative: &str) -> std::io::Result<()> {
	let _serialised = serialised(bundle);
	fs::remove_file(skill_file_path(&skill_dir(bundle, skill_id)?, relative)?)?;
	recorded(bundle, SKILL_FILE_SUBJECT, relative, "removed from settings").map_err(unrecorded)?;
	Ok(())
}

fn skill_dir(bundle: &Path, skill_id: &str) -> std::io::Result<PathBuf> {
	skill_dirs(bundle)
		.into_iter()
		.find(|path| path.file_name().is_some_and(|name| name == skill_id))
		.ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "no such skill"))
}

fn moved_skill_dir(bundle: &Path, path: PathBuf, name: &str) -> std::io::Result<PathBuf> {
	let held = path.file_name().unwrap_or_default().to_string_lossy().into_owned();
	if holds_slug(&held, name) {
		return Ok(path);
	}
	let target = free_skill_dir(bundle, name);
	fs::rename(&path, &target)?;
	Ok(target)
}

fn holds_slug(directory: &str, name: &str) -> bool {
	let base = slug(name);
	directory == base
		|| directory
			.strip_prefix(&base)
			.and_then(|rest| rest.strip_prefix('-'))
			.is_some_and(|next| next.parse::<u32>().is_ok())
}

fn free_skill_dir(bundle: &Path, name: &str) -> PathBuf {
	let skills = bundle.join(SKILLS_DIR);
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

fn readable(line: &str) -> bool {
	let trimmed = line.trim();
	trimmed.is_empty() || trimmed.starts_with('#') || indent_of(line) > 0 || keyed(trimmed)
}

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

fn with_key(front: &str, path: &[&str], value: &str) -> String {
	let leaf = path.last().copied().unwrap_or_default();
	with_block(front, path, vec![format!("{leaf}: {value}")])
}

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

fn written_front(front: &str, key: &str, value: Option<&serde_json::Value>) -> String {
	match value {
		None => front.to_owned(),
		Some(value) if is_blank(value) => without_key(front, &[key]),
		Some(value) => with_block(front, &[key], yaml_lines(key, value, 0)),
	}
}

fn is_blank(value: &serde_json::Value) -> bool {
	match value {
		serde_json::Value::Null => true,
		serde_json::Value::String(text) => text.is_empty(),
		serde_json::Value::Array(items) => items.is_empty(),
		serde_json::Value::Object(map) => map.is_empty(),
		_ => false,
	}
}

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

fn written_scalar(value: &serde_json::Value) -> String {
	match value {
		serde_json::Value::String(text) => quoted(text),
		serde_json::Value::Null => "null".to_owned(),
		other => other.to_string(),
	}
}

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

fn indented(lines: Vec<String>, indent: usize) -> Vec<String> {
	let pad = " ".repeat(indent);
	lines.into_iter().map(|line| format!("{pad}{line}")).collect()
}

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

fn without_generated(text: &str) -> &str {
	let below = text.split_once(IDENTITY_CLOSE).map_or(text, |(_, brief)| brief);
	let above = below.split_once(MEMORY_OPEN).map_or(below, |(brief, _)| brief);
	above.split_once(CARRIED_OPEN).map_or(above, |(brief, _)| brief).trim()
}

fn remembered(text: &str) -> &str {
	let Some((_, kept)) = below_front(text).split_once(MEMORY_OPEN) else {
		return "";
	};
	let kept = kept.split_once(CARRIED_OPEN).map_or(kept, |(kept, _)| kept);
	kept.split_once(MEMORY_CLOSE).map_or(kept, |(kept, _)| kept).trim()
}

fn deepest_heading(text: &str) -> usize {
	headed_lines(text).filter_map(|(_, level)| level).max().unwrap_or(0)
}

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

fn heading_level(line: &str) -> Option<usize> {
	let level = line.len() - line.trim_start_matches('#').len();
	(level > 0 && line[level..].starts_with(' ')).then_some(level)
}

fn denial_value(denied: &[String]) -> String {
	let named = denials(denied);
	if named.is_empty() {
		return String::new();
	}
	serde_json::json!(named).to_string()
}

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

pub fn denies_changes(denied: &[String]) -> bool {
	CHANGING_TOOLS.iter().all(|tool| denied.iter().any(|named| named == tool))
}

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

fn model_value(model: &str) -> String {
	let named = model.trim();
	if named.is_empty() {
		return String::new();
	}
	quoted(named)
}

fn color_value(blot: Option<AvatarBlot>) -> String {
	blot.map_or_else(String::new, |blot| quoted(blot.named()))
}

fn quoted(value: &str) -> String {
	serde_json::Value::String(value.to_owned()).to_string()
}

fn body(text: &str) -> &str {
	without_generated(below_front(text))
}

fn below_front(text: &str) -> &str {
	split_frontmatter(text).map_or(text, |(_, body)| body)
}

fn split_frontmatter(text: &str) -> Option<(&str, &str)> {
	let rest = text.trim_start().strip_prefix(FENCE)?;
	let (front, closing) = rest.split_once(CLOSING_FENCE)?;
	Some((front, closing.split_once('\n')?.1))
}

fn marked_bot_id(text: &str) -> Option<String> {
	front_value(text, OWNER_KEY)
}

fn front_value(text: &str, key: &str) -> Option<String> {
	let (front, _) = split_frontmatter(text)?;
	front.lines().find_map(|line| {
		let value = line.trim().strip_prefix(key)?.trim_start().strip_prefix(':')?;
		Some(unquoted(value.trim()))
	})
}

fn unquoted(value: &str) -> String {
	serde_json::from_str::<String>(value).unwrap_or_else(|_| value.trim_matches('"').to_owned())
}

fn mapped_lines(front: &str) -> serde_json::Map<String, serde_json::Value> {
	let lines: Vec<String> = front.lines().map(str::to_owned).collect();
	let end = lines.len();
	mapped(&lines, 0, end)
}

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

fn folded(lines: &[String], from: usize, until: usize, is_folded: bool) -> String {
	let until = until.min(lines.len());
	let indent = child_indent(lines, from, until).unwrap_or(0);
	let held: Vec<&str> = lines[from.min(until)..until]
		.iter()
		.map(|line| &line[indent_of(line).min(indent)..])
		.collect();
	held.join(if is_folded { " " } else { "\n" }).trim().to_owned()
}

fn is_sequence(lines: &[String], from: usize, until: usize) -> bool {
	lines[from.min(lines.len())..until.min(lines.len())]
		.iter()
		.find(|line| !line.trim().is_empty())
		.is_some_and(|line| {
			let trimmed = line.trim();
			trimmed == "-" || trimmed.starts_with("- ")
		})
}

fn keyed(text: &str) -> bool {
	if text.starts_with('"') || text.starts_with('\'') || text.starts_with('-') {
		return false;
	}
	text.ends_with(':') || text.split_once(": ").is_some()
}

fn scalar(text: &str) -> serde_json::Value {
	if let Some(held) = text.strip_prefix('\'').and_then(|rest| rest.strip_suffix('\'')) {
		return serde_json::Value::String(held.replace("''", "'"));
	}
	serde_json::from_str(text).unwrap_or_else(|_| serde_json::Value::String(unquoted(text)))
}

fn as_text(value: &serde_json::Value) -> String {
	match value {
		serde_json::Value::String(text) => text.clone(),
		serde_json::Value::Null => String::new(),
		other => other.to_string(),
	}
}

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
			space_id: "personal".to_owned(),
			section_id: None,
			pin_position: None,
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
			permissions: None,
			created_at: 1,
		}
	}

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

	#[test]
	fn a_name_is_reduced_to_something_an_agent_can_be_promoted_under() {
		assert_eq!(slug("Bean"), "bean");
		assert_eq!(slug("Mr. Bean  Jr."), "mr-bean-jr");
		assert_eq!(slug("  "), UNNAMED);
		assert_eq!(slug("🐈"), UNNAMED);
	}

	#[test]
	fn a_written_bundle_is_the_two_files_the_agent_loads() {
		let root = a_root("written");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		let manifest =
			fs::read_to_string(dir(&root, &bot.id).join(MANIFEST_DIR).join(MANIFEST_NAME))
				.expect("the manifest is there");
		assert!(manifest.contains("\"name\": \"bean-b1\""), "got {manifest}");
		assert!(manifest.contains("\"displayName\": \"Bean\""), "got {manifest}");
		assert_eq!(dir(&root, &bot.id).file_name().and_then(|it| it.to_str()), Some("bean-b1"));
		assert_eq!(agent_ref(&bot), "bean-b1:agent");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer briefly."));

		let _ = fs::remove_dir_all(&root);
	}

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

	fn hand_written_front(root: &Path, bot_id: &str, lines: &str) {
		let agent = agent_file(root, bot_id).expect("the agent file is there");
		let opening = format!("{FENCE}\n");
		let edited =
			written_agent(root, bot_id).replacen(&opening, &format!("{opening}{lines}"), 1);
		private_files::replace(&agent, edited.as_bytes()).expect("the hand edit lands");
	}

	#[test]
	fn a_hook_a_bot_writes_into_its_own_front_outlives_a_rewrite() {
		let root = a_root("kept-hooks");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let declared = "hooks:\n  PreToolUse:\n    - matcher: \"Bash\"\n      hooks:\n        - type: \"command\"\n          command: \"echo \\\"held\\\"\"";
		hand_written_front(&root, &bot.id, &format!("{declared}\n"));

		ensure(&root, &bot).expect("the bundle is rewritten");

		let written = written_agent(&root, &bot.id);
		assert!(written.contains(declared), "got {written}");
		assert!(written.contains(&format!("{NAME_KEY}: {}", quoted(AGENT_NAME))), "got {written}");
		assert!(written.contains(&format!("{OWNER_KEY}: {}", quoted(&bot.id))), "got {written}");
		assert!(written.contains(&format!("{DESCRIPTION_KEY}: {}", quoted(&bot.name))));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_tool_a_bot_denies_itself_joins_the_ones_the_reader_denied() {
		let root = a_root("kept-denials");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.denied_tools = vec!["Bash".to_owned()];
		write(&root, &bot).expect("the bundle is written");

		let agent = agent_file(&root, &bot.id).expect("the agent file is there");
		let edited = written_agent(&root, &bot.id).replace(
			&format!("{DISALLOWED_KEY}: [\"Bash\"]"),
			&format!("{DISALLOWED_KEY}: [\"WebFetch\"]"),
		);
		private_files::replace(&agent, edited.as_bytes()).expect("the hand edit lands");

		ensure(&root, &bot).expect("the bundle is rewritten");

		assert_eq!(
			generated(&root, &bot.id).expect("the file is read back").denied_tools,
			vec!["Bash".to_owned(), "WebFetch".to_owned()]
		);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_front_naming_no_key_leaves_the_agent_file_alone() {
		let root = a_root("unreadable-front");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		hand_written_front(&root, &bot.id, "not a key at all\n");
		let held = written_agent(&root, &bot.id);

		ensure(&root, &bot).expect_err("the unreadable front is refused");

		assert_eq!(written_agent(&root, &bot.id), held);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_generated_agent_declares_neither_skills_nor_a_permission_mode() {
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.title = "skills: everything\npermissionMode: bypassPermissions".to_owned();
		let written = agent(
			parts(""),
			Path::new("/nowhere"),
			&bot,
			Written {
				brief: &bot.instructions,
				memory: "",
				output_style: DEFAULT_OUTPUT_STYLE,
				denied: &bot.denied_tools,
			},
		);

		for line in written.lines() {
			assert!(!line.starts_with("skills:"), "got {written}");
			assert!(!line.starts_with("permissionMode:"), "got {written}");
		}
	}

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

	#[test]
	fn a_bot_whose_file_rules_on_nothing_reads_as_unruled_and_the_switch_it_had_becomes_a_denial() {
		let root = a_root("unruled");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		assert_eq!(permissions(&root, &bot.id), None);
		assert_eq!(
			BotPermissions::unruled(true).deny,
			CHANGING_TOOLS.map(str::to_owned).to_vec(),
			"the retired switch reached the deny list as something else"
		);
		assert!(BotPermissions::unruled(false).deny.is_empty());
		assert_eq!(BotPermissions::default(), BotPermissions::unruled(false));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn the_rules_a_file_declares_are_read_back_and_the_mode_it_may_not_ask_for_is_not() {
		let root = a_root("declared");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		private_files::replace(
			&settings_path(&root, &bot.id),
			serde_json::json!({
				"permissions": {
					"defaultMode": "bypassPermissions",
					"allow": ["Read", 7],
					"deny": ["Bash(rm:*)"],
					"additionalDirectories": ["/notes"]
				}
			})
			.to_string()
			.as_bytes(),
		)
		.expect("the settings file is written");

		let read = permissions(&root, &bot.id).expect("the file rules on something");

		assert_eq!(read.default_mode, AUTO_MODE, "a mode nobody may ask for was read back");
		assert_eq!(read.allow, vec!["Read".to_owned()], "a rule that is not text was read back");
		assert!(read.ask.is_empty());
		assert_eq!(read.deny, vec!["Bash(rm:*)".to_owned()]);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn opening_a_session_forgets_the_directories_a_file_still_names() {
		let root = a_root("forgotten");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let path = settings_path(&root, &bot.id);
		private_files::replace(
			&path,
			serde_json::json!({
				"outputStyle": "Concise",
				"permissions": {
					"deny": ["Bash"],
					"additionalDirectories": ["/notes"],
					"whatever": true
				}
			})
			.to_string()
			.as_bytes(),
		)
		.expect("the settings file is written");

		assert_eq!(settings_file(&root, &bot.id), Some(path.clone()));

		let written = object_at(&path);
		assert_eq!(
			written["permissions"]["additionalDirectories"],
			serde_json::Value::Null,
			"a directory the bot named itself outlived the session"
		);
		assert_eq!(written["outputStyle"], serde_json::json!("Concise"));
		assert_eq!(written["permissions"]["deny"], serde_json::json!(["Bash"]));
		assert_eq!(written["permissions"]["whatever"], serde_json::json!(true));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn writing_the_rules_leaves_every_other_key_of_the_file_standing() {
		let root = a_root("ruled");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let path = settings_path(&root, &bot.id);
		private_files::replace(
			&path,
			serde_json::json!({
				"outputStyle": "Concise",
				"permissions": { "deny": ["Bash"], "defaultMode": "plan", "whatever": true }
			})
			.to_string()
			.as_bytes(),
		)
		.expect("the settings file is written");

		let wanted = BotPermissions {
			default_mode: "acceptEdits".to_owned(),
			allow: vec!["Read".to_owned()],
			ask: Vec::new(),
			deny: Vec::new(),
		};
		set_permissions(&root, &bot, &wanted).expect("the rules are written");

		let written = object_at(&path);
		assert_eq!(written["outputStyle"], serde_json::json!("Concise"));
		assert_eq!(written["permissions"]["whatever"], serde_json::json!(true));
		assert_eq!(
			written["permissions"]["deny"],
			serde_json::Value::Null,
			"an emptied list stayed"
		);
		assert_eq!(permissions(&root, &bot.id), Some(wanted));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_mode_the_runtime_would_refuse_is_never_written() {
		let root = a_root("bypassed");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		set_permissions(
			&root,
			&bot,
			&BotPermissions {
				default_mode: "bypassPermissions".to_owned(),
				..BotPermissions::default()
			},
		)
		.expect("the rules are written");

		assert_eq!(
			object_at(&settings_path(&root, &bot.id))["permissions"]["defaultMode"],
			serde_json::json!(AUTO_MODE)
		);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_bot_carries_the_settings_file_lying_at_its_root_and_nothing_when_it_is_missing() {
		let root = a_root("settings");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		assert_eq!(settings_file(&root, &bot.id), None);

		let path = dir(&root, &bot.id).join(SETTINGS_NAME);
		fs::write(&path, "{}").expect("the settings file is written");

		assert_eq!(settings_file(&root, &bot.id), Some(path));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn everything_that_names_no_style_reads_as_the_default_one() {
		let styleless = format!("{FENCE}\nname: \"bean\"\n{FENCE}\n\nA brief.\n");

		assert_eq!(front_output_style(&styleless), DEFAULT_OUTPUT_STYLE);
		assert_eq!(styled("  "), DEFAULT_OUTPUT_STYLE);
		assert_eq!(output_style(&a_root("styleless"), "b1"), DEFAULT_OUTPUT_STYLE);
	}

	#[test]
	fn a_write_leaves_everything_it_did_not_generate_alone() {
		let root = a_root("shared");
		let mut bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		let held = dir(&root, &bot.id);
		let skill = held.join("skills").join("baking").join("SKILL.md");
		let handwritten = held.join(AGENTS_DIR).join("helper.md");
		let servers = held.join(".mcp.json");
		for (path, content) in
			[(&skill, "how to bake"), (&handwritten, "a subagent"), (&servers, "{}")]
		{
			private_files::replace(path, content.as_bytes()).expect("the file is written");
		}

		bot.name = "Fig".to_owned();
		bot.title = "Baker".to_owned();
		write(&root, &bot).expect("the bundle is written again");

		let moved = dir(&root, &bot.id);
		for (path, content) in [
			(skill.strip_prefix(&held).expect("under the bundle"), "how to bake"),
			(handwritten.strip_prefix(&held).expect("under the bundle"), "a subagent"),
			(servers.strip_prefix(&held).expect("under the bundle"), "{}"),
		] {
			assert_eq!(fs::read_to_string(moved.join(path)).ok().as_deref(), Some(content));
		}

		let _ = fs::remove_dir_all(&root);
	}

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
		assert_eq!(kept["name"], "bean-b1");
		assert_eq!(kept["displayName"], "Bean");
		assert_eq!(kept["description"], "Baker");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn an_agent_generated_under_another_name_moves_to_the_one_every_bundle_uses() {
		let root = a_root("moved");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		let agent = agent_path(&root, &bot.id);
		let dropped = agent.with_file_name("bean.md");
		fs::rename(&agent, &dropped).expect("the agent takes the old name");

		write(&root, &bot).expect("the bundle is written again");

		assert!(!dropped.exists(), "the old agent is still there");
		assert_eq!(agent_file(&root, &bot.id).as_ref(), Some(&agent));
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer briefly."));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_renamed_bot_keeps_the_agent_file_it_already_had() {
		let root = a_root("renamed");
		let mut bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let taken = agent_path(&root, &bot.id);

		bot.name = "Fig".to_owned();
		write(&root, &bot).expect("the bundle is written again");

		let agent = agent_path(&root, &bot.id);
		assert!(!taken.exists(), "the bundle stayed under the old name");
		assert_eq!(agent_file(&root, &bot.id).as_ref(), Some(&agent));
		let written = fs::read_to_string(&agent).expect("the agent is there");
		assert!(written.contains("name: \"agent\""), "got {written}");
		assert_eq!(agent_ref(&bot), "fig-b1:agent");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer briefly."));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_body_edited_by_hand_is_adopted_and_never_written_over() {
		let root = a_root("adopted");
		let mut bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		assert_eq!(adopted(&root, &bot), None, "a bundle nobody touched was reported as changed");

		let agent = agent_file(&root, &bot.id).expect("the agent is there");
		rewrite_the_brief(&agent, "Answer only in French.");
		assert_eq!(adopted(&root, &bot).as_deref(), Some("Answer only in French."));

		bot.instructions = reconciled(&root, &bot, "Answer briefly.");
		bot.name = "Fig".to_owned();
		write(&root, &bot).expect("the rename is written");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer only in French."));

		let _ = fs::remove_dir_all(&root);
	}

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

	#[test]
	fn a_brief_saved_with_windows_line_endings_is_read_as_the_body_it_is() {
		let by_hand = "---\r\nname: \"bean\"\r\n---\r\n\r\nAnswer only in French.\r\n";

		assert_eq!(body(by_hand), "Answer only in French.");
		assert_eq!(body("Answer only in French.\r\n"), "Answer only in French.");
	}

	#[test]
	fn a_brief_the_reader_changed_is_what_lands_over_the_file() {
		let root = a_root("reconciled");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		assert_eq!(reconciled(&root, &bot, "Answer at length."), "Answer at length.");
		assert_eq!(reconciled(&root, &bot, "Answer briefly."), "Answer briefly.");

		let _ = fs::remove_dir_all(&root);
	}

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

	fn dropped_skill(root: &Path, bot_id: &str, skill_id: &str) -> PathBuf {
		dir(root, bot_id).join(SKILLS_DIR).join(skill_id).join(SKILL_NAME)
	}

	fn drop_a_skill(root: &Path, bot_id: &str, name: &str, preload: bool, body: &str) -> PathBuf {
		let path = dropped_skill(root, bot_id, name);
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
		assert!(
			dropped_skill(&root, &bot.id, "kneading").is_file(),
			"the unmarked skill was taken off the disk, it was at {}",
			quiet.display()
		);
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer briefly."));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn an_agent_body_opens_on_the_brief_and_carries_no_identity() {
		let root = a_root("identity");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.title = "the baker".to_owned();
		write(&root, &bot).expect("the bundle is written");

		let written = written_agent(&root, &bot.id);
		assert!(written.ends_with("Answer briefly.\n"), "got {written}");
		assert!(!written.contains("You are Bean"), "got {written}");
		assert!(!written.contains("You are not Claude Code"), "got {written}");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer briefly."));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn an_identity_zone_an_older_build_wrote_is_taken_back_out() {
		let root = a_root("unidentified");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let agent = agent_file(&root, &bot.id).expect("the agent file is there");
		rewrite_the_brief(
			&agent,
			&format!("You are somebody else.\n\n{IDENTITY_CLOSE}\n\nAnswer at length."),
		);

		ensure(&root, &bot).expect("the bundle is completed");

		let written = written_agent(&root, &bot.id);
		assert!(!written.contains(IDENTITY_CLOSE), "got {written}");
		assert!(!written.contains("You are somebody else."), "got {written}");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer at length."));
		assert_eq!(adopted(&root, &bot).as_deref(), Some("Answer at length."));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_bot_that_learned_nothing_gets_an_agent_file_without_the_markers() {
		let root = a_root("unlearned");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		let written = written_agent(&root, &bot.id);
		assert!(!written.contains(MEMORY_OPEN), "got {written}");
		assert!(!written.contains(MEMORY_CLOSE), "got {written}");
		assert_eq!(generated(&root, &bot.id).expect("the file reads").memory, "");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn what_the_bot_learned_sits_under_the_brief_and_over_the_carried_skills() {
		let root = a_root("learned");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.memory = "They bake on Sundays.".to_owned();
		drop_a_skill(&root, &bot.id, "baking", true, "Bake at 220 degrees.");
		write(&root, &bot).expect("the bundle is written");

		let written = written_agent(&root, &bot.id);
		let brief = written.find("Answer briefly.").expect("the brief is there");
		let open = written.find(MEMORY_OPEN).expect("the block opens");
		let close = written.find(MEMORY_CLOSE).expect("the block closes");
		let carried = written.find(CARRIED_OPEN).expect("the skills are carried");
		assert!(brief < open && open < close && close < carried, "got {written}");
		assert!(written.contains("They bake on Sundays."), "got {written}");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer briefly."));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_save_from_settings_carries_the_block_the_bot_wrote_over_unchanged() {
		let root = a_root("carried-memory");
		let mut bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let agent = agent_file(&root, &bot.id).expect("the agent file is there");
		rewrite_the_brief(
			&agent,
			&format!("Answer briefly.\n\n{MEMORY_OPEN}\n\nThey bake on Sundays.\n\n{MEMORY_CLOSE}"),
		);

		assert_eq!(adopted_memory(&root, &bot).as_deref(), Some("They bake on Sundays."));
		bot.instructions = "Answer at length.".to_owned();
		write(&root, &bot).expect("the bundle is written again");

		let written = written_agent(&root, &bot.id);
		assert!(written.contains("They bake on Sundays."), "got {written}");
		assert_eq!(written.matches(MEMORY_OPEN).count(), 1, "got {written}");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer at length."));

		bot.memory = "They bake on Sundays.".to_owned();
		assert_eq!(adopted_memory(&root, &bot), None, "an unchanged block was adopted again");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_memory_saved_from_settings_lands_in_the_block_and_clearing_it_empties_it_for_good() {
		let root = a_root("saved-memory");
		let mut bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		write_remembered(&root, &bot, "They bake on Sundays.").expect("the memory is saved");
		let held = generated(&root, &bot.id).expect("the file reads");
		assert_eq!(held.memory, "They bake on Sundays.");
		assert_eq!(held.instructions, "Answer briefly.");

		write_remembered(&root, &bot, "").expect("the memory is cleared");
		let cleared = written_agent(&root, &bot.id);
		assert!(!cleared.contains(MEMORY_OPEN), "got {cleared}");

		bot.instructions = "Answer at length.".to_owned();
		write(&root, &bot).expect("the bundle is written again");
		let saved = written_agent(&root, &bot.id);
		assert!(!saved.contains(MEMORY_OPEN), "got {saved}");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer at length."));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_block_the_bot_left_open_is_read_to_the_end_of_the_body() {
		let root = a_root("unclosed-memory");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let agent = agent_file(&root, &bot.id).expect("the agent file is there");
		rewrite_the_brief(
			&agent,
			&format!("Answer briefly.\n\n{MEMORY_OPEN}\n\nThey bake on Sundays."),
		);

		assert_eq!(
			generated(&root, &bot.id).expect("the file reads").memory,
			"They bake on Sundays."
		);
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer briefly."));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn the_identity_names_the_bot_over_the_stance_the_host_owns() {
		let mut bot = a_bot("Bean", "Answer briefly.");
		assert!(identity(&bot).starts_with("You are Bean.\n"), "got {}", identity(&bot));

		bot.title = "the baker".to_owned();
		let told = identity(&bot);
		assert!(told.starts_with("You are Bean, the baker.\n"), "got {told}");
		assert!(told.contains("You are not Claude Code"), "got {told}");
		assert!(told.contains("plugin, skills, files, sessions"), "got {told}");
		assert!(told.contains("you say so plainly"), "got {told}");
	}

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

	#[test]
	fn a_skill_that_loses_its_mark_or_its_file_is_dropped_on_the_next_write() {
		let root = a_root("dropped");
		let bot = a_bot("Bean", "Answer briefly.");
		drop_a_skill(&root, &bot.id, "baking", true, "Bake at 220 degrees.");
		drop_a_skill(&root, &bot.id, "kneading", true, "Knead for ten minutes.");
		write(&root, &bot).expect("the bundle is written");

		drop_a_skill(&root, &bot.id, "baking", false, "Bake at 220 degrees.");
		let kneading = dropped_skill(&root, &bot.id, "kneading");
		fs::remove_dir_all(kneading.parent().expect("the skill directory")).expect("taken away");
		write(&root, &bot).expect("the bundle is written again");

		let written = written_agent(&root, &bot.id);
		assert!(!written.contains("Bake at 220 degrees."), "got {written}");
		assert!(!written.contains("Knead for ten minutes."), "got {written}");
		assert!(!written.contains("# baking"), "got {written}");
		assert!(!written.contains("# kneading"), "got {written}");

		let _ = fs::remove_dir_all(&root);
	}

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
			front: SkillFront::default(),
		}
	}

	fn written_skill_file(root: &Path, bot_id: &str, skill_id: &str) -> String {
		fs::read_to_string(dropped_skill(root, bot_id, skill_id)).expect("the skill file reads")
	}

	#[test]
	fn a_skill_reports_every_file_its_directory_holds_but_its_own() {
		let root = a_root("skill-files-listed");
		let bot = a_bot("Bean", "Answer briefly.");
		let held = dir(&root, &bot.id).join(SKILLS_DIR).join("baking");
		for (path, text) in [
			(held.join(SKILL_NAME), "---\nname: baking\n---\n\nBake.\n"),
			(held.join("reference").join("crumb.md"), "Open crumb."),
			(held.join("reference").join("deep").join("oven.md"), "Hot."),
			(held.join("scripts").join("proof.sh"), "sleep 1"),
		] {
			private_files::replace(&path, text.as_bytes()).expect("the file lands");
		}

		let listed = skills(&root, &bot.id);

		assert_eq!(
			listed[0].files,
			vec![
				"reference/crumb.md".to_owned(),
				"reference/deep/oven.md".to_owned(),
				"scripts/proof.sh".to_owned(),
			]
		);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_skill_file_is_written_read_back_and_deleted_alone() {
		let root = a_root("skill-files-written");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		create_skill(&root, &bot, &a_draft("Baking", "How to bake.", "Bake."))
			.expect("the skill lands");

		let written =
			write_skill_file(&root, &bot.id, "baking", "reference/crumb.md", "Open crumb.")
				.expect("the file lands");
		assert_eq!(written.name, "Baking");
		assert_eq!(written.files, vec!["reference/crumb.md".to_owned()]);

		write_skill_file(&root, &bot.id, "baking", "scripts/proof.sh", "sleep 1")
			.expect("the file lands");

		assert_eq!(
			skill_file(&root, &bot.id, "baking", "reference/crumb.md").expect("the file reads"),
			"Open crumb."
		);

		remove_skill_file(&root, &bot.id, "baking", "reference/crumb.md")
			.expect("the file is removed");

		assert_eq!(skills(&root, &bot.id)[0].files, vec!["scripts/proof.sh".to_owned()]);
		assert!(skill_file(&root, &bot.id, "baking", "reference/crumb.md").is_err());

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_path_leaving_the_skill_is_refused_and_writes_nothing() {
		let root = a_root("skill-files-refused");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		create_skill(&root, &bot, &a_draft("Baking", "How to bake.", "Bake."))
			.expect("the skill lands");

		for leaving in ["../escaped.md", "/etc/passwd", "reference/../../escaped.md", ""] {
			assert!(skill_file(&root, &bot.id, "baking", leaving).is_err(), "read {leaving}");
			assert!(
				write_skill_file(&root, &bot.id, "baking", leaving, "no").is_err(),
				"wrote {leaving}"
			);
			assert!(
				remove_skill_file(&root, &bot.id, "baking", leaving).is_err(),
				"removed {leaving}"
			);
		}

		assert!(skills(&root, &bot.id)[0].files.is_empty());
		assert!(!dir(&root, &bot.id).join(SKILLS_DIR).join("escaped.md").exists());

		let _ = fs::remove_dir_all(&root);
	}

	#[cfg(unix)]
	#[test]
	fn a_path_resolving_through_a_link_is_refused_and_leaves_the_disk_alone() {
		let root = a_root("skill-files-linked");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		create_skill(&root, &bot, &a_draft("Baking", "How to bake.", "Bake."))
			.expect("the skill lands");
		let outside = root.join("outside");
		private_files::replace(&outside.join("secret.md"), b"Not yours.").expect("the file lands");
		let held = dir(&root, &bot.id).join(SKILLS_DIR).join("baking");
		std::os::unix::fs::symlink(&outside, held.join("reference")).expect("the link lands");

		for linked in ["reference", "reference/secret.md"] {
			assert!(skill_file(&root, &bot.id, "baking", linked).is_err(), "read {linked}");
			assert!(
				write_skill_file(&root, &bot.id, "baking", linked, "no").is_err(),
				"wrote {linked}"
			);
			assert!(
				remove_skill_file(&root, &bot.id, "baking", linked).is_err(),
				"removed {linked}"
			);
		}

		assert_eq!(
			fs::read_to_string(outside.join("secret.md")).expect("the file reads"),
			"Not yours."
		);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_renamed_skill_carries_its_files_to_the_free_slug_of_its_new_name() {
		let root = a_root("skill-renamed");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		create_skill(&root, &bot, &a_draft("Baking", "How to bake.", "Bake."))
			.expect("the skill lands");
		write_skill_file(&root, &bot.id, "baking", "reference/crumb.md", "Open crumb.")
			.expect("the file lands");

		let renamed = update_skill(&root, &bot, "baking", &a_draft("Proofing", "Rise.", "Wait."))
			.expect("the skill is renamed");

		assert_eq!(renamed.id, "proofing");
		assert_eq!(renamed.files, vec!["reference/crumb.md".to_owned()]);
		assert!(!dir(&root, &bot.id).join(SKILLS_DIR).join("baking").exists());
		assert_eq!(
			skill_file(&root, &bot.id, "proofing", "reference/crumb.md").expect("the file reads"),
			"Open crumb."
		);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_renamed_preloaded_skill_is_carried_in_the_agent_under_its_new_name() {
		let root = a_root("skill-renamed-carried");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		create_skill(&root, &bot, &a_draft("Baking", "How to bake.", "Bake."))
			.expect("the skill lands");
		set_skill_preloaded(&root, &bot, "baking", true).expect("the skill is carried");

		update_skill(&root, &bot, "baking", &a_draft("Proofing", "Rise.", "Wait."))
			.expect("the skill is renamed");

		let written = written_agent(&root, &bot.id);
		assert!(written.contains("Proofing"), "got {written}");
		assert!(!written.contains("Baking"), "got {written}");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_skill_kept_under_a_numbered_slug_stays_where_it_is() {
		let root = a_root("skill-numbered");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		create_skill(&root, &bot, &a_draft("Baking", "How to bake.", "First."))
			.expect("the first skill lands");
		let second = create_skill(&root, &bot, &a_draft("Baking", "How to bake.", "Second."))
			.expect("the second skill lands");
		assert_eq!(second.id, "baking-2");

		let updated =
			update_skill(&root, &bot, "baking-2", &a_draft("Baking", "How to.", "Again."))
				.expect("the skill is updated");

		assert_eq!(updated.id, "baking-2");

		let _ = fs::remove_dir_all(&root);
	}

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
		assert_eq!(listed["plugins"][0]["name"], "bean-b1");
		assert_eq!(listed["plugins"][0]["source"], "./plugins/bean-b1");
		assert_eq!(listed["plugins"][1]["name"], "fig-b2");
		assert_eq!(listed["plugins"][1]["source"], "./plugins/fig-b2");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn both_files_the_marketplace_needs_are_written_a_reader_can_follow() {
		let root = a_root("indented");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		write_marketplace(&root, std::slice::from_ref(&bot)).expect("the marketplace is written");

		for path in [marketplace_file(&root), manifest_file(&dir(&root, &bot.id))] {
			let text = fs::read_to_string(&path).expect("the file is there");
			let held: serde_json::Value = serde_json::from_str(&text).expect("the file is json");
			assert_eq!(text, indented_json(&held), "got {text}");
			assert!(text.contains("\n  \""), "got {text}");
		}

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_bundle_still_named_after_the_bot_id_moves_once_and_keeps_its_history() {
		let root = a_root("migrated");
		let bot = a_bot("Bean", "Answer briefly.");
		let legacy = root.join(PLUGINS_DIR).join(&bot.id);
		write_at_legacy_name(&root, &bot);
		let untracked = legacy.join(SKILLS_DIR).join("baking").join("notes.md");
		private_files::replace(&untracked, b"how to bake").expect("the loose file lands");

		ensure(&root, &bot).expect("the bundle is completed");

		let moved = dir(&root, &bot.id);
		assert_eq!(moved, root.join(PLUGINS_DIR).join("bean-b1"));
		assert!(!legacy.exists(), "the bundle stayed under the bot id");
		assert_eq!(
			fs::read_to_string(moved.join(SKILLS_DIR).join("baking").join("notes.md"))
				.ok()
				.as_deref(),
			Some("how to bake")
		);
		assert!(
			titles(&root, &bot.id).iter().any(|title| title.contains("Bean")),
			"the history did not travel"
		);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_bundle_whose_name_is_taken_stays_where_it_is() {
		let root = a_root("taken-name");
		let bot = a_bot("Bean", "Answer briefly.");
		let legacy = root.join(PLUGINS_DIR).join(&bot.id);
		write_at_legacy_name(&root, &bot);
		let squatter = root.join(PLUGINS_DIR).join("bean-b1");
		private_files::replace(&squatter.join("README.md"), b"somebody else").expect("it lands");

		ensure(&root, &bot).expect("the bundle is completed");

		assert_eq!(dir(&root, &bot.id), legacy);
		assert!(agent_file(&root, &bot.id).is_some_and(|path| path.starts_with(&legacy)));
		assert_eq!(
			fs::read_to_string(squatter.join("README.md")).ok().as_deref(),
			Some("somebody else")
		);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_deleted_bot_takes_its_own_bundle_and_nothing_beside_it() {
		let root = a_root("deleted");
		let bot = a_bot("Bean", "Answer briefly.");
		let mut other = a_bot("Fig", "Answer at length.");
		other.id = "b2".to_owned();
		write(&root, &bot).expect("the first bundle is written");
		write(&root, &other).expect("the second bundle is written");

		remove(&root, &bot.id);

		assert!(!root.join(PLUGINS_DIR).join("bean-b1").exists());
		assert!(root.join(PLUGINS_DIR).join("fig-b2").is_dir());

		let _ = fs::remove_dir_all(&root);
	}

	fn write_at_legacy_name(root: &Path, bot: &Bot) {
		write(root, bot).expect("the bundle is written");
		fs::rename(dir(root, &bot.id), root.join(PLUGINS_DIR).join(&bot.id))
			.expect("the bundle takes the old name");
	}

	fn titles(root: &Path, bot_id: &str) -> Vec<String> {
		history(root, bot_id)
			.expect("the history reads")
			.into_iter()
			.map(|entry| entry.title)
			.collect()
	}

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

	#[test]
	fn a_duplicate_inherits_the_bundle_without_the_memory_or_the_history() {
		let root = a_root("inherit");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let source = dir(&root, &bot.id);
		drop_a_skill(&root, &bot.id, "kneading", true, "How to knead.");
		private_files::replace(&source.join(HOOKS_DIR).join("pre.sh"), b"echo figs")
			.expect("the hook lands");
		private_files::replace(&source.join(MCP_NAME), b"{\"mcpServers\":{}}")
			.expect("the servers land");
		private_files::replace(&source.join(LEARNED_NAME), b"Bean likes figs.")
			.expect("the memory lands");

		inherit(&root, &bot.id, "bot-copy").expect("the bundle is inherited");

		let copy = dir(&root, "bot-copy");
		assert!(
			skills(&root, "bot-copy")
				.iter()
				.any(|skill| skill.id == "kneading" && skill.body.contains("How to knead.")),
			"the skill came over"
		);
		assert_eq!(
			fs::read_to_string(copy.join(HOOKS_DIR).join("pre.sh")).expect("the hook came over"),
			"echo figs"
		);
		assert_eq!(
			fs::read_to_string(copy.join(MCP_NAME)).expect("the servers came over"),
			"{\"mcpServers\":{}}"
		);
		assert!(!copy.join(LEARNED_NAME).exists(), "the memory came over");
		assert!(!copy.join(".git").exists(), "the history came over");
		assert!(source.join(LEARNED_NAME).exists(), "the source lost its memory");

		let _ = fs::remove_dir_all(&root);
	}

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

	fn a_bot_writes(root: &Path, bot_id: &str, name: &str, body: &str) {
		let path = dir(root, bot_id).join(SKILLS_DIR).join(name).join(SKILL_NAME);
		let text = format!(
			"{FENCE}\n{NAME_KEY}: {name}\n{DESCRIPTION_KEY}: What {name} is for.\n{PRELOAD_KEY}: {MARKED}\n{FENCE}\n\n{body}\n"
		);
		private_files::replace(&path, text.as_bytes()).expect("the bot's write lands");
	}

	#[test]
	fn a_turn_that_left_the_bundle_alone_records_nothing() {
		let root = a_root("evolve-clean");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		assert_eq!(evolve(&root, &bot), None);
		assert_eq!(titles(&root, &bot.id).len(), 1);

		let _ = fs::remove_dir_all(&root);
	}

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

	#[test]
	fn a_recorded_turn_carries_the_agent_file_the_next_session_starts_on() {
		let root = a_root("evolve-agent");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		a_bot_writes(&root, &bot.id, "figs", "Bean likes figs.");

		evolve(&root, &bot).expect("the turn is recorded");

		assert!(written_agent(&root, &bot.id).contains("Bean likes figs."));
		assert!(git::changes(&dir(&root, &bot.id)).is_empty(), "the bundle is left uncommitted");

		let _ = fs::remove_dir_all(&root);
	}

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

	const AT_ONCE: [&str; 4] = ["figs", "dates", "plums", "pears"];

	fn nothing_prepared(_root: &Path, _bot: &Bot, _label: &str) {}

	#[test]
	fn a_bot_write_and_a_space_skill_write_do_not_wait_on_each_other() {
		let root = a_root("locks-apart");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let elsewhere = a_root("locks-apart-space");
		space::lay_down_at(&elsewhere).expect("the space plugin is laid down");

		let held = serialised(&dir(&root, &bot.id));
		let (written, waited) = std::sync::mpsc::channel();
		let space_path = elsewhere.clone();
		let writer = std::thread::spawn(move || {
			space::create_skill(&space_path, &a_draft("figs", "What it is for.", "How it goes."))
				.expect("the skill is created");
			written.send(()).expect("the write is reported");
		});
		waited
			.recv_timeout(std::time::Duration::from_secs(5))
			.expect("the space write waited on the bot bundle lock");
		drop(held);
		writer.join().expect("the space write ends");

		let _ = fs::remove_dir_all(&root);
		let _ = fs::remove_dir_all(&elsewhere);
	}

	fn commits_at_once(
		root_name: &str,
		prepare: fn(&Path, &Bot, &str),
		act: fn(&Path, &Bot, &str),
	) {
		let root = a_root(root_name);
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		for label in AT_ONCE {
			prepare(&root, &bot, label);
		}
		let before = titles(&root, &bot.id).len();

		let ready = std::sync::Arc::new(std::sync::Barrier::new(AT_ONCE.len()));
		let writers: Vec<_> = AT_ONCE
			.into_iter()
			.map(|label| {
				let root = root.clone();
				let ready = std::sync::Arc::clone(&ready);
				std::thread::spawn(move || {
					ready.wait();
					act(&root, &a_bot("Bean", "Answer briefly."), label)
				})
			})
			.collect();
		for writer in writers {
			writer.join().expect("the write ran");
		}

		assert_eq!(
			titles(&root, &bot.id).len(),
			before + AT_ONCE.len(),
			"{root_name} lost a commit"
		);
		assert!(
			git::changes(&dir(&root, &bot.id)).is_empty(),
			"{root_name} left the bundle uncommitted"
		);

		let _ = fs::remove_dir_all(&root);
	}

	fn a_skill_is_created(root: &Path, bot: &Bot, label: &str) {
		create_skill(root, bot, &a_draft(label, "What it is for.", "How it goes."))
			.expect("the skill is created");
	}

	fn a_skill_file_is_written(root: &Path, bot: &Bot, label: &str) {
		a_skill_is_created(root, bot, label);
		write_skill_file(root, &bot.id, label, "notes.md", label).expect("the file is written");
	}

	#[test]
	fn the_bot_files_saved_at_once_each_reach_the_history() {
		commits_at_once("at-once-write", nothing_prepared, |root, _bot, label| {
			write(root, &a_bot("Bean", label)).expect("the bundle is written");
		});
		commits_at_once("at-once-styled", nothing_prepared, |root, bot, label| {
			write_styled(root, bot, label).expect("the bundle is written");
		});
		commits_at_once("at-once-remembered", nothing_prepared, |root, bot, label| {
			write_remembered(root, bot, label).expect("the memory is written");
		});
		commits_at_once("at-once-ensure", nothing_prepared, |root, _bot, label| {
			let mut bot = a_bot("Bean", "Answer briefly.");
			bot.model = label.to_owned();
			ensure(root, &bot).expect("the bundle is ensured");
		});
	}

	#[test]
	fn the_skills_saved_at_once_each_reach_the_history() {
		commits_at_once("at-once-created", nothing_prepared, a_skill_is_created);
		commits_at_once("at-once-created-at", nothing_prepared, |root, bot, label| {
			create_skill_at(
				&dir(root, &bot.id),
				&a_draft(label, "What it is for.", "How it goes."),
			)
			.expect("the skill is created");
		});
		commits_at_once("at-once-updated", a_skill_is_created, |root, bot, label| {
			update_skill(root, bot, label, &a_draft(label, "What it is for.", "How it now goes."))
				.expect("the skill is updated");
		});
		commits_at_once("at-once-updated-at", a_skill_is_created, |root, bot, label| {
			update_skill_at(
				&dir(root, &bot.id),
				label,
				&a_draft(label, "What it is for.", "How it now goes."),
			)
			.expect("the skill is updated");
		});
		commits_at_once("at-once-preloaded", a_skill_is_created, |root, bot, label| {
			set_skill_preloaded(root, bot, label, true).expect("the skill is marked");
		});
		commits_at_once("at-once-preloaded-at", a_skill_is_created, |root, bot, label| {
			set_skill_preloaded_at(&dir(root, &bot.id), label, true).expect("the skill is marked");
		});
		commits_at_once("at-once-removed", a_skill_is_created, |root, bot, label| {
			remove_skill(root, bot, label).expect("the skill is removed");
		});
		commits_at_once("at-once-removed-at", a_skill_is_created, |root, bot, label| {
			remove_skill_at(&dir(root, &bot.id), label).expect("the skill is removed");
		});
	}

	#[test]
	fn the_skill_files_saved_at_once_each_reach_the_history() {
		commits_at_once("at-once-file", a_skill_is_created, |root, bot, label| {
			write_skill_file(root, &bot.id, label, "notes.md", label).expect("the file is written");
		});
		commits_at_once("at-once-file-at", a_skill_is_created, |root, bot, label| {
			write_skill_file_at(&dir(root, &bot.id), label, "notes.md", label)
				.expect("the file is written");
		});
		commits_at_once("at-once-file-gone", a_skill_file_is_written, |root, bot, label| {
			remove_skill_file(root, &bot.id, label, "notes.md").expect("the file is removed");
		});
		commits_at_once("at-once-file-gone-at", a_skill_file_is_written, |root, bot, label| {
			remove_skill_file_at(&dir(root, &bot.id), label, "notes.md")
				.expect("the file is removed");
		});
	}

	#[test]
	fn the_servers_saved_at_once_each_reach_the_history() {
		commits_at_once("at-once-server", nothing_prepared, |root, bot, label| {
			set_mcp_server(root, bot, label, &serde_json::json!({ "command": label }))
				.expect("the server is saved");
		});
		commits_at_once("at-once-server-gone", a_server_is_saved, |root, bot, label| {
			remove_mcp_server(root, bot, label).expect("the server is removed");
		});
	}

	fn a_server_is_saved(root: &Path, bot: &Bot, label: &str) {
		set_mcp_server(root, bot, label, &serde_json::json!({ "command": label }))
			.expect("the server is saved");
	}

	#[test]
	fn turns_ending_at_once_record_one_commit_for_the_one_that_wrote_it() {
		let root = a_root("evolve-at-once");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		a_bot_writes(&root, &bot.id, "figs", "Bean likes figs.");
		let before = titles(&root, &bot.id).len();

		let ready = std::sync::Arc::new(std::sync::Barrier::new(AT_ONCE.len()));
		let turns: Vec<_> = AT_ONCE
			.into_iter()
			.map(|_| {
				let root = root.clone();
				let ready = std::sync::Arc::clone(&ready);
				std::thread::spawn(move || {
					ready.wait();
					evolve(&root, &a_bot("Bean", "Answer briefly."))
				})
			})
			.collect();
		let recorded: Vec<Evolution> =
			turns.into_iter().filter_map(|turn| turn.join().expect("the turn ran")).collect();

		assert_eq!(recorded.len(), 1, "got {recorded:?}");
		assert_eq!(titles(&root, &bot.id).len(), before + recorded.len());
		assert!(git::changes(&dir(&root, &bot.id)).is_empty(), "the bundle is uncommitted");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_turn_ending_while_a_skill_is_saved_leaves_both_in_the_history() {
		let root = a_root("evolve-and-settings");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		for label in AT_ONCE {
			a_bot_writes(&root, &bot.id, &format!("{label}-learned"), "Bean likes them.");
			let before = titles(&root, &bot.id).len();
			let ready = std::sync::Arc::new(std::sync::Barrier::new(2));
			let turn = std::thread::spawn({
				let root = root.clone();
				let ready = std::sync::Arc::clone(&ready);
				move || {
					ready.wait();
					evolve(&root, &a_bot("Bean", "Answer briefly."))
				}
			});
			let saved = std::thread::spawn({
				let root = root.clone();
				let ready = std::sync::Arc::clone(&ready);
				move || {
					ready.wait();
					create_skill(
						&root,
						&a_bot("Bean", "Answer briefly."),
						&a_draft(&format!("{label}-saved"), "What it is for.", "How it goes."),
					)
					.expect("the skill is created");
				}
			});
			let evolved = usize::from(turn.join().expect("the turn ran").is_some());
			saved.join().expect("the skill was saved");

			assert_eq!(titles(&root, &bot.id).len(), before + evolved + 1, "{label} lost a commit");
			assert!(git::changes(&dir(&root, &bot.id)).is_empty(), "{label} left work behind");
		}

		let _ = fs::remove_dir_all(&root);
	}

	const BULK_SKILLS: usize = 24;
	const BULK_FILES: usize = 96;

	fn a_locked_index(bundle: &Path) {
		private_files::replace(&bundle.join(".git").join("index.lock"), b"")
			.expect("the lock lands");
	}

	fn bulk_label(index: usize) -> String {
		format!("skill-{index}")
	}

	fn a_bulk_tree(root: &Path, bot_id: &str) {
		for index in 0..BULK_SKILLS {
			let label = bulk_label(index);
			a_bot_writes(root, bot_id, &label, "How it goes.");
			let held = dir(root, bot_id).join(SKILLS_DIR).join(&label);
			for file in 0..BULK_FILES {
				fs::write(held.join(format!("note-{file}.md")), b"Notes.").expect("the file lands");
			}
		}
	}

	fn whole_copy_or_none(root: &Path, bot_id: &str, commit_id: &str) {
		let patch = diff(root, bot_id, commit_id).expect("the diff reads");
		let landed = (0..BULK_SKILLS)
			.filter(|index| patch.contains(&format!("{SKILLS_DIR}/{}/", bulk_label(*index))))
			.count();
		assert!(landed == 0 || landed == BULK_SKILLS, "{landed} skills of the copy landed");
	}

	#[test]
	fn a_skill_saved_while_a_bundle_is_inherited_lands_the_whole_copy_or_none_of_it() {
		let root = a_root("inherit-and-save");
		let source_id = "b0";
		a_bulk_tree(&root, source_id);
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		let ready = std::sync::Arc::new(std::sync::Barrier::new(2));
		let copying = std::thread::spawn({
			let (root, source_id, bot_id) = (root.clone(), source_id.to_owned(), bot.id.clone());
			let ready = std::sync::Arc::clone(&ready);
			move || {
				ready.wait();
				inherit(&root, &source_id, &bot_id).expect("the copy lands");
			}
		});
		let saving = std::thread::spawn({
			let root = root.clone();
			let ready = std::sync::Arc::clone(&ready);
			move || {
				ready.wait();
				create_skill(
					&root,
					&a_bot("Bean", "Answer briefly."),
					&a_draft("kneading", "How to knead.", "Ten minutes."),
				)
				.expect("the skill is created");
			}
		});
		copying.join().expect("the copy ran");
		saving.join().expect("the save ran");

		let entry = &history(&root, &bot.id).expect("the history reads")[0];
		assert!(entry.title.contains("kneading"), "got {}", entry.title);
		whole_copy_or_none(&root, &bot.id, &entry.id);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_turn_ending_while_a_bundle_is_inherited_lands_the_whole_copy_or_none_of_it() {
		let root = a_root("inherit-and-evolve");
		let source_id = "b0";
		a_bulk_tree(&root, source_id);
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		a_bot_writes(&root, &bot.id, "learned", "Bean likes them.");

		let ready = std::sync::Arc::new(std::sync::Barrier::new(2));
		let copying = std::thread::spawn({
			let (root, source_id, bot_id) = (root.clone(), source_id.to_owned(), bot.id.clone());
			let ready = std::sync::Arc::clone(&ready);
			move || {
				ready.wait();
				inherit(&root, &source_id, &bot_id).expect("the copy lands");
			}
		});
		let turn = std::thread::spawn({
			let root = root.clone();
			let ready = std::sync::Arc::clone(&ready);
			move || {
				ready.wait();
				evolve(&root, &a_bot("Bean", "Answer briefly."))
			}
		});
		copying.join().expect("the copy ran");
		let evolution = turn.join().expect("the turn ran").expect("the turn is recorded");

		whole_copy_or_none(&root, &bot.id, &evolution.commit_id);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn the_files_saved_while_undos_run_all_reach_the_history() {
		let root = a_root("undo-and-save");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		create_skill(&root, &bot, &a_draft("kneading", "How to knead.", "Ten minutes."))
			.expect("the skill is created");
		a_bulk_tree(&root, &bot.id);
		create_skill(&root, &bot, &a_draft("figs", "What it is for.", "How it goes."))
			.expect("the skill is created");
		let written = history(&root, &bot.id).expect("the history reads");
		let undone = written[0].id.clone();
		let saved = ["one.md", "two.md", "three.md", "four.md"];
		let before = written.len();

		let ready = std::sync::Arc::new(std::sync::Barrier::new(2));
		let saving = std::thread::spawn({
			let (root, bot_id) = (root.clone(), bot.id.clone());
			let ready = std::sync::Arc::clone(&ready);
			move || {
				ready.wait();
				for file in saved {
					write_skill_file(&root, &bot_id, "kneading", file, "Notes.")
						.expect("the file is written");
				}
			}
		});
		let undoing = std::thread::spawn({
			let (root, bot_id) = (root.clone(), bot.id.clone());
			let ready = std::sync::Arc::clone(&ready);
			move || {
				ready.wait();
				revert(&root, &bot_id, &undone).expect("the write is undone");
			}
		});
		saving.join().expect("the save ran");
		undoing.join().expect("the undo ran");

		assert_eq!(titles(&root, &bot.id).len(), before + saved.len() + 1);
		assert!(git::changes(&dir(&root, &bot.id)).is_empty(), "the bundle is left uncommitted");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn two_undos_at_once_both_reach_the_history() {
		let root = a_root("undo-at-once");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		for label in ["figs", "dates"] {
			create_skill(&root, &bot, &a_draft(label, "What it is for.", "How it goes."))
				.expect("the skill is created");
		}
		let written = history(&root, &bot.id).expect("the history reads");
		let undone = [written[0].id.clone(), written[1].id.clone()];
		let before = written.len();

		let ready = std::sync::Arc::new(std::sync::Barrier::new(undone.len()));
		let undoing: Vec<_> = undone
			.into_iter()
			.map(|commit_id| {
				let (root, bot_id) = (root.clone(), bot.id.clone());
				let ready = std::sync::Arc::clone(&ready);
				std::thread::spawn(move || {
					ready.wait();
					revert(&root, &bot_id, &commit_id).expect("the write is undone");
				})
			})
			.collect();
		for undo in undoing {
			undo.join().expect("the undo ran");
		}

		assert_eq!(titles(&root, &bot.id).len(), before + 2);
		assert!(git::changes(&dir(&root, &bot.id)).is_empty(), "the bundle is left uncommitted");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_skill_whose_commit_fails_reports_the_failure() {
		let root = a_root("commit-refused-skill");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		a_locked_index(&dir(&root, &bot.id));

		let refused =
			create_skill(&root, &bot, &a_draft("figs", "What it is for.", "How it goes."));

		assert!(refused.is_err(), "the failed commit was reported as a success");
		let listed: Vec<String> = skills(&root, &bot.id).into_iter().map(|it| it.id).collect();
		assert_eq!(listed, vec!["figs"]);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_skill_file_whose_commit_fails_reports_the_failure() {
		let root = a_root("commit-refused-file");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		create_skill(&root, &bot, &a_draft("figs", "What it is for.", "How it goes."))
			.expect("the skill is created");
		a_locked_index(&dir(&root, &bot.id));

		let refused = write_skill_file(&root, &bot.id, "figs", "notes.md", "Notes.");

		assert!(refused.is_err(), "the failed commit was reported as a success");
		assert_eq!(
			skill_file(&root, &bot.id, "figs", "notes.md").expect("the file reads"),
			"Notes."
		);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_turn_whose_commit_fails_keeps_the_note_on_disk() {
		let root = a_root("evolve-refused");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		a_bot_writes(&root, &bot.id, "figs", "Bean likes figs.");
		private_files::replace(
			&dir(&root, &bot.id).join(LEARNED_NAME),
			b"Bean learned about figs

They said figs, not dates.
",
		)
		.expect("the note lands");
		a_locked_index(&dir(&root, &bot.id));

		assert_eq!(evolve(&root, &bot), None);
		assert!(dir(&root, &bot.id).join(LEARNED_NAME).is_file(), "the note was thrown away");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_turn_that_failed_keeps_its_note_for_the_next_turn() {
		let root = a_root("evolve-refused-then");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		a_bot_writes(&root, &bot.id, "figs", "Bean likes figs.");
		private_files::replace(
			&dir(&root, &bot.id).join(LEARNED_NAME),
			b"Bean learned about figs

They said figs, not dates.
",
		)
		.expect("the note lands");
		a_locked_index(&dir(&root, &bot.id));
		assert_eq!(evolve(&root, &bot), None);
		fs::remove_file(dir(&root, &bot.id).join(".git").join("index.lock"))
			.expect("the lock is lifted");

		let evolution = evolve(&root, &bot).expect("the turn is recorded");

		assert_eq!(evolution.title, "Bean learned about figs");
		let entry = &history(&root, &bot.id).expect("the history reads")[0];
		assert_eq!(entry.body, "They said figs, not dates.");

		let _ = fs::remove_dir_all(&root);
	}

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
