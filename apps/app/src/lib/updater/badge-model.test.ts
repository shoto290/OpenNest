import { describe, expect, it } from "vitest"

import { toUpdateBadgeProps } from "./badge-model"
import type { UpdaterState } from "./updater-controller"

const stateOf = (overrides: Partial<UpdaterState> = {}): UpdaterState => ({
	available: null,
	progress: null,
	isRestartPending: false,
	error: null,
	...overrides,
})

const release = { version: "1.4.0", notes: "Faster launches" }

const propsOf = (state: UpdaterState, busyBotCount = 0) =>
	toUpdateBadgeProps({ state, busyBotCount })

describe("toUpdateBadgeProps", () => {
	it("shows nothing while this build is the current one", () => {
		expect(propsOf(stateOf()).status).toBe("idle")
	})

	it("offers a release nothing has started downloading", () => {
		const props = propsOf(stateOf({ available: release }))

		expect(props.status).toBe("available")
		expect(props.version).toBe("1.4.0")
	})

	it("reports the download while it runs", () => {
		const props = propsOf(stateOf({ available: release, progress: 42 }))

		expect(props.status).toBe("downloading")
		expect(props.progress).toBe(42)
	})

	it("asks for a restart once the install has landed", () => {
		const props = propsOf(
			stateOf({ available: release, isRestartPending: true }),
		)

		expect(props.status).toBe("ready")
	})

	it("keeps asking for the restart a later failed check could not confirm", () => {
		const props = propsOf(
			stateOf({
				available: release,
				isRestartPending: true,
				error: "offline",
			}),
		)

		expect(props.status).toBe("ready")
	})

	it("offers the download again when it failed", () => {
		const props = propsOf(
			stateOf({ available: release, error: "signature refused" }),
		)

		expect(props.status).toBe("error")
	})

	it("hands the release notes down a line at a time", () => {
		const props = propsOf(
			stateOf({
				available: {
					version: "1.4.0",
					notes: "- Faster launches\n\n* Fewer crashes\n+ Smaller build\n",
				},
			}),
		)

		expect(props.releaseNotes).toEqual([
			"Faster launches",
			"Fewer crashes",
			"Smaller build",
		])
	})

	it("has no notes to hand down for a release that said nothing", () => {
		const props = propsOf(
			stateOf({ available: { version: "1.4.0", notes: null } }),
		)

		expect(props.releaseNotes).toEqual([])
	})

	it("points at the release the version was published as", () => {
		const props = propsOf(stateOf({ available: release }))

		expect(props.releaseNotesUrl).toBe(
			"https://github.com/shoto290/OpenNest/releases/tag/v1.4.0",
		)
	})

	it("has no release to point at while this build is the current one", () => {
		expect(propsOf(stateOf()).releaseNotesUrl).toBeUndefined()
	})

	it("counts the bots a restart would interrupt", () => {
		const props = propsOf(stateOf({ isRestartPending: true }), 2)

		expect(props.activeBotCount).toBe(2)
	})
})
