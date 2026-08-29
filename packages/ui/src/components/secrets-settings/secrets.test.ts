import { describe, expect, it } from "vitest"

import {
	BLANK_SECRETS,
	readSecretRows,
	type SecretEntry,
	type SecretKeyOwner,
	type SecretsValue,
} from "@workspace/ui/components/secrets-settings/secrets"

const owner = (
	scope: SecretKeyOwner["scope"],
	extra: Partial<SecretKeyOwner> = {},
): SecretKeyOwner => ({ scope, readable: true, ...extra })

const entry = (key: string, owners: SecretKeyOwner[]): SecretEntry => ({
	key,
	owners,
	servedBy: [...owners].reverse().find((held) => held.readable) ?? null,
})

const panel = (
	scope: SecretsValue["scope"],
	entries: SecretEntry[],
	server: string | null = null,
): SecretsValue => ({ ...BLANK_SECRETS, scope, server, entries })

const rowOf = (value: SecretsValue) => readSecretRows(value, [])[0]

describe("readSecretRows", () => {
	it("names the narrower scope that serves a key the open scope also holds", () => {
		const row = rowOf(
			panel("space", [entry("KEY", [owner("space"), owner("bot")])]),
		)

		expect(row?.servedBy).toBe("bot")
		expect(row?.isServedByOwn).toBe(false)
		expect(row?.isHeldByOwn).toBe(true)
	})

	it("names the broader scope it displaces when the open scope serves", () => {
		const row = rowOf(
			panel("bot", [entry("KEY", [owner("space"), owner("bot")])]),
		)

		expect(row?.servedBy).toBe("bot")
		expect(row?.isServedByOwn).toBe(true)
		expect(row?.displaced).toBe("space")
	})

	it("names the broader scope that serves a key the open scope does not hold", () => {
		const row = rowOf(panel("bot", [entry("KEY", [owner("space")])]))

		expect(row?.servedBy).toBe("space")
		expect(row?.isServedByOwn).toBe(false)
		expect(row?.isHeldByOwn).toBe(false)
		expect(row?.displaced).toBeNull()
	})

	it("carries the name of the server that serves the key", () => {
		const row = rowOf(
			panel("bot", [
				entry("KEY", [owner("bot"), owner("server", { server: "atlas" })]),
			]),
		)

		expect(row?.servedBy).toBe("server")
		expect(row?.servedByServer).toBe("atlas")
		expect(row?.displaced).toBe("bot")
	})

	it("tells one server's own value from another server's", () => {
		const entries = [
			entry("KEY", [
				owner("server", { server: "atlas" }),
				owner("server", { server: "ledger" }),
			]),
		]

		const opened = rowOf(panel("server", entries, "ledger"))
		expect(opened?.isServedByOwn).toBe(true)
		expect(opened?.isHeldByOwn).toBe(true)

		const other = rowOf(panel("server", entries, "atlas"))
		expect(other?.isServedByOwn).toBe(false)
		expect(other?.isHeldByOwn).toBe(true)
		expect(other?.servedByServer).toBe("ledger")
	})

	it("asks for a new value when owners hold the key but none can be read", () => {
		const row = rowOf(
			panel("bot", [
				entry("KEY", [
					owner("space", { readable: false }),
					owner("bot", { readable: false }),
				]),
			]),
		)

		expect(row?.state).toBe("unreadable")
		expect(row?.servedBy).toBeNull()
	})

	it("serves the readable owner when a narrower one cannot be read", () => {
		const row = rowOf(
			panel("bot", [
				entry("KEY", [owner("space"), owner("bot", { readable: false })]),
			]),
		)

		expect(row?.state).toBe("stored")
		expect(row?.servedBy).toBe("space")
		expect(row?.isHeldByOwn).toBe(true)
		expect(row?.displaced).toBeNull()
	})

	it("reads a key nothing holds as not set", () => {
		const value = panel("bot", [])

		expect(readSecretRows(value, ["ASKED_FOR"])[0]?.state).toBe("missing")
	})

	it("reads every key as unavailable while the store is not ready", () => {
		const value = {
			...panel("bot", [entry("KEY", [owner("bot")])]),
			isReady: false,
		}

		expect(rowOf(value)?.state).toBe("unavailable")
	})
})
