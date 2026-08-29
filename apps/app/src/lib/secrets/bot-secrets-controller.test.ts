import { beforeEach, describe, expect, it } from "vitest"

import { createBotSecretsController } from "./bot-secrets-controller"
import { createFakeSecretPort, type FakeSecretPort } from "./fake-secret-port"

let port: FakeSecretPort

const opened = async (hasSpace = false) => {
	const controller = createBotSecretsController(port)
	await controller.open("bot-one", hasSpace)

	return controller
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
	port = createFakeSecretPort()
})

describe("createBotSecretsController", () => {
	it("reads back the keys the opened bot has already answered", async () => {
		await port.set("bot-one", "ATLAS_TOKEN", "sk-atlas", "bot")
		await port.set("bot-two", "LEDGER_TOKEN", "sk-ledger", "bot")

		const controller = await opened()

		expect(controller.getState().filled).toEqual(["ATLAS_TOKEN"])
		expect(controller.getState().isReady).toBe(true)
	})

	it("shows a saved key as filled without ever carrying its value", async () => {
		const controller = await opened()

		controller.save("ATLAS_TOKEN", "sk-atlas", "bot")
		await settled()

		expect(controller.getState().filled).toEqual(["ATLAS_TOKEN"])
		expect(JSON.stringify(controller.getState())).not.toContain("sk-atlas")
		expect(port.stored.get("bot-one/ATLAS_TOKEN")).toBe("sk-atlas")
	})

	it("shows a cleared key as missing again", async () => {
		await port.set("bot-one", "ATLAS_TOKEN", "sk-atlas", "bot")
		const controller = await opened()

		controller.clear("ATLAS_TOKEN", "bot")
		await settled()

		expect(controller.getState().filled).toEqual([])
		expect(port.stored.size).toBe(0)
	})

	it("keeps the key as it was and reports the failure a refused save leaves", async () => {
		await port.set("bot-one", "ATLAS_TOKEN", "sk-atlas", "bot")
		const controller = await opened()

		port.failNext("the store refused")
		controller.save("ATLAS_TOKEN", "sk-next", "bot")
		await settled()

		expect(controller.getState().filled).toEqual(["ATLAS_TOKEN"])
		expect(controller.getState().failures).toEqual({ ATLAS_TOKEN: "save" })
		expect(port.stored.get("bot-one/ATLAS_TOKEN")).toBe("sk-atlas")
	})

	it("keeps the key as it was and reports the failure a refused clear leaves", async () => {
		await port.set("bot-one", "ATLAS_TOKEN", "sk-atlas", "bot")
		const controller = await opened()

		port.failNext("the store refused")
		controller.clear("ATLAS_TOKEN", "bot")
		await settled()

		expect(controller.getState().filled).toEqual(["ATLAS_TOKEN"])
		expect(controller.getState().failures).toEqual({ ATLAS_TOKEN: "clear" })
	})

	it("drops the failure the next attempt on that key opens with", async () => {
		const controller = await opened()

		port.failNext("the store refused")
		controller.save("ATLAS_TOKEN", "sk-atlas", "bot")
		await settled()

		controller.save("ATLAS_TOKEN", "sk-atlas", "bot")
		await settled()

		expect(controller.getState().failures).toEqual({})
		expect(controller.getState().filled).toEqual(["ATLAS_TOKEN"])
	})

	it("refuses every write while the vault is still closed", async () => {
		port.setPassphrase("open sesame")
		const controller = await opened()

		controller.save("ATLAS_TOKEN", "sk-atlas", "bot")
		await settled()

		expect(controller.getState().isReady).toBe(false)
		expect(controller.getState().needsPassphrase).toBe(true)
		expect(controller.getState().filled).toEqual([])
		expect(port.stored.size).toBe(0)
	})

	it("says a vault has yet to be written and says so once one has", async () => {
		port.setPassphrase("open sesame")
		port.setVaultWritten(true)
		const controller = await opened()

		expect(controller.getState().hasVault).toBe(true)
		expect(controller.getState().needsPassphrase).toBe(true)
	})

	it("reads the bot keys back the moment a passphrase opens the vault", async () => {
		await port.set("bot-one", "ATLAS_TOKEN", "sk-atlas", "bot")
		port.setPassphrase("open sesame")
		const controller = await opened()

		controller.unlock("open sesame")
		await settled()

		expect(controller.getState().isReady).toBe(true)
		expect(controller.getState().needsPassphrase).toBe(false)
		expect(controller.getState().filled).toEqual(["ATLAS_TOKEN"])
	})

	it("keeps asking and says so when a passphrase is refused", async () => {
		port.setPassphrase("open sesame")
		const controller = await opened()

		controller.unlock("guess")
		await settled()

		expect(controller.getState().needsPassphrase).toBe(true)
		expect(controller.getState().isPassphraseRejected).toBe(true)
		expect(controller.getState().isUnlocking).toBe(false)
	})

	it("drops the refusal the next attempt opens with", async () => {
		port.setPassphrase("open sesame")
		const controller = await opened()

		controller.unlock("guess")
		await settled()
		controller.unlock("open sesame")
		await settled()

		expect(controller.getState().isPassphraseRejected).toBe(false)
		expect(controller.getState().isReady).toBe(true)
	})

	it("names a key the index holds but the store cannot read apart from the stored ones", async () => {
		await port.set("bot-one", "ATLAS_TOKEN", "sk-atlas", "bot")
		await port.set("bot-one", "ATLAS_REGION", "eu", "bot")
		port.unreadable.add("ATLAS_TOKEN")

		const controller = await opened()

		expect(controller.getState().filled).toEqual(["ATLAS_REGION"])
		expect(controller.getState().unreadable).toEqual(["ATLAS_TOKEN"])
	})

	it("names a key only the space holds apart, as one to inherit", async () => {
		await port.set("bot-one", "ATLAS_REGION", "eu", "bot")
		await port.set("bot-one", "ATLAS_TOKEN", "sk-space", "space")

		const controller = await opened(true)

		expect(controller.getState().filled).toEqual(["ATLAS_REGION"])
		expect(controller.getState().inherited).toEqual(["ATLAS_TOKEN"])
	})

	it("names a key both scopes hold once, under the bot that holds it", async () => {
		await port.set("bot-one", "ATLAS_TOKEN", "sk-bot", "bot")
		await port.set("bot-one", "ATLAS_TOKEN", "sk-space", "space")

		const controller = await opened(true)

		expect(controller.getState().filled).toEqual(["ATLAS_TOKEN"])
		expect(controller.getState().inherited).toEqual([])
	})

	it("names an inherited key the space cannot read back apart from the readable ones", async () => {
		await port.set("bot-one", "ATLAS_TOKEN", "sk-space", "space")
		port.unreadable.add("ATLAS_TOKEN")

		const controller = await opened(true)

		expect(controller.getState().inherited).toEqual([])
		expect(controller.getState().inheritedUnreadable).toEqual(["ATLAS_TOKEN"])
	})

	it("saves at the space scope without touching what the bot holds", async () => {
		await port.set("bot-one", "ATLAS_TOKEN", "sk-bot", "bot")
		const controller = await opened(true)

		controller.save("ATLAS_TOKEN", "sk-space", "space")
		await settled()

		expect(port.stored.get("bot-one/ATLAS_TOKEN")).toBe("sk-bot")
		expect(port.stored.get("space/ATLAS_TOKEN")).toBe("sk-space")
		expect(controller.getState().filled).toEqual(["ATLAS_TOKEN"])
		expect(controller.getState().inherited).toEqual([])
	})

	it("leaves the space value in place when the bot value is cleared", async () => {
		await port.set("bot-one", "ATLAS_TOKEN", "sk-bot", "bot")
		await port.set("bot-one", "ATLAS_TOKEN", "sk-space", "space")
		const controller = await opened(true)

		controller.clear("ATLAS_TOKEN", "bot")
		await settled()

		expect(controller.getState().filled).toEqual([])
		expect(controller.getState().inherited).toEqual(["ATLAS_TOKEN"])
		expect(port.stored.get("space/ATLAS_TOKEN")).toBe("sk-space")
	})

	it("clears an inherited key at the space it comes from", async () => {
		await port.set("bot-one", "ATLAS_TOKEN", "sk-space", "space")
		const controller = await opened(true)

		controller.clear("ATLAS_TOKEN", "space")
		await settled()

		expect(controller.getState().inherited).toEqual([])
		expect(port.stored.size).toBe(0)
	})

	it("carries whether the opened bot sits in a space at all", async () => {
		const alone = await opened()
		expect(alone.getState().hasSpace).toBe(false)

		const inSpace = await opened(true)
		expect(inSpace.getState().hasSpace).toBe(true)
	})

	it("reports the scope a save wrote to, so a shadowed write is never silent", async () => {
		await port.set("bot-one", "ATLAS_TOKEN", "sk-bot", "bot")
		const controller = await opened(true)

		controller.save("ATLAS_TOKEN", "sk-space", "space")
		await settled()

		expect(controller.getState().saved).toEqual({ ATLAS_TOKEN: "space" })
		expect(controller.getState().filled).toEqual(["ATLAS_TOKEN"])
		expect(controller.getState().inherited).toEqual([])
	})

	it("marks a key as shadowed once a save puts a value at the other scope", async () => {
		await port.set("bot-one", "ATLAS_TOKEN", "sk-bot", "bot")
		const controller = await opened(true)

		controller.save("ATLAS_TOKEN", "sk-space", "space")
		await settled()

		expect(controller.getState().shadowed).toEqual(["ATLAS_TOKEN"])
	})

	it("marks a key as shadowed when an inherited row is answered for the bot", async () => {
		await port.set("bot-one", "ATLAS_TOKEN", "sk-space", "space")
		const controller = await opened(true)

		controller.save("ATLAS_TOKEN", "sk-bot", "bot")
		await settled()

		expect(controller.getState().shadowed).toEqual(["ATLAS_TOKEN"])
		expect(controller.getState().saved).toEqual({ ATLAS_TOKEN: "bot" })
	})

	it("leaves a key answered at one scope alone unshadowed", async () => {
		const controller = await opened(true)

		controller.save("ATLAS_TOKEN", "sk-bot", "bot")
		await settled()

		expect(controller.getState().shadowed).toEqual([])
		expect(controller.getState().saved).toEqual({ ATLAS_TOKEN: "bot" })
	})

	it("stops calling a key shadowed once one of the two values is cleared", async () => {
		await port.set("bot-one", "ATLAS_TOKEN", "sk-bot", "bot")
		const controller = await opened(true)

		controller.save("ATLAS_TOKEN", "sk-space", "space")
		await settled()
		controller.clear("ATLAS_TOKEN", "bot")
		await settled()

		expect(controller.getState().shadowed).toEqual([])
		expect(controller.getState().inherited).toEqual(["ATLAS_TOKEN"])
	})

	it("reports nothing saved when the store refuses the write", async () => {
		await port.set("bot-one", "ATLAS_TOKEN", "sk-bot", "bot")
		const controller = await opened(true)

		port.failNext("the store refused")
		controller.save("ATLAS_TOKEN", "sk-space", "space")
		await settled()

		expect(controller.getState().saved).toEqual({})
		expect(controller.getState().shadowed).toEqual([])
		expect(controller.getState().failures).toEqual({ ATLAS_TOKEN: "save" })
	})

	it("drops the report of the last save when the next one starts", async () => {
		const controller = await opened(true)

		controller.save("ATLAS_TOKEN", "sk-bot", "bot")
		await settled()
		controller.save("ATLAS_TOKEN", "sk-next", "bot")

		expect(controller.getState().saved).toEqual({})
	})

	it("carries no scope report for a bot that sits in no space", async () => {
		const controller = await opened()

		controller.save("ATLAS_TOKEN", "sk-bot", "bot")
		await settled()

		expect(controller.getState().hasSpace).toBe(false)
		expect(controller.getState().shadowed).toEqual([])
		expect(controller.getState().inherited).toEqual([])
	})

	it("drops what one bot answered when another is opened", async () => {
		await port.set("bot-one", "ATLAS_TOKEN", "sk-atlas", "bot")
		const controller = await opened()

		await controller.open("bot-two", false)

		expect(controller.getState().botId).toBe("bot-two")
		expect(controller.getState().filled).toEqual([])
		expect(controller.getState().shadowed).toEqual([])
		expect(controller.getState().saved).toEqual({})
	})
})
