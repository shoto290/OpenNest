import { expect, fn, spyOn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import {
	ApplicationInstall,
	type ApplicationInstallProps,
} from "@workspace/ui/components/application-install"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { Icons } from "@workspace/ui/components/icons"
import {
	Message,
	MessageAuthor,
	MessageAvatar,
	MessageContent,
} from "@workspace/ui/components/message"
import { CURATED_APPLICATIONS } from "@workspace/ui/components/plugin-settings/applications.fixtures"
import { bots } from "@workspace/ui/lib/i18n-en/bots"
import { chat } from "@workspace/ui/lib/i18n-en/chat"

const SHOTO: MessageAuthor = {
	id: "bot-shoto",
	name: "Shoto",
	animal: "koala",
	blot: "green",
}

const curatedCardOf = (id: string): ApplicationInstallProps["application"] => {
	const application = CURATED_APPLICATIONS.find(
		(candidate) => candidate.id === id,
	)
	if (!application) throw new Error(`No curated application named ${id}`)
	return {
		name: application.id,
		displayName: application.name,
		mark: application.mark,
		description: application.description,
		status: application.setup,
	}
}

const SIGN_IN_ADDRESS =
	"https://mcp.linear.app/authorize?client_id=kiroshi&response_type=code&state=4f1c9a"

const InstallByShoto = (args: ApplicationInstallProps) => (
	<Message from="assistant">
		<MessageAvatar>
			<BotIdentityAvatar
				animal={SHOTO.animal}
				blot={SHOTO.blot}
				name={SHOTO.name}
				seed={SHOTO.id}
				size={28}
			/>
		</MessageAvatar>
		<MessageContent>
			<MessageAuthor author={SHOTO} />
			<ApplicationInstall {...args} />
		</MessageContent>
	</Message>
)

const follows = (a: Node, b: Node) =>
	Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

const expectInside = async (inner: Element, outer: Element) => {
	const innerBox = inner.getBoundingClientRect()
	const outerBox = outer.getBoundingClientRect()
	await expect(innerBox.left).toBeGreaterThanOrEqual(outerBox.left)
	await expect(innerBox.right).toBeLessThanOrEqual(outerBox.right)
}

const meta = preview.meta({
	title: "Conversation/Tools/ApplicationInstall",
	component: ApplicationInstall,
	parameters: {
		docs: {
			description: {
				component:
					"The bubble a companion posts to install one application, artboard E10: a soft bubble in the avatar gutter holding the application card and one action row, plus a read-only address row when the application signs the person in. No key is ever typed here; an application that needs one sends the person to Settings.",
			},
		},
	},
	args: {
		application: curatedCardOf("postgres"),
		primary: { label: "Install Postgres", icon: Icons.Add, onSelect: fn() },
		secondary: { label: "Not now", emphasis: "outline", onSelect: fn() },
	} satisfies ApplicationInstallProps,
	render: InstallByShoto,
	decorators: [
		(Story) => (
			<div className="mx-auto max-w-177.5">
				<Story />
			</div>
		),
	],
})

export const NothingToSetUp = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"An application Kiroshi knows with nothing to set up. Check the card sits above the action row in one bubble, the check glyph is stroked in the connected token, the controls are 32 high, and the primary control shows a focus ring when reached by keyboard. Pick `NeedsAnApiKey` for the case that sends the person to Settings.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const bubble = slotIn(canvasElement, "message-bubble-content")
		const card = slotIn(canvasElement, "application-card")
		const primary = canvas.getByRole("button", { name: "Install Postgres" })
		const secondary = canvas.getByRole("button", { name: "Not now" })

		await expect(bubble).toContainElement(card)
		await expect(bubble).toContainElement(primary)
		await expect(follows(card, primary)).toBe(true)
		await expect(canvas.getByText("Postgres")).toBeVisible()
		await expect(
			canvas.getByText(bots.applications.catalogue.setup.none),
		).toBeVisible()
		await expect(canvasElement.querySelector("input")).toBeNull()
		await expect(primary.getBoundingClientRect().height).toBe(32)
		await expect(secondary.getBoundingClientRect().height).toBe(32)

		await userEvent.tab()
		await expect(primary).toHaveFocus()
		await expect(primary.matches(":focus-visible")).toBe(true)
		await expect(getComputedStyle(primary).boxShadow).not.toBe("none")

		await userEvent.keyboard("{Enter}")
		await expect(args.primary.onSelect).toHaveBeenCalledTimes(1)
	},
})

