import { beforeEach, describe, expect, it } from "vitest"

import { createFakeSecretPort, type FakeSecretPort } from "./fake-secret-port"
import type { SecretTarget } from "./secret-port"
import { createSecretsController } from "./secrets-controller"

const SPACE: SecretTarget = {
	spaceId: "space-one",
	botId: null,
	serverName: null,
}

const BOT: SecretTarget = {
	spaceId: "space-one",
	botId: "bot-one",
	serverName: null,
}

const SERVER: SecretTarget = {
	spaceId: "space-one",
	botId: "bot-one",
	serverName: "atlas",
}

const LONE_BOT: SecretTarget = {
	spaceId: null,
	botId: "bot-alone",
	serverName: null,
}

let port: FakeSecretPort

const opened = async (target: SecretTarget) => {
	const controller = createSecretsController(port)
	await controller.open(target)

	return controller
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

const keysOf = (entries: { key: string }[]) => entries.map((entry) => entry.key)

beforeEach(() => {
	port = createFakeSecretPort()
})

describe("createSecretsController", () => {
	it("reads the panel's own scope off the target it opens", async () => {
		expect((await opened(SPACE)).getState().scope).toBe("space")
		expect((await opened(BOT)).getState().scope).toBe("bot")
		expect((await opened(SERVER)).getState().scope).toBe("server")
	})

	it("lists a key the bot holds beside one only its space holds", async () => {
		port.hold(BOT, "space", "SHARED")
		port.hold(BOT, "bot", "OWN")

		const controller = await opened(BOT)

		expect(keysOf(controller.getState().entries)).toEqual(["OWN", "SHARED"])
	})

	it("names the wider owner that serves a key the panel does not hold", async () => {
		port.hold(BOT, "space", "SHARED")

		const controller = await opened(BOT)
		const entry = controller.getState().entries[0]

		expect(entry?.servedBy?.scope).toBe("space")
		expect(entry?.owners.map((owner) => owner.scope)).toEqual(["space"])
	})

	it("serves the narrower value and still names the one it shadows", async () => {
		port.hold(BOT, "space", "SHARED")
		port.hold(BOT, "bot", "SHARED")

		const controller = await opened(BOT)
		const entry = controller.getState().entries[0]

		expect(entry?.servedBy?.scope).toBe("bot")
		expect(entry?.owners.map((owner) => owner.scope)).toEqual(["space", "bot"])
	})

	it("lets a server's own value shadow the bot's and the space's", async () => {
		port.hold(SERVER, "space", "SHARED")
		port.hold(SERVER, "bot", "SHARED")
		port.hold(SERVER, "server", "SHARED")

		const controller = await opened(SERVER)
		const entry = controller.getState().entries[0]

		expect(entry?.servedBy?.scope).toBe("server")
		expect(entry?.owners).toHaveLength(3)
	})

	it("writes a saved value at the panel's own scope and says which", async () => {
		const controller = await opened(SPACE)

		controller.save("SHARED", "sk-space")
		await settled()

		expect(controller.getState().saved).toEqual({ SHARED: "space" })
		expect(port.stored.get("space:space-one/SHARED")).toBe("sk-space")
	})

	it("writes at the server scope from a server panel, sparing the bot's", async () => {
		port.hold(SERVER, "bot", "SHARED")
		const controller = await opened(SERVER)

		controller.save("SHARED", "sk-server")
		await settled()

		expect(controller.getState().saved).toEqual({ SHARED: "server" })
		expect(port.stored.get("bot:bot-one/SHARED")).toBe("value-of-SHARED")
		expect(port.stored.get("server:bot-one:atlas/SHARED")).toBe("sk-server")
	})

	it("names the value that takes over when the narrower one is deleted", async () => {
		port.hold(BOT, "space", "SHARED")
		port.hold(BOT, "bot", "SHARED")
		const controller = await opened(BOT)

		controller.remove("SHARED", "bot")
		await settled()

		expect(controller.getState().tookOver).toEqual({ SHARED: "space" })
		expect(controller.getState().entries[0]?.servedBy?.scope).toBe("space")
	})

	it("names nothing as taking over when the key is gone for good", async () => {
		port.hold(BOT, "bot", "OWN")
		const controller = await opened(BOT)

		controller.remove("OWN", "bot")
		await settled()

		expect(controller.getState().tookOver).toEqual({})
		expect(controller.getState().entries).toEqual([])
	})

	it("deletes at the wider scope a narrower panel points it at", async () => {
		port.hold(BOT, "space", "SHARED")
		const controller = await opened(BOT)

		controller.remove("SHARED", "space")
		await settled()

		expect(controller.getState().entries).toEqual([])
		expect(port.stored.size).toBe(0)
	})

	it("keeps the key and reports the refusal a rejected save leaves", async () => {
		port.hold(BOT, "bot", "OWN")
		const controller = await opened(BOT)

		port.failNext("the store refused")
		controller.save("OWN", "sk-next")
		await settled()

		expect(controller.getState().failures).toEqual({ OWN: "save" })
		expect(controller.getState().saved).toEqual({})
		expect(keysOf(controller.getState().entries)).toEqual(["OWN"])
	})

	it("keeps the key and reports the refusal a rejected delete leaves", async () => {
		port.hold(BOT, "bot", "OWN")
		const controller = await opened(BOT)

		port.failNext("the store refused")
		controller.remove("OWN", "bot")
		await settled()

		expect(controller.getState().failures).toEqual({ OWN: "delete" })
		expect(keysOf(controller.getState().entries)).toEqual(["OWN"])
	})

	it("names no space for a bot that belongs to none", async () => {
		port.hold(LONE_BOT, "bot", "OWN")
		const controller = await opened(LONE_BOT)

		const scopes = controller
			.getState()
			.entries.flatMap((entry) => entry.owners.map((owner) => owner.scope))

		expect(scopes).toEqual(["bot"])
	})

	it("never carries a stored value into the state it publishes", async () => {
		const controller = await opened(BOT)

		controller.save("OWN", "sk-atlas")
		await settled()

		expect(JSON.stringify(controller.getState())).not.toContain("sk-atlas")
	})

	it("asks for a passphrase from whichever panel is open", async () => {
		port.setPassphrase("open sesame")
		port.hold(SPACE, "space", "SHARED")

		const controller = await opened(SPACE)
		expect(controller.getState().needsPassphrase).toBe(true)
		expect(controller.getState().entries).toEqual([])

		controller.unlock("open sesame")
		await settled()

		expect(controller.getState().isReady).toBe(true)
		expect(keysOf(controller.getState().entries)).toEqual(["SHARED"])
	})

	it("keeps asking when the passphrase is refused", async () => {
		port.setPassphrase("open sesame")
		const controller = await opened(BOT)

		controller.unlock("guess")
		await settled()

		expect(controller.getState().isPassphraseRejected).toBe(true)
		expect(controller.getState().needsPassphrase).toBe(true)
	})

	it("lists one owner a server of the bot, the way the store chains them", async () => {
		port.hold(BOT, "bot", "SHARED")
		port.hold(BOT, "server", "SHARED", "atlas")
		port.hold(BOT, "server", "SHARED", "ledger")

		const controller = await opened(BOT)
		const entry = controller.getState().entries[0]

		expect(entry?.owners.map((owner) => owner.server ?? owner.scope)).toEqual([
			"bot",
			"atlas",
			"ledger",
		])
	})

	it("serves the key from a server of the bot, naming which", async () => {
		port.hold(BOT, "space", "SHARED")
		port.hold(BOT, "server", "SHARED", "atlas")

		const controller = await opened(BOT)
		const entry = controller.getState().entries[0]

		expect(entry?.servedBy?.scope).toBe("server")
		expect(entry?.servedBy?.server).toBe("atlas")
	})

	it("serves the widest readable owner when the narrower ones cannot be read", async () => {
		port.hold(BOT, "space", "SHARED")
		port.hold(BOT, "bot", "SHARED")
		port.unreadable.add("bot:bot-one/SHARED")

		const controller = await opened(BOT)
		const entry = controller.getState().entries[0]

		expect(entry?.servedBy?.scope).toBe("space")
		expect(entry?.owners.map((owner) => owner.readable)).toEqual([true, false])
	})

	it("serves nothing when no owner of the key can be read", async () => {
		port.hold(BOT, "bot", "SHARED")
		port.unreadable.add("bot:bot-one/SHARED")

		const controller = await opened(BOT)

		expect(controller.getState().entries[0]?.servedBy).toBeNull()
	})

	it("deletes the value of the server it was told, not the one it opened", async () => {
		port.hold(SERVER, "server", "SHARED", "atlas")
		port.hold(SERVER, "server", "SHARED", "ledger")

		const controller = await opened(SERVER)

		controller.remove("SHARED", "server", "ledger")
		await settled()

		expect(port.stored.has("server:bot-one:atlas/SHARED")).toBe(true)
		expect(port.stored.has("server:bot-one:ledger/SHARED")).toBe(false)
	})

	it("carries the opened server name into the state the panel reads", async () => {
		expect((await opened(SERVER)).getState().server).toBe("atlas")
		expect((await opened(BOT)).getState().server).toBeNull()
	})

	it("says the store could not be read instead of looking merely empty", async () => {
		const failing = {
			...port,
			keys: async () => {
				throw new Error("bot_id is required")
			},
		}
		const controller = createSecretsController(failing)

		await controller.open(BOT)

		expect(controller.getState().loadFailed).toBe(true)
		expect(controller.getState().isReady).toBe(false)
		expect(controller.getState().needsPassphrase).toBe(false)
		expect(controller.getState().target).toEqual(BOT)
	})

	it("clears the read failure once the store answers again", async () => {
		let isBroken = true
		const flaky = {
			...port,
			keys: async (target: SecretTarget) => {
				if (isBroken) throw new Error("bot_id is required")
				return port.keys(target)
			},
		}
		const controller = createSecretsController(flaky)

		await controller.open(BOT)
		expect(controller.getState().loadFailed).toBe(true)

		isBroken = false
		await controller.open(BOT)

		expect(controller.getState().loadFailed).toBe(false)
		expect(controller.getState().isReady).toBe(true)
	})

	it("drops what one target answered when another is opened", async () => {
		port.hold(BOT, "bot", "OWN")
		const controller = await opened(BOT)

		await controller.open(SERVER)

		expect(controller.getState().scope).toBe("server")
		expect(controller.getState().saved).toEqual({})
		expect(controller.getState().tookOver).toEqual({})
	})
})
