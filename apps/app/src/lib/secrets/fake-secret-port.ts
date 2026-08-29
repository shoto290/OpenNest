import type { SecretPort } from "./secret-port"

export type FakeSecretPort = SecretPort & {
	stored: Map<string, string>
	setReady: (isReady: boolean) => void
	failNext: (reason: string) => void
}

const held = (botId: string, key: string) => `${botId}/${key}`

export const createFakeSecretPort = (): FakeSecretPort => {
	const stored = new Map<string, string>()
	let isReady = true
	let failure: string | null = null

	const refuseOnce = () => {
		if (!failure) return

		const reason = failure
		failure = null
		throw new Error(reason)
	}

	return {
		stored,

		setReady: (next) => {
			isReady = next
		},

		failNext: (reason) => {
			failure = reason
		},

		isReady: async () => isReady,

		keys: async (botId) =>
			[...stored.keys()]
				.filter((entry) => entry.startsWith(`${botId}/`))
				.map((entry) => entry.slice(botId.length + 1)),

		set: async (botId, key, value) => {
			refuseOnce()
			stored.set(held(botId, key), value)
		},

		delete: async (botId, key) => {
			refuseOnce()
			stored.delete(held(botId, key))
		},
	}
}
