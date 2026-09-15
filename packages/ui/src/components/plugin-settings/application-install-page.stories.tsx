import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	ApplicationInstallPage,
	type ApplicationInstallPageProps,
} from "@workspace/ui/components/plugin-settings/application-install-page"
import {
	API_KEY_INSTALL,
	CATALOGUE_CATEGORIES,
	LONG_INSTALL,
	REGISTRY_INSTALL,
	SIGN_IN_INSTALL,
} from "@workspace/ui/components/plugin-settings/applications.fixtures"
import type { ApplicationsOwner } from "@workspace/ui/components/plugin-settings/applications-panel"

const INSTALL_FAILURE = "Sentry refused the key: 401 invalid token."

const COMPANION: ApplicationsOwner = { kind: "companion", name: "Rei" }

const SPACE: ApplicationsOwner = { kind: "space", name: "Atlas" }

const FailingInstallHost = (props: ApplicationInstallPageProps) => {
	const [failure, setFailure] = useState<string>()

	return (
		<ApplicationInstallPage
			{...props}
			failure={failure}
			onInstall={(key) => {
				props.onInstall(key)
				setFailure(INSTALL_FAILURE)
			}}
		/>
	)
}

const meta = preview.meta({
	title: "Settings/Plugins/ApplicationInstallPage",
	component: ApplicationInstallPage,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The page a catalogue card pushes. The catalogue rail stays, the column beside it names the application and offers one action, then says what adding it takes: a sign-in, a key, or nothing. The tools it brings are listed one by one, and the footnote speaks for whoever the page was pushed from.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="flex h-[34rem] w-[52rem] overflow-hidden rounded-2xl border border-border">
				<Story />
			</div>
		),
	],
	args: {
		application: SIGN_IN_INSTALL,
		owner: COMPANION,
		categories: CATALOGUE_CATEGORIES,
		category: "everything",
		onCategoryChange: fn(),
		onBack: fn(),
		onPaste: fn(),
		onInstall: fn(),
	},
})

export const SignsYouIn = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"E5. An application that signs you in. Check the attention notice with its dot, the external-link glyph before Add and sign in, every tool as a pill, and the footnote naming the companion.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByText("Granola signs you in")).toBeVisible()
		await expect(
			canvas.getByText("Reads your meeting notes and transcripts."),
		).not.toHaveClass("font-mono")
		await expect(canvas.getByText("6 tools, read only")).toBeVisible()
		await expect(canvas.getAllByRole("listitem")).toHaveLength(6)
		await expect(
			canvas.getByText(/Adding one reopens Rei’s session/),
		).toBeVisible()

		const action = canvas.getByRole("button", { name: "Add and sign in" })
		await expect(action.querySelector("svg")).not.toBeNull()
		await userEvent.click(action)
		await expect(args.onInstall).toHaveBeenCalledWith(undefined)

		await userEvent.click(
			canvas.getByRole("button", { name: "All applications" }),
		)
		await expect(args.onBack).toHaveBeenCalledTimes(1)
	},
})

