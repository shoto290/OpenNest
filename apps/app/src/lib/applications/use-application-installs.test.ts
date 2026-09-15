// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { ApplicationInstalled } from "./application-port"
import { createFakeApplicationPort } from "./fake-application-port"
import {
	type ApplicationInstall,
	useApplicationInstalls,
} from "./use-application-installs"

afterEach(cleanup)

const listening = async (
	onInstalled: (install: ApplicationInstall) => void,
) => {
	const port = createFakeApplicationPort()
	const rendered = renderHook(() => useApplicationInstalls(port, onInstalled))
	await act(async () => undefined)
	return { port, rendered }
}

const announced = (
	held: Pick<ApplicationInstalled, "scope"> & Partial<ApplicationInstalled>,
): ApplicationInstalled => ({
	conversationId: "c1",
	application: "linear",
	title: "Linear",
	install: { kind: "oauth" },
	...held,
})

describe("useApplicationInstalls", () => {
	it("hands on an install announced for the user scope", async () => {
		const onInstalled = vi.fn()
		const { port } = await listening(onInstalled)

		act(() => port.announce(announced({ scope: "user" })))

		expect(onInstalled).toHaveBeenCalledWith({
			application: "linear",
			scope: { kind: "user" },
		})
	})

	it("names the space or the companion the install landed in", async () => {
		const onInstalled = vi.fn()
		const { port } = await listening(onInstalled)

		act(() =>
			port.announce(announced({ scope: "space", destinationId: "personal" })),
		)
		act(() =>
			port.announce(announced({ scope: "companion", destinationId: "scribe" })),
		)

		expect(onInstalled.mock.calls.map(([install]) => install.scope)).toEqual([
			{ kind: "space", id: "personal" },
			{ kind: "companion", id: "scribe" },
		])
	})

	it("drops an announcement that names no destination", async () => {
		const onInstalled = vi.fn()
		const { port } = await listening(onInstalled)

		act(() => port.announce(announced({ scope: "space" })))

		expect(onInstalled).not.toHaveBeenCalled()
	})

	it("stops listening once the screen is gone", async () => {
		const onInstalled = vi.fn()
		const { port, rendered } = await listening(onInstalled)

		rendered.unmount()
		await act(async () => undefined)

		expect(port.isListening()).toBe(false)
	})
})
