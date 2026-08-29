import { describeProvider } from "./describe"
import { describeError } from "./describe-error"
import { readLines } from "./read-lines"

import type {
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
	pluginPath?: string
	systemPluginPath?: string
	userPluginPath?: string
	agent?: string
	identity?: string
	outputStyle?: string
	settingsPath?: string
	appDataDir?: string
	partialMessages?: boolean
	text?: string
	requestId?: string
	decision?: PermissionDecision
	secrets?: Record<string, string>
}

const write = (payload: unknown) => {
	process.stdout.write(`${JSON.stringify(payload)}\n`)
}

const emitter = (session: string) => (frame: SessionFrame) =>
	write({ session, frame })

export const serve = async (requestedId?: string) => {
	const provider = requireProvider(requestedId)
	const opening = new Map<string, Promise<AgentSession | undefined>>()
	const secrets = new Map<string, Record<string, string>>()

	const open = async (command: Command, session: string) => {
		const emit = emitter(session)
		try {
			const opened = await provider.open(
				{
					cwd: command.cwd ?? process.cwd(),
					resume: command.resume,
					pluginPath: command.pluginPath,
					systemPluginPath: command.systemPluginPath,
					userPluginPath: command.userPluginPath,
					agent: command.agent,
					identity: command.identity,
					outputStyle: command.outputStyle,
					settingsPath: command.settingsPath,
					appDataDir: command.appDataDir,
					partialMessages: command.partialMessages ?? false,
					secrets: secrets.get(session),
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
		secrets.delete(session)
	}

	const answerHost = async ({ type, text }: Command) => {
		switch (type) {
			case "check":
				return write({ type, ...(await provider.authenticate()) })
			case "models":
				return write({ type, models: await provider.models().catch(() => []) })
			case "tools":
				return write({ type, tools: await provider.tools().catch(() => []) })
			case "title":
				return write({
					type,
					title: await provider.title(text ?? "").catch(() => null),
				})
		}
	}

	const dispatch = (command: Command) => {
		const session = command.session
		if (!session) {
			void answerHost(command)
			return
		}
		switch (command.type) {
			case "secrets":
				secrets.set(session, command.secrets ?? {})
				return
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
