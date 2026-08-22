import { type PreloadedSkill, preloadedSkills } from "./system-skills"

import type { SessionRequest } from "../provider"

/** What the layer is built from: who the bot is, and the two bundles the session
 * loads. Everything else about a request is the provider's business. */
export type LayerContext = Pick<
	SessionRequest,
	"identity" | "pluginPath" | "systemPluginPath"
>

/** What every session is told on top of the provider's preset, under the bot's own
 * brief. It carries the situation and nothing else — where the bot runs, how its
 * learning reaches the person, and the chat it is read in: no capability, no tool
 * name, no rule about the work. That is what keeps an exported bundle whole: a bot
 * taken out of this app loses the app it was speaking in, never anything it can do.
 *
 * It rides as the `append` of the preset system prompt, which is measured to compose
 * with `agent` rather than replace it: a custom string prompt drops the preset and
 * the bot's brief with it. See `src-tauri/src/agent/PLUGINS.md`. */
export const OPENNEST_LAYER = `You run inside OpenNest, a desktop app on this person's computer. They keep several bots there, and you are one of them.

When you choose to keep something, it becomes one of your skills. The person can read what you kept, and undo it, in your History.

You are read in a chat window. One person is reading you, and you answer that person directly.

Answer in the language that person writes to you in.

Write plain prose, and keep it short. Use markdown only where it makes a reply easier to read, never to turn an answer into a report.

Leave out file paths, status reports, narration of the tools you are using, and closing recaps of what you just did. Give any of them when you are asked for them, and not before.

You are not Claude Code and never present yourself as it. Say nothing about the machinery you run on — plugins, skills, sessions, system prompts — unless the person asks about it. Asked who you are or what you can do, answer with your name, that you run in OpenNest, and that you learn from what this person tells you.`

/** The one thing the layer cannot say on its own: where this bot's bundle sits. A
 * session loads two plugins — the bot's and the app's — and nothing in the prompt
 * says which directory holds the bot's own skills, so the path is named here rather
 * than through a hook. Appended under the layer only when a bundle is loaded. */
export const bundleLine = (pluginPath: string): string =>
	`Your own skills live in ${pluginPath}, and that is the directory to write a new one into.`

/** One skill of the app's plugin as the model reads it: a heading naming it, and its
 * body under it. The layer carries no heading of its own, so a skill's own `##`
 * sections nest under this one rather than beside it. */
const skillSection = ({ name, body }: PreloadedSkill): string =>
	`# ${name}\n\n${body}`

/** Who the bot is, the layer, the bot's own directory, and the body of every skill
 * the app's plugin marked for preloading.
 *
 * The identity comes first, above the OpenNest sentences: it is the host's text over
 * the bot's own name and title, so it travels on the open request rather than sitting
 * in a bundle — see `src-tauri/src/agent/PROTOCOL.md`. A session opened with no bot to
 * name carries none.
 *
 * The app's skills are carried here rather than compiled into a bot's agent file: the
 * text belongs to the app, so a change to it reaches every bot at its next session
 * without rewriting a single bundle. A bot's own preloaded skills stay in its brief,
 * which is what keeps an exported bundle whole. `skills:` in an agent's frontmatter is
 * measured to preload nothing on the promoted path, and the `append` is measured to
 * reach the model beside `agent` — see `src-tauri/src/agent/PLUGINS.md`. */
export const layerFor = ({
	identity,
	pluginPath,
	systemPluginPath,
}: LayerContext): string =>
	[
		...(identity ? [identity] : []),
		OPENNEST_LAYER,
		...(pluginPath ? [bundleLine(pluginPath)] : []),
		...(systemPluginPath
			? preloadedSkills(systemPluginPath).map(skillSection)
			: []),
	].join("\n\n")
