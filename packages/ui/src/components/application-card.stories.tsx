import type { ReactNode } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	listExhaustively,
	probedStyleOf,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import {
	ApplicationCard,
	type ApplicationCardFootnote,
	type ApplicationCardProps,
	type ApplicationCardStatus,
} from "@workspace/ui/components/application-card"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { Icons } from "@workspace/ui/components/icons"
import {
	Message,
	MessageAuthor,
	MessageAvatar,
	MessageContent,
} from "@workspace/ui/components/message"
import {
	MessageBubble,
	MessageBubbleContent,
} from "@workspace/ui/components/message-bubble"
import { CURATED_APPLICATIONS } from "@workspace/ui/components/plugin-settings/applications.fixtures"
import { ToolQuestion } from "@workspace/ui/components/tool-question"
import { bots } from "@workspace/ui/lib/i18n-en/bots"

const SENTRY_MARK = CURATED_APPLICATIONS.find(({ id }) => id === "sentry")?.mark
const LINEAR_MARK = CURATED_APPLICATIONS.find(({ id }) => id === "linear")?.mark

const SHOTO: MessageAuthor = {
	id: "bot-shoto",
	name: "Shoto",
	animal: "koala",
	blot: "green",
}

const APPLICATION_STATUSES = listExhaustively<ApplicationCardStatus>({
	none: true,
	apiKey: true,
	signIn: true,
	waiting: true,
	connected: true,
})

const fontFamilyOf = (className: string) =>
	probedStyleOf(className, "fontFamily")

const expectInside = async (inner: Element, outer: Element) => {
	const innerBox = inner.getBoundingClientRect()
	const outerBox = outer.getBoundingClientRect()
	await expect(innerBox.left).toBeGreaterThanOrEqual(outerBox.left)
	await expect(innerBox.right).toBeLessThanOrEqual(outerBox.right)
}

type BubbleSurfaceProps = {
	children: ReactNode
}

const BubbleSurface = ({ children }: BubbleSurfaceProps) => (
	<div className="mx-auto grid max-w-md gap-3 rounded-bubble bg-muted px-3.5 py-2.5">
		{children}
	</div>
)

const meta = preview.meta({
	title: "Conversation/Tools/ApplicationCard",
	component: ApplicationCard,
	parameters: {
		docs: {
			description: {
				component:
					"One application as the conversation shows it: a mark, a name, one description line and a trailing status. An application Kiroshi knows prints its display name in the sans face; one pasted or taken from the registry prints its slug in the mono face. Given a footnote, the same card is the bordered receipt posted bare in the thread.",
			},
		},
	},
	args: {
		name: "linear",
		displayName: "Linear",
		mark: LINEAR_MARK,
		description: "Reads and files issues, projects and cycles.",
		status: "signIn",
	} satisfies ApplicationCardProps,
})