export const NeedsApiKey = meta.story({
	args: { application: API_KEY_INSTALL },
	parameters: {
		docs: {
			description: {
				story:
					"E6. An application that needs a key. Check the muted panel with the place the key is issued, the concealed field and its Show control named both ways, the glyphless Add application, and the keyboard order: field, reveal, action.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const field = canvas.getByLabelText("Sentry needs an API key")
		await expect(field).toHaveAttribute("type", "password")
		await expect(field).toHaveAttribute("placeholder", "Starts with sntryu_")
		await expect(
			canvas.getByText("sentry.io > Settings > Auth tokens"),
		).toBeVisible()

		await userEvent.click(field)
		await userEvent.keyboard("sntryu_secret")
		await userEvent.tab()
		const reveal = canvas.getByRole("button", { name: "Show the API key" })
		await expect(reveal).toHaveFocus()
		await userEvent.keyboard("{Enter}")
		await expect(field).toHaveAttribute("type", "text")
		await expect(
			canvas.getByRole("button", { name: "Hide the API key" }),
		).toHaveFocus()

		await userEvent.tab()
		const action = canvas.getByRole("button", { name: "Add application" })
		await expect(action).toHaveFocus()
		await expect(action.querySelector("svg")).toBeNull()
		await userEvent.keyboard("{Enter}")
		await expect(args.onInstall).toHaveBeenCalledWith("sntryu_secret")
	},
})

export const NothingToSetUp = meta.story({
	args: { application: REGISTRY_INSTALL },
	parameters: {
		docs: {
			description: {
				story:
					"E7. A registry package Kiroshi has not read. Check the plain server mark, the name and the package invocation in monospace, the destructive notice naming who published it and when, and the check line with no panel.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("heading", { name: "tasklog" })).toHaveClass(
			"font-mono",
		)
		await expect(canvas.getByText("npx -y @kwn/tasklog-mcp")).toHaveClass(
			"font-mono",
		)
		await expect(canvas.getByText("Kiroshi hasn’t read this one")).toBeVisible()
		await expect(
			canvas.getByText(/Published on the MCP registry by kwn, 4 days ago\./),
		).toBeVisible()
		await expect(
			canvas.getByText(
				"Nothing to set up. It runs on this machine, with no key and no sign-in.",
			),
		).toBeVisible()
		await expect(canvas.getByText("7 tools, reads and writes")).toBeVisible()
	},
})

export const InstallRunning = meta.story({
	args: { application: API_KEY_INSTALL, isInstalling: true },
	parameters: {
		docs: {
			description: {
				story:
					"The install in flight. Check that the action is disabled and busy for assistive technology while the key field and the rest of the page stay usable.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const action = canvas.getByRole("button", { name: "Add application" })
		await expect(action).toBeDisabled()
		await expect(action).toHaveAttribute("aria-busy", "true")

		const field = canvas.getByLabelText("Sentry needs an API key")
		await userEvent.type(field, "sntryu_")
		await expect(field).toHaveValue("sntryu_")
	},
})

export const InstallFailed = meta.story({
	args: { application: API_KEY_INSTALL },
	render: (args) => <FailingInstallHost {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The install came back refused. Check that the reason lands under the key panel as an alert in the destructive colour, that the action stays enabled, and that the typed key is still there.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const field = canvas.getByLabelText("Sentry needs an API key")
		await userEvent.type(field, "sntryu_wrong")
		const action = canvas.getByRole("button", { name: "Add application" })
		await userEvent.click(action)

		const alert = canvas.getByRole("alert")
		await expect(alert).toHaveTextContent(INSTALL_FAILURE)
		await expect(alert).toHaveClass("text-destructive")
		await expect(action).toBeEnabled()
		await expect(field).toHaveValue("sntryu_wrong")
	},
})

export const InstallSucceeded = meta.story({
	args: { isInstalled: true },
	parameters: {
		docs: {
			description: {
				story:
					"The install is done. Check that the action says Added with a check glyph and can no longer be pressed.",
			},
		},
	},
	play: async ({ canvas }) => {
		const action = canvas.getByRole("button", { name: "Added" })
		await expect(action).toBeDisabled()
		await expect(action.querySelector("svg")).not.toBeNull()
	},
})

export const ForSpace = meta.story({
	args: {
		application: API_KEY_INSTALL,
		owner: SPACE,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The page pushed from a space. Check that the key sentence and the footnote speak for every companion in the space rather than for one.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText(/Every companion in Atlas sees the tools/),
		).toBeVisible()
		await expect(
			canvas.getByText(/gives every companion in Atlas its tools\./),
		).toBeVisible()
	},
})

export const NarrowColumn = meta.story({
	args: { application: API_KEY_INSTALL },
	decorators: [
		(Story) => (
			<div className="flex h-[34rem] w-[33rem] overflow-hidden">
				<Story />
			</div>
		),
	],
	parameters: {
		docs: {
			description: {
				story:
					"The column beside the rail narrowed to 320px. Check that the action wraps under the name, that the key panel and the pills wrap, and that nothing scrolls sideways.",
			},
		},
	},
	play: async ({ canvas }) => {
		const heading = canvas.getByRole("heading", { name: "Sentry" })
		const action = canvas.getByRole("button", { name: "Add application" })
		await expect(action.getBoundingClientRect().top).toBeGreaterThan(
			heading.getBoundingClientRect().bottom,
		)

		const body = canvas.getByRole("tabpanel")
		const grid = body.parentElement as HTMLElement
		await expect(Math.round(grid.getBoundingClientRect().width)).toBe(320)
		for (const element of [grid, ...grid.children]) {
			await expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth)
		}
	},
})

export const LongContent = meta.story({
	args: { application: LONG_INSTALL },
	parameters: {
		docs: {
			description: {
				story:
					"A 60-character name and 40 tools. Check that only the name truncates, keeping its full value as a title, and that every tool keeps its own pill, wrapped over as many rows as it takes.",
			},
		},
	},
	play: async ({ canvas }) => {
		const heading = canvas.getByRole("heading", { name: LONG_INSTALL.name })
		await expect(heading).toHaveAttribute("title", LONG_INSTALL.name)
		await expect(heading.scrollWidth).toBeGreaterThan(heading.clientWidth)
		await expect(canvas.getAllByRole("listitem")).toHaveLength(40)
		await expect(canvas.getByText("40 tools, reads and writes")).toBeVisible()
	},
})
