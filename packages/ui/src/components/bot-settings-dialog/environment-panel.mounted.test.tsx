// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { BOT_ENVIRONMENT } from "@workspace/ui/components/bot-settings-dialog/environment.fixtures"
import { EnvironmentPanel } from "@workspace/ui/components/bot-settings-dialog/environment-panel"

import "@workspace/ui/lib/i18n"

const NOTICE = "Variables could not be read"

const panel = (hasFailedToRead: boolean, entries = BOT_ENVIRONMENT) =>
	render(
		<EnvironmentPanel
			entries={entries}
			hasFailedToRead={hasFailedToRead}
			onDelete={() => undefined}
			onSet={() => undefined}
			scope="bot"
		/>,
	)

afterEach(cleanup)

describe("EnvironmentPanel", () => {
	it("keeps the names it holds beside the failure it reports", () => {
		panel(true)

		expect(screen.getByText(NOTICE)).toBeTruthy()
		expect(screen.getByText("BOT_SEED")).toBeTruthy()
	})

	it("says nothing about a failure while the read holds", () => {
		panel(false)

		expect(screen.queryByText(NOTICE)).toBe(null)
		expect(screen.getByText("BOT_SEED")).toBeTruthy()
	})

	it("reports the failure instead of asking for a first variable", () => {
		panel(true, [])

		expect(screen.getByText(NOTICE)).toBeTruthy()
		expect(screen.queryByRole("button", { name: "Add variable" })).toBe(null)
	})
})