export const NeedsAnApiKey = meta.story({
	args: {
		application: curatedCardOf("sentry"),
		primary: { label: "Open Settings", icon: Icons.Settings, onSelect: fn() },
		secondary: { label: "Not now", emphasis: "quiet", onSelect: fn() },
	},
	parameters: {
		docs: {
			description: {
				story:
					"An application that needs an API key. The key glyph and label are muted, and no field for the key is drawn anywhere: the primary control opens Settings and the second control has no surface. Pick `SignsYouIn` for the browser sign-in.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvas.getByText(bots.applications.catalogue.setup.apiKey),
		).toBeVisible()
		await expect(canvasElement.querySelector("input")).toBeNull()
		await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument()
		await expect(
			canvas.getByRole("button", { name: "Open Settings" }),
		).toBeEnabled()
	},
})

export const SignsYouIn = meta.story({
	args: {
		application: curatedCardOf("linear"),
		address: SIGN_IN_ADDRESS,
		primary: {
			label: "Open in browser",
			icon: Icons.ExternalLink,
			onSelect: fn(),
		},
		secondary: undefined,
	},
	parameters: {
		docs: {
			description: {
				story:
					"An application that signs the person in through the browser. The read-only address row sits between the card and the action row, and its copy control announces the copy politely. Pick `CopyFailed` for a refused clipboard and `LongContent` for an address that does not fit.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const writeText = spyOn(
			navigator.clipboard,
			"writeText",
		).mockResolvedValue()
		const card = slotIn(canvasElement, "application-card")
		const row = slotIn(canvasElement, "application-install-address")
		const address = canvas.getByLabelText(chat.applicationInstall.address)
		const primary = canvas.getByRole("button", { name: "Open in browser" })
		const copy = canvas.getByRole("button", { name: chat.toolQuestion.copy })

		await expect(follows(card, row)).toBe(true)
		await expect(follows(row, primary)).toBe(true)
		await expect(address).toHaveAttribute("readonly")
		await expect(address).toHaveValue(SIGN_IN_ADDRESS)
		await expect(row.getBoundingClientRect().height).toBe(36)
		await expect(copy.getBoundingClientRect().height).toBe(26)

		await userEvent.click(copy)
		await expect(writeText).toHaveBeenLastCalledWith(SIGN_IN_ADDRESS)
		await expect(
			await canvas.findByText(chat.toolQuestion.copyAnnounced),
		).toBeInTheDocument()

		writeText.mockRestore()
	},
})

export const CopyFailed = meta.story({
	args: SignsYouIn.input.args,
	parameters: {
		docs: {
			description: {
				story:
					"The clipboard refused the address. The copy control says so in the row, the polite region tells the person to copy it by hand, and the address stays on screen and selectable.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const writeText = spyOn(navigator.clipboard, "writeText").mockRejectedValue(
			new DOMException("Write permission denied.", "NotAllowedError"),
		)
		const address = canvas.getByLabelText<HTMLInputElement>(
			chat.applicationInstall.address,
		)

		await userEvent.click(
			canvas.getByRole("button", { name: chat.toolQuestion.copy }),
		)
		await expect(
			await canvas.findByRole("button", {
				name: chat.applicationInstall.copyFailed,
			}),
		).toBeVisible()
		await expect(
			canvas.getByText(chat.toolQuestion.copyFailed),
		).toBeInTheDocument()
		await expect(address).toHaveValue(SIGN_IN_ADDRESS)

		address.setSelectionRange(0, SIGN_IN_ADDRESS.length)
		await expect(address.selectionEnd).toBe(SIGN_IN_ADDRESS.length)

		writeText.mockRestore()
	},
})

const LONG_SLUG = "io-github-weatherdesk-forecast-and-severe-weather-alerts"

export const LongContent = meta.story({
	args: {
		application: {
			name: LONG_SLUG,
			description:
				"Forecasts, severe weather alerts and river levels from every national weather service that publishes them.",
			status: "waiting",
		},
		address: `${SIGN_IN_ADDRESS}&redirect_uri=http%3A%2F%2F127.0.0.1%3A53682%2Fcallback`,
		primary: {
			label: "Open in browser",
			icon: Icons.ExternalLink,
			onSelect: fn(),
		},
		secondary: { label: "Not now", emphasis: "quiet", onSelect: fn() },
	},
	decorators: [
		(Story) => (
			<div className="w-[320px]" data-testid="column">
				<Story />
			</div>
		),
	],
	parameters: {
		docs: {
			description: {
				story:
					"A registry application in a 320px column, which is also what 200 percent zoom leaves. The slug prints in the mono face and truncates on one line, the description wraps, and the waiting status drops under the text rather than squeezing it, fully visible. The address truncates while its copy control keeps its full size.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const column = canvas.getByTestId("column")
		const card = slotIn(canvasElement, "application-card")
		const name = slotIn(canvasElement, "application-card-name")
		const status = slotIn(canvasElement, "application-card-status")
		const row = slotIn(canvasElement, "application-install-address")
		const address = canvas.getByLabelText(chat.applicationInstall.address)
		const copy = canvas.getByRole("button", { name: chat.toolQuestion.copy })

		await expect(name).toHaveTextContent(LONG_SLUG)
		await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
		await expect(
			canvas.getByText(bots.applications.connection.waiting),
		).toBeVisible()
		await expectInside(status, card)
		await expect(status.scrollWidth).toBeLessThanOrEqual(status.clientWidth)

		await expect(address.scrollWidth).toBeGreaterThan(address.clientWidth)
		await expectInside(copy, row)
		await expect(copy.clientWidth).toBe(copy.scrollWidth)

		await expect(column.scrollWidth).toBeLessThanOrEqual(column.clientWidth)
	},
})
