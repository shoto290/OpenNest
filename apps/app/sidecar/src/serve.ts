import { describeProvider } from "./describe"
import { describeError } from "./describe-error"
import { readLines } from "./read-lines"

import type {
	AgentProvider,
	AgentSession,
	PermissionDecision,
	SessionFrame,
} from "./providers/provider"
import { requireProvider } from "./providers/registry"

type Command = {
	type: string
	session?: string
	cwd?: string
	resume?: string
	appendSystemPrompt?: string
	partialMessages?: boolean
	text?: string
	requestId?: string
	decision?: PermissionDecision
}

const write = (payload: unknown) => {
	process.stdout.write(`${JSON.stringify(payload)}\n`)
}

/** Every session's stream leaves through the same pipe, so every frame names the
 * session it came from. Nothing else tells two runs apart on one process. */
const emitter = (session: string) => (frame: SessionFrame) =>
	write({ session, frame })

/** An empty catalogue rather than a refusal: what to offer instead is the host's to
 * decide, and a provider that names no model is not a broken one. */
const catalogue = async (provider: AgentProvider) => {
	try {
		return await provider.models()
	} catch {
		return []
	}
}

export const serve = async (requestedId?: string) => {
	const provider = requireProvider(requestedId)
	const opening = new Map<string, Promise<AgentSession | undefined>>()

	const open = async (command: Command, session: string) => {
		const emit = emitter(session)
		try {
			const opened = await provider.open(
				{
					cwd: command.cwd ?? process.cwd(),
					resume: command.resume,
					appendSystemPrompt: command.appendSystemPrompt,
					partialMessages: command.partialMessages ?? false,
				},
				emit,
			)
			emit({ type: "opened" })
			return opened
		} catch (error) {
			emit({ type: "closed", detail: describeError(error) })
			return undefined
		}
	}

	const on = (session: string, act: (opened: AgentSession) => void) => {
		const pending = opening.get(session)
		if (!pending) {
			return
		}
		void pending.then((opened) => {
			if (opened) {
				act(opened)
			}
		})
	}

	const close = (session: string) => {
		on(session, (opened) => {
			void opened.close()
		})
		opening.delete(session)
	}

	/** The two asks that belong to the install rather than to a conversation, so
	 * neither names a session and neither is answered inside an envelope. Both are
	 * asked once per launch and cached by the host. */
	const answerHost = async (command: Command) => {
		switch (command.type) {
			case "check":
				return write({ type: "checked", ...(await provider.authenticate()) })
			case "models":
				return write({ type: "catalogue", models: await catalogue(provider) })
		}
	}

	const dispatch = (command: Command) => {
		const session = command.session
		if (!session) {
			void answerHost(command)
			return
		}
		switch (command.type) {
			case "open":
				opening.set(session, open(command, session))
				return
			case "prompt":
				return on(session, (opened) => opened.prompt(command.text ?? ""))
			case "interrupt":
				return on(session, (opened) => {
					void opened.interrupt()
				})
			case "permission":
				return on(session, (opened) => {
					if (command.requestId && command.decision) {
						opened.decide(command.requestId, command.decision)
					}
				})
			case "close":
				return close(session)
		}
	}

	write({ type: "ready", ...describeProvider(provider) })

	for await (const line of readLines()) {
		try {
			dispatch(JSON.parse(line) as Command)
		} catch {
			write({ type: "unreadable" })
		}
	}

	for (const session of [...opening.keys()]) {
		close(session)
	}
}
