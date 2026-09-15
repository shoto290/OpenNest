import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	listExhaustively,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import {
	ApplicationCard,
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

type ProbedProperty = "color" | "backgroundColor" | "fontFamily"

const probedStyleOf = (className: string, property: ProbedProperty) => {
	const probe = document.createElement("span")
	probe.className = className
	document.body.append(probe)
	const value = getComputedStyle(probe)[property]
	probe.remove()
	return value
}

const fontFamilyOf = (className: string) =>
	probedStyleOf(className, "fontFamily")

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
	decorators: [
		(Story) => (
			<div className="mx-auto grid max-w-md gap-3 rounded-bubble bg-muted px-3.5 py-2.5">
				<Story />
			</div>
		),
	],
})

export const Default = meta.story({
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

const STATUS_INDICATOR = {
	none: { className: "text-state-connected", property: "color" },
	apiKey: { className: "text-muted-foreground", property: "color" },
	signIn: { className: "bg-bot-badge-attention", property: "backgroundColor" },
	waiting: { className: "bg-muted-foreground", property: "backgroundColor" },
	connected: { className: "bg-state-connected", property: "backgroundColor" },
} as const satisfies Record<
	ApplicationCardStatus,
	{ className: string; property: "color" | "backgroundColor" }
>

const STATUS_LABEL = {
	none: bots.applications.catalogue.setup.none,
	apiKey: bots.applications.catalogue.setup.apiKey,
	signIn: bots.applications.catalogue.setup.signIn,
	waiting: bots.applications.connection.waiting,
	connected: bots.applications.connection.state.connected,
} as const satisfies Record<ApplicationCardStatus, string>

export const Statuses = meta.story({
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
					"Every status the card can carry. Labels come from the catalogue setup and connection catalogues; indicators from the connection dot map and the connected token. Check nothing to set up is a check stroked in the connected token, an API key is a muted key, and a connected application reads its label in the foreground token.",
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
						question: "What should Shoto do about the Sentry key?",
						header: "Sentry",
						options: [],
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

const RECEIPT: ApplicationCardProps = {
	name: "sentry",
	displayName: undefined,
	mark: SENTRY_MARK,
	description: "Pulls the errors and traces behind a release.",
	status: "connected",
	footnote: {
		sentence: "Shoto has Sentry in every conversation.",
		actionLabel: "Open Settings",
		onAction: fn(),
	},
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
					"Artboard E11. Above, the refused key as a question that only reports: the failure, then the way to Settings, with no key field. Below, the receipt posted bare in the thread: the same card, bordered, naming the slug in the mono face, its footnote row separated by one rule with a muted sentence and a control that opens Settings.",
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
