import type { AgentEvent, RuntimeScope } from "../agent/contract"
import type { ChatDriver } from "../chat/driver"

export type Submission = {
	scope: RuntimeScope
	prompt: string
}

export type ScriptedDriver = ChatDriver & {
	submissions: Submission[]
	pushTo: (botId: string, events: AgentEvent[]) => void
	cancelled: string[]
}

export const createScriptedDriver = (): ScriptedDriver => {
	const listeners = new Set<
		(scoped: { scope: RuntimeScope; event: AgentEvent }) => void
	>()
	const submissions: Submission[] = []
	const cancelled: string[] = []

	const scopeOf = (botId: string) => {
		const last = submissions.findLast(
			(submission) => submission.scope.botId === botId,
		)
		if (!last) {
			throw new Error(`no run was opened for ${botId}`)
		}
		return last.scope
	}

	return {
		submissions,
		cancelled,
		pushTo: (botId, events) => {
			const scope = scopeOf(botId)
			for (const event of events) {
				for (const listener of listeners) {
					listener({ scope, event })
				}
			}
		},
		check: () =>
			Promise.resolve({
				connection: "ready",
				binaryVersion: "1",
				authenticated: true,
				error: null,
			}),
		titleFor: () => Promise.resolve(null),
		startOrResumeSession: () => Promise.resolve({ resumed: false }),
		submitPrompt: (scope, prompt) => {
			submissions.push({ scope, prompt })
			return Promise.resolve()
		},
		storeAttachments: () => Promise.resolve([]),
		cancelTurn: (scope) => {
			cancelled.push(scope.botId)
			return Promise.resolve()
		},
		respondToPermission: () => Promise.resolve(),
		answerQuestion: () => Promise.resolve(),
		shutdown: () => Promise.resolve(),
		subscribe: (onEvent) => {
			listeners.add(onEvent)
			return Promise.resolve(() => listeners.delete(onEvent))
		},
	}
}

export const spoke = (botId: string, text: string): AgentEvent[] => [
	{
		type: "messageStarted",
		message: {
			id: `msg-${botId}-${text.length}`,
			role: "assistant",
			text: "",
			completion: "streaming",
			timestamp: 1,
		},
	},
	{
		type: "messageDelta",
		id: `msg-${botId}-${text.length}`,
		seq: 1,
		text,
	},
	{ type: "turnEnded", ended: { sessionId: null, outcome: "completed" } },
]
