import { beforeEach, describe, expect, it } from "vitest"

import { createBotSecretsController } from "./bot-secrets-controller"
import { createFakeSecretPort, type FakeSecretPort } from "./fake-secret-port"

let port: FakeSecretPort

const opened = async () => {
	const controller = createBotSecretsController(port)
	await controller.open("bot-one")

	return controller
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
	port = createFakeSecretPort()
})

describe("createBotSecretsController", () => {
	it("reads back the keys the opened bot has already answered", async () => {
		await port.set("bot-one", "ATLAS_TOKEN", "sk-atlas")
		await port.set("bot-two", "LEDGER_TOKEN", "sk-ledger")

		const controller = await opened()

		expect(controller.getState().filled).toEqual(["ATLAS_TOKEN"])
		expect(controller.getState().isReady).toBe(true)
	})

	it("shows a saved key as filled without ever carrying its value", async () => {
		const controller = await opened()

		controller.save("ATLAS_TOKEN", "sk-atlas")
		await settled()

		expect(controller.getState().filled).toEqual(["ATLAS_TOKEN"])
		expect(JSON.stringify(controller.getState())).not.toContain("sk-atlas")
		expect(port.stored.get("bot-one/ATLAS_TOKEN")).toBe("sk-atlas")
	})

	it("shows a cleared key as missing again", async () => {
		await port.set("bot-one", "ATLAS_TOKEN", "sk-atlas")
		const controller = await opened()

		controller.clear("ATLAS_TOKEN")
		await settled()

		expect(controller.getState().filled).toEqual([])
		expect(port.stored.size).toBe(0)
	})

	it("keeps the key as it was and reports the failure a refused save leaves", async () => {
		await port.set("bot-one", "ATLAS_TOKEN", "sk-atlas")
		const controller = await opened()

		port.failNext("the store refused")
		controller.save("ATLAS_TOKEN", "sk-next")
		await settled()

		expect(controller.getState().filled).toEqual(["ATLAS_TOKEN"])
		expect(controller.getState().failures).toEqual({ ATLAS_TOKEN: "save" })
		expect(port.stored.get("bot-one/ATLAS_TOKEN")).toBe("sk-atlas")
	})

	it("keeps the key as it was and reports the failure a refused clear leaves", async () => {
		await port.set("bot-one", "ATLAS_TOKEN", "sk-atlas")
		const controller = await opened()

		port.failNext("the store refused")
		controller.clear("ATLAS_TOKEN")
		await settled()

		expect(controller.getState().filled).toEqual(["ATLAS_TOKEN"])
		expect(controller.getState().failures).toEqual({ ATLAS_TOKEN: "clear" })
	})

	it("drops the failure the next attempt on that key opens with", async () => {
		const controller = await opened()

		port.failNext("the store refused")
		controller.save("ATLAS_TOKEN", "sk-atlas")
		await settled()

		controller.save("ATLAS_TOKEN", "sk-atlas")
		await settled()

		expect(controller.getState().failures).toEqual({})
		expect(controller.getState().filled).toEqual(["ATLAS_TOKEN"])
	})

	it("refuses every write while the vault is still closed", async () => {
		port.setPassphrase("open sesame")
		const controller = await opened()

		controller.save("ATLAS_TOKEN", "sk-atlas")
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
		await port.set("bot-one", "ATLAS_TOKEN", "sk-atlas")
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
		await port.set("bot-one", "ATLAS_TOKEN", "sk-atlas")
		await port.set("bot-one", "ATLAS_REGION", "eu")
		port.unreadable.add("ATLAS_TOKEN")

		const controller = await opened()

		expect(controller.getState().filled).toEqual(["ATLAS_REGION"])
		expect(controller.getState().unreadable).toEqual(["ATLAS_TOKEN"])
	})

	it("drops what one bot answered when another is opened", async () => {
		await port.set("bot-one", "ATLAS_TOKEN", "sk-atlas")
		const controller = await opened()

		await controller.open("bot-two")

		expect(controller.getState().botId).toBe("bot-two")
		expect(controller.getState().filled).toEqual([])
	})
})
