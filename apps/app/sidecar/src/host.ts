import type { EmitFrame } from "./providers/provider"

export type HostRequest = Record<string, unknown> & { subtype: string }

export type HostError = Record<string, unknown> & { kind: string }

export type HostAnswer = {
	requestId?: string
	result?: unknown
	error?: HostError
}

export class HostRefusal extends Error {
	readonly error: HostError

	constructor(error: HostError) {
		super(`the host refused a request: ${error.kind}`)
		this.name = "HostRefusal"
		this.error = error
	}
}

const UNANSWERED = "the session closed before the host answered"

const UNKNOWN_SESSION = "this session holds no channel to the host"

const undeliverable = (detail: string) =>
	new HostRefusal({ kind: "undeliverable", detail })

type Awaiting = {
	resolve: (result: unknown) => void
	reject: (refusal: HostRefusal) => void
}

type Channel = {
	emit: EmitFrame
	awaiting: Map<string, Awaiting>
}

const channels = new Map<string, Channel>()

export const openHostChannel = (
	session: string,
	write: EmitFrame,
): EmitFrame => {
	closeHostChannel(session)
	channels.set(session, { emit: write, awaiting: new Map() })
	return (frame) => {
		write(frame)
		if (frame.type === "closed") {
			closeHostChannel(session)
		}
	}
}

export const askHost = (session: string | undefined, request: HostRequest) =>
	new Promise<unknown>((resolve, reject) => {
		const channel = session ? channels.get(session) : undefined
		if (!channel) {
			reject(undeliverable(UNKNOWN_SESSION))
			return
		}
		const requestId = crypto.randomUUID()
		channel.awaiting.set(requestId, { resolve, reject })
		channel.emit({ type: "host_request", requestId, request })
	})

export const settleHostAnswer = (
	session: string,
	{ requestId, result, error }: HostAnswer,
) => {
	const channel = channels.get(session)
	const held = requestId ? channel?.awaiting.get(requestId) : undefined
	if (!held || !requestId) {
		return
	}
	channel?.awaiting.delete(requestId)
	if (error) {
		held.reject(new HostRefusal(error))
		return
	}
	held.resolve(result)
}

export const closeHostChannel = (session: string) => {
	const channel = channels.get(session)
	channels.delete(session)
	for (const held of channel?.awaiting.values() ?? []) {
		held.reject(undeliverable(UNANSWERED))
	}
}