export const Default = meta.story({
	decorators: [
		(Story) => (
			<BubbleSurface>
				<Story />
			</BubbleSurface>
		),
	],
	parameters: {
		docs: {
			description: {
				story:
					"A known application inside a bubble: display name in the sans face, the sign-in dot in the attention colour of the connection dot map. Pick `WithSlug` for a registry application.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const name = slotIn(canvasElement, "application-card-name")
		await expect(name).toHaveTextContent("Linear")
		await expect(getComputedStyle(name).fontFamily).toBe(
			fontFamilyOf("font-sans"),
		)
	},
})

export const WithSlug = meta.story({
	args: {
		name: "forecast",
		displayName: undefined,
		mark: undefined,
		description: "Forecasts and alerts from national weather services.",
		status: "none",
	},
	decorators: [
		(Story) => (
			<BubbleSurface>
				<Story />
			</BubbleSurface>
		),
	],
	parameters: {
		docs: {
			description: {
				story:
					"An application taken from the registry or pasted: no display name, so the slug prints in the mono face beside the placeholder mark.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const name = slotIn(canvasElement, "application-card-name")
		await expect(name).toHaveTextContent("forecast")
		await expect(getComputedStyle(name).fontFamily).toBe(
			fontFamilyOf("font-mono"),
		)
	},
})

type StatusIndicator = {
	className: string
	property: "color" | "backgroundColor"
}

const STATUS_INDICATOR = {
	none: { className: "text-state-connected", property: "color" },
	apiKey: { className: "text-muted-foreground", property: "color" },
	signIn: { className: "bg-bot-badge-attention", property: "backgroundColor" },
	waiting: { className: "bg-bot-badge-attention", property: "backgroundColor" },
	connected: { className: "bg-state-connected", property: "backgroundColor" },
} as const satisfies Record<ApplicationCardStatus, StatusIndicator>

const STATUS_LABEL = {
	none: bots.applications.catalogue.setup.none,
	apiKey: bots.applications.catalogue.setup.apiKey,
	signIn: bots.applications.catalogue.setup.signIn,
	waiting: bots.applications.connection.waiting,
	connected: bots.applications.connection.state.connected,
} as const satisfies Record<ApplicationCardStatus, string>

export const Statuses = meta.story({
	decorators: [
		(Story) => (
			<BubbleSurface>
				<Story />
			</BubbleSurface>
		),
	],
	render: (args) => (
		<>
			{APPLICATION_STATUSES.map((status) => (
				<ApplicationCard key={status} {...args} status={status} />
			))}
		</>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Every status the card can carry. Labels come from the catalogue setup and connection catalogues; indicators from the connection dot map and the connected token. Check nothing to set up is a check stroked in the connected token, an API key is a muted key, signing in and waiting on the browser share the attention token, and a connected application reads its label in the foreground token.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const statuses = slotsIn(canvasElement, "application-card-status")

		await expect(statuses).toHaveLength(APPLICATION_STATUSES.length)
		for (const [index, status] of APPLICATION_STATUSES.entries()) {
			const slot = statuses[index] as HTMLElement
			const indicator = slot.firstElementChild as Element
			const { className, property } = STATUS_INDICATOR[status]

			await expect(slot).toHaveTextContent(STATUS_LABEL[status])
			await expect(getComputedStyle(indicator)[property]).toBe(
				probedStyleOf(className, property),
			)
		}
	},
})

const RefusedKeyBubble = () => (
	<MessageBubble>
		<MessageBubbleContent>
			<ToolQuestion
				onDeny={fn()}
				questions={[
					{
						isNotice: true,
						header: "Sentry",
						failure: {
							title: "Sentry refused the key",
							detail: "401 Unauthorized: invalid auth token",
						},
						action: {
							label: "Open Settings",
							icon: Icons.Settings,
							onSelect: fn(),
						},
						exit: { label: "Not now", onSelect: fn() },
					},
				]}
			/>
		</MessageBubbleContent>
	</MessageBubble>
)

const RECEIPT_FOOTNOTE: ApplicationCardFootnote = {
	sentence: "Shoto has Sentry in every conversation.",
	actionLabel: "Open Settings",
	onAction: fn(),
}

const RECEIPT: ApplicationCardProps = {
	name: "sentry",
	displayName: undefined,
	mark: SENTRY_MARK,
	description: "Pulls the errors and traces behind a release.",
	status: "connected",
	footnote: RECEIPT_FOOTNOTE,
}

export const Receipt = meta.story({
	args: RECEIPT,
	decorators: [
		(Story) => (
			<div className="mx-auto max-w-177.5">
				<Story />
			</div>
		),
	],
	render: (args) => (
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
				<RefusedKeyBubble />
				<ApplicationCard {...args} />
			</MessageContent>
		</Message>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard E11. Above, the refused key as a notice: the failure, then the way to Settings, with no key field. Below, the receipt posted bare in the thread: the same card, bordered, naming the slug in the mono face, its footnote row separated by one rule with a muted sentence and a control that opens Settings. Pick `ReceiptNarrow` for a 320px column.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const receipt = slotIn(canvasElement, "application-receipt")
		const name = slotIn(receipt, "application-card-name")
		const footnote = receipt.lastElementChild as HTMLElement
		const settings = canvas.getAllByRole("button", { name: "Open Settings" })
		const openSettings = settings.at(-1) as HTMLElement

		await expect(receipt.closest('[data-slot="message-bubble"]')).toBeNull()
		await expect(receipt.getBoundingClientRect().width).toBeLessThanOrEqual(470)
		await expect(getComputedStyle(receipt).borderTopWidth).toBe("1px")
		await expect(getComputedStyle(footnote).borderTopWidth).toBe("1px")
		await expect(name).toHaveTextContent("sentry")
		await expect(getComputedStyle(name).fontFamily).toBe(
			fontFamilyOf("font-mono"),
		)
		await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument()
		await expect(canvas.getByRole("form")).toHaveAccessibleName(
			"Sentry refused the key",
		)

		openSettings.focus()
		await expect(openSettings.matches(":focus-visible")).toBe(true)
		await expect(getComputedStyle(openSettings).boxShadow).not.toBe("none")
		await userEvent.keyboard("{Enter}")
		await expect(args.footnote?.onAction).toHaveBeenCalledTimes(1)
	},
})

const NARROW_FOOTNOTE: ApplicationCardFootnote = {
	sentence:
		"Shoto has Sentry in every conversation, and so does every companion you add later.",
	actionLabel: "Open Settings",
	onAction: fn(),
}

export const ReceiptNarrow = meta.story({
	args: { ...RECEIPT, footnote: NARROW_FOOTNOTE },
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
					"The receipt in a 320px column, which is also what 200 percent zoom leaves. The footnote sentence wraps and its control keeps its full label at the inline end, both inside the column. Pick `Receipt` for the thread it is posted in.",
			},
		},
	},
	play: async ({ canvas }) => {
		const column = canvas.getByTestId("column")
		const sentence = canvas.getByText(NARROW_FOOTNOTE.sentence)
		const control = canvas.getByRole("button", {
			name: NARROW_FOOTNOTE.actionLabel,
		})

		await expectInside(sentence, column)
		await expectInside(control, column)
		await expect(control.scrollWidth).toBeLessThanOrEqual(control.clientWidth)
		await expect(column.scrollWidth).toBeLessThanOrEqual(column.clientWidth)
	},
})
