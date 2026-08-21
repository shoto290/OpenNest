import type {
	Bot,
	BotIdentity,
	BotMcpServer,
	BotSkill,
	BotSkillDraft,
	Chat,
	ContextCheckpoint,
	NewAssistantMessage,
	NewTurn,
	NewUserMessage,
	RuntimeSession,
} from "./store-contract"
import type { TerminalCompletion } from "./transcript-contract"
import type { TranscriptPort } from "./transcript-port"

import type { AgentCommand } from "@/lib/agent/contract"

/** The write half of a conversation, on top of the reads so a fake and the real
 * store stay interchangeable. An append answers with the `seq` the store gave the
 * row: the caller never picks its own place in the transcript. */
export type TranscriptStore = TranscriptPort & {
	/** Every bot on the record, oldest first, and nothing seeded on the way: a
	 * launch opens on the roster it finds, so an empty answer is a reader who owns
	 * no bot rather than one the store owes them. `createBot` is the only reason a
	 * bot exists. */
	bots: () => Promise<Bot[]>
	/** A bot and the chat it will be spoken to in, written as one unit: what comes
	 * back is a thread the caller can open straight away. */
	createBot: (identity: BotIdentity) => Promise<Bot>
	/** Who the bot is, replaced whole — a field left out of `identity` is a bot only
	 * half described, not one the store leaves alone. What the bot was told and what
	 * it has said are untouched. */
	updateBot: (id: string, identity: BotIdentity) => Promise<Bot>
	/** The bot, its chat and everything said in it. The last bot goes like any
	 * other, and what is left is the empty state a fresh install opens on. */
	deleteBot: (id: string) => Promise<void>
	/** The picture a bot wears, from the bytes of the file the user picked. The host
	 * validates the bytes themselves, squares them and keeps the result in its own
	 * directory, and answers with the bot carrying a path the asset protocol can
	 * reach. Anything it will not store is refused whole — nothing is written and the
	 * bot keeps the avatar it had.
	 *
	 * Taking a picture off a bot is not here: it is `updateBot` with no
	 * `avatarImagePath`, which is the same write that puts an animal back. */
	setBotAvatarImage: (id: string, bytes: Uint8Array) => Promise<Bot>
	/** Every skill in the bot's bundle, by the directory each lives in. A skill
	 * dropped in by hand is one of them: nothing asks who wrote a file, and a host
	 * with nowhere to keep bundles answers none rather than refusing. */
	botSkills: (botId: string) => Promise<BotSkill[]>
	/** A new skill, written at a directory derived from its name — or beside it, when
	 * something is already there, which is why the answer carries the `id` the store
	 * chose. It is not carried into the bot's prompt until it is marked. */
	createBotSkill: (botId: string, draft: BotSkillDraft) => Promise<BotSkill>
	/** What the skill says, replaced whole. Every key of the file the app does not
	 * own is left where it was: a skill a hand or another tool wrote is edited, never
	 * written again from a template. */
	updateBotSkill: (
		botId: string,
		skillId: string,
		draft: BotSkillDraft,
	) => Promise<BotSkill>
	/** Whether the skill's body is carried into the bot's prompt. Its own write
	 * rather than a field of the draft: this is what the bot was told changing, and
	 * the bot's agent file is laid down again for it. */
	setBotSkillPreloaded: (
		botId: string,
		skillId: string,
		isPreloaded: boolean,
	) => Promise<BotSkill>
	/** The skill, taken away with its own directory and nothing beside it. */
	deleteBotSkill: (botId: string, skillId: string) => Promise<void>
	/** Every MCP server the bot's bundle declares, by the name each is declared
	 * under. A server file a hand wrote is read the same way, and a host with nowhere
	 * to keep bundles answers none rather than refusing. */
	botMcpServers: (botId: string) => Promise<BotMcpServer[]>
	/** The server written under the name given, added or replaced. Every other server
	 * and every key of the file the app does not own stay where they were. A
	 * configuration that is not an object is refused whole and nothing is written. */
	setBotMcpServer: (
		botId: string,
		name: string,
		config: Record<string, unknown>,
	) => Promise<BotMcpServer>
	/** The server taken out of the file, and the rest of it left as it was. The last
	 * one going takes the file with it. */
	deleteBotMcpServer: (botId: string, name: string) => Promise<void>
	/** The slash commands a session announced, held against the bot it answered for.
	 * Replaced whole by every announcement: a command the newest session left out is
	 * one it would refuse, so what is kept is the last list named rather than every
	 * list ever named. A bot the store does not hold is refused — nothing may be kept
	 * for a bot that is not there. */
	recordBotCommands: (botId: string, commands: AgentCommand[]) => Promise<void>
	/** What was last held for the bot. Empty until a session of its own has
	 * announced something, which is a bot that offers no command rather than one the
	 * store owes an answer for. */
	botCommands: (botId: string) => Promise<AgentCommand[]>
	mainChat: (botId: string) => Promise<Chat>
	/** Opens the run a Claude process is about to be started for. The live run it
	 * replaces is rotated by the same call, so a participant is never left with two
	 * of them or with none. `reason` is why that replaced run was left behind, and
	 * `null` only for the first run of a lineage, which replaces nothing. */
	openRuntimeSession: (
		conversationId: string,
		botId: string,
		startedAt: number,
		reason: string | null,
	) => Promise<RuntimeSession>
	/** The id the provider gave the process answering in a run, kept beside that run
	 * and never in place of it: `runtimeSessionId` is this side's name for the run,
	 * `providerSessionId` is Claude's for the process. Written once and only while
	 * the run is live — the same id again is the callback arriving twice, anything
	 * else is refused. */
	recordProviderSession: (
		conversationId: string,
		botId: string,
		runtimeSessionId: string,
		providerSessionId: string,
	) => Promise<void>
	/** Everything a run has to be told to carry on a conversation it never saw,
	 * bounded and composed by the host. The prompt is named rather than sent: it is
	 * already on the record, and reading it from there is what keeps it out of its
	 * own context and at the end of it exactly once. */
	boundedContext: (
		conversationId: string,
		botId: string,
		promptMessageId: string,
	) => Promise<string>
	/** Folds what a context can no longer afford to carry word for word into the
	 * recovery point the next one resumes from. `null` says there was nothing new to
	 * fold, which leaves the previous checkpoint answering for the conversation. */
	captureCheckpoint: (
		conversationId: string,
		botId: string,
		runtimeSessionId: string | null,
		createdAt: number,
	) => Promise<ContextCheckpoint | null>
	startTurn: (turn: NewTurn) => Promise<number>
	completeTurn: (id: string, completedAt: number) => Promise<void>
	appendUserMessage: (message: NewUserMessage) => Promise<number>
	openAssistantMessage: (message: NewAssistantMessage) => Promise<number>
	appendText: (id: string, delta: string) => Promise<void>
	finalizeMessage: (id: string, completion: TerminalCompletion) => Promise<void>
}
