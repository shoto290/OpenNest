import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createUpdaterController } from "./updater-controller"
import type { AvailableUpdate, UpdaterPort } from "./updater-port"

const SIX_HOURS_MS = 6 * 60 * 60 * 1000

const release = (
	overrides: Partial<AvailableUpdate> = {},
): AvailableUpdate => ({
	version: "0.2.0",
	notes: "Faster launches",
	install: async () => undefined,
	...overrides,
})

const portOf = (check: UpdaterPort["check"]): UpdaterPort => ({ check })

/** Lets whatever the port answered reach the state before it is read. */
const settle = () => Promise.resolve()

describe("createUpdaterController", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("asks the endpoint once when the launch starts", async () => {
		const check = vi.fn(async () => null)
		const controller = createUpdaterController(portOf(check))

		controller.start()
		await settle()

		expect(check).toHaveBeenCalledTimes(1)
		expect(controller.getState()).toEqual({
			available: null,
			progress: null,
			error: null,
		})
	})

	it("exposes what a newer release says about itself", async () => {
		const controller = createUpdaterController(
			portOf(async () => release({ version: "1.4.0", notes: "Notes" })),
		)

		await controller.check()

		expect(controller.getState().available).toEqual({
			version: "1.4.0",
			notes: "Notes",
		})
	})

	it("asks again every six hours", async () => {
		const check = vi.fn(async () => null)
		const controller = createUpdaterController(portOf(check))

		controller.start()
		await vi.advanceTimersByTimeAsync(SIX_HOURS_MS)
		expect(check).toHaveBeenCalledTimes(2)

		await vi.advanceTimersByTimeAsync(SIX_HOURS_MS)
		expect(check).toHaveBeenCalledTimes(3)
	})

	it("stops asking once the launch lets go", async () => {
		const check = vi.fn(async () => null)
		const controller = createUpdaterController(portOf(check))

		const stop = controller.start()
		stop()
		await vi.advanceTimersByTimeAsync(SIX_HOURS_MS * 3)

		expect(check).toHaveBeenCalledTimes(1)
	})

	// The window is already open by then: an endpoint nobody can reach is something
	// the app says, not something it fails to start over.
	it("records an unreachable endpoint without throwing", async () => {
		const controller = createUpdaterController(
			portOf(async () => {
				throw new Error("network unreachable")
			}),
		)

		controller.start()
		await settle()

		expect(controller.getState()).toEqual({
			available: null,
			progress: null,
			error: "network unreachable",
		})
	})

	it("keeps a release a later failed check could not confirm", async () => {
		const port = portOf(async () => release())
		const controller = createUpdaterController(port)

		await controller.check()
		vi.spyOn(port, "check").mockRejectedValue(new Error("offline"))
		await controller.check()

		expect(controller.getState().available).toEqual({
			version: "0.2.0",
			notes: "Faster launches",
		})
		expect(controller.getState().error).toBe("offline")
	})

	it("clears the error once the endpoint answers again", async () => {
		const port = portOf(async () => {
			throw new Error("offline")
		})
		const controller = createUpdaterController(port)

		await controller.check()
		vi.spyOn(port, "check").mockResolvedValue(null)
		await controller.check()

		expect(controller.getState().error).toBeNull()
	})

	it("reports the download as it comes in", async () => {
		const seen: (number | null)[] = []
		const controller = createUpdaterController(
			portOf(async () =>
				release({
					install: async (onProgress) => {
						onProgress({ downloaded: 40, total: 100 })
						onProgress({ downloaded: 100, total: 100 })
					},
				}),
			),
		)
		await controller.check()
		controller.subscribe(() => seen.push(controller.getState().progress))
		await controller.install()

		expect(seen).toEqual([0, 40, 100])
	})

	// A chunk is a fraction of a percent of a release, and the window has nothing to
	// show between two readings that round to the same one.
	it("says nothing for the chunks inside a percent already shown", async () => {
		const seen: (number | null)[] = []
		const controller = createUpdaterController(
			portOf(async () =>
				release({
					install: async (onProgress) => {
						onProgress({ downloaded: 1, total: 1000 })
						onProgress({ downloaded: 2, total: 1000 })
						onProgress({ downloaded: 50, total: 1000 })
					},
				}),
			),
		)

		await controller.check()
		controller.subscribe(() => seen.push(controller.getState().progress))
		await controller.install()

		expect(seen).toEqual([0, 5])
	})

	it("installs nothing when no release was found", async () => {
		const controller = createUpdaterController(portOf(async () => null))

		await controller.check()
		await controller.install()

		expect(controller.getState().progress).toBeNull()
		expect(controller.getState().error).toBeNull()
	})

	it("records a failed install and drops the progress", async () => {
		const controller = createUpdaterController(
			portOf(async () =>
				release({
					install: async () => {
						throw new Error("signature refused")
					},
				}),
			),
		)

		await controller.check()
		await controller.install()

		expect(controller.getState().progress).toBeNull()
		expect(controller.getState().error).toBe("signature refused")
	})

	it("tells its readers only when something changed", async () => {
		const listener = vi.fn()
		const controller = createUpdaterController(portOf(async () => null))
		controller.subscribe(listener)

		await controller.check()
		await controller.check()

		expect(listener).not.toHaveBeenCalled()
	})
})
