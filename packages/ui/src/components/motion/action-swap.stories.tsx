import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	listExhaustively,
	Row,
	withStoryProps,
} from "@workspace/storybook/story-utils"
import { Icons } from "@workspace/ui/components/icons"
import {
	type ActionSwapAnimation,
	ActionSwapButton,
	type ActionSwapButtonProps,
	type ActionSwapButtonSize,
	type ActionSwapButtonVariant,
	ActionSwapIcon,
	type ActionSwapItem,
	ActionSwapText,
} from "@workspace/ui/components/motion/action-swap"

type StoryProps = Pick<
	ActionSwapButtonProps,
	| "items"
	| "value"
	| "defaultValue"
	| "onValueChange"
	| "variant"
	| "size"
	| "animation"
	| "iconOnly"
	| "cycle"
	| "disabled"
>

const VARIANTS = listExhaustively<ActionSwapButtonVariant>({
	primary: true,
	secondary: true,
	outline: true,
	ghost: true,
})

const SIZES = listExhaustively<ActionSwapButtonSize>({
	sm: true,
	md: true,
	lg: true,
	icon: true,
})

const ANIMATIONS = listExhaustively<ActionSwapAnimation>({
	blur: true,
	roll: true,
	cascade: true,
})

const SORT_ITEMS: ActionSwapItem[] = [
	{ id: "newest", label: "Newest first" },
	{ id: "oldest", label: "Oldest first" },
	{ id: "name", label: "By name" },
]

const NOTIFY_ITEMS: ActionSwapItem[] = [
	{
		id: "alerting",
		label: "Alerting",
		icon: <Icons.Alert />,
		ariaLabel: "Notifications on, mute them",
	},
	{
		id: "muted",
		label: "Muted",
		icon: <Icons.Blocked />,
		ariaLabel: "Notifications muted, turn them on",
	},
]

const BOOKMARK_ITEMS: ActionSwapItem[] = [
	{
		id: "save",
		label: "Save",
		icon: <Icons.Bookmark />,
		ariaLabel: "Save this answer",
	},
	{
		id: "saved",
		label: "Saved",
		icon: <Icons.Check />,
		ariaLabel: "Saved — remove from saved",
	},
]

const ControlledSort = () => {
	const [value, setValue] = useState("oldest")

	return (
		<div className="flex flex-col items-start gap-3">
			<ActionSwapButton
				items={SORT_ITEMS}
				value={value}
				onValueChange={setValue}
			/>
			<p className="text-muted-foreground text-xs">Sorting by {value}</p>
		</div>
	)
}

const ComposedToggle = () => {
	const [muted, setMuted] = useState(false)
	const item = NOTIFY_ITEMS[muted ? 1 : 0]

	return (
		<button
			type="button"
			aria-label={item.ariaLabel}
			onClick={() => setMuted(!muted)}
			className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card px-4 font-medium text-foreground text-sm"
		>
			<ActionSwapIcon value={item.id} animation="roll" className="h-4 w-4">
				{item.icon}
			</ActionSwapIcon>
			<ActionSwapText value={item.id} animation="roll">
				{item.label}
			</ActionSwapText>
		</button>
	)
}

const meta = preview.meta({
	title: "Primitives/ActionSwapButton",
	component: withStoryProps<StoryProps>(ActionSwapButton),
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"One button that cycles through a short list of `items`, animating its own label and icon on every step rather than blinking to the next one. The text box measures the incoming label and tweens its width to it, so the pill grows into the longer word instead of jumping. Reach for it where the states are a closed loop a reader can walk with repeated presses — a sort order, a notification toggle — and reach for a `Select` the moment the list grows past three or the reader needs to see the options before choosing. `value` makes it controlled, `cycle={false}` turns it into a display that a caller drives. Under `prefers-reduced-motion` every swap resolves instantly with no width tween. The two halves are exported on their own as `ActionSwapText` and `ActionSwapIcon` for controls this button does not fit.",
			},
		},
	},
	args: { items: SORT_ITEMS, onValueChange: fn() },
	argTypes: {
		variant: { control: "inline-radio", options: VARIANTS },
		size: { control: "inline-radio", options: SIZES },
		animation: { control: "inline-radio", options: ANIMATIONS },
		iconOnly: { control: "boolean" },
		cycle: { control: "boolean" },
		disabled: { control: "boolean" },
		items: { control: false },
	},
})

export const Playground = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The nominal case: three sort orders on one button. Check that each press lands on the next label and that the pill's width follows it as one motion — a jump here is the tell that the measuring pass missed. After the last item it returns to the first, which is what makes the control reversible without a second button.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const button = canvas.getByRole("button")

		await expect(button).toHaveTextContent("Newest first")

		await userEvent.click(button)
		await expect(args.onValueChange).toHaveBeenCalled()
		await expect(button).toHaveTextContent("Oldest first")
	},
})

export const Variants = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"Every variant, in descending weight. A swapping button is rarely the main action on a surface, so `secondary` is the default and the one to keep; reach for `ghost` in a toolbar where the row of controls carries the box, and for `primary` only when the cycle itself is the point of the screen.",
			},
		},
	},
	render: () => (
		<Row>
			{VARIANTS.map((variant) => (
				<ActionSwapButton key={variant} items={SORT_ITEMS} variant={variant} />
			))}
		</Row>
	),
})

export const Sizes = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Every size. `icon` is the outlier: it switches `iconOnly` on by default, drops the label and holds a fixed square, so it is the only size whose width never moves — which is exactly why it needs items that carry both an icon and an `ariaLabel`.",
			},
		},
	},
	render: () => (
		<Row>
			{SIZES.filter((size) => size !== "icon").map((size) => (
				<ActionSwapButton key={size} items={SORT_ITEMS} size={size} />
			))}
			<ActionSwapButton items={NOTIFY_ITEMS} size="icon" />
		</Row>
	),
})

export const Animations = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The three ways a label can hand over. `blur` scales and defocuses in place — the quietest, and the default. `roll` pushes the old label up and the new one in from below, which reads as a mechanical counter. `cascade` rolls letter by letter left to right and is the loudest: it needs a plain string, so any non-text label silently falls back to `roll`. Pick one per surface and hold it; mixing them makes a toolbar look assembled from parts.",
			},
		},
	},
	render: () => (
		<Row>
			{ANIMATIONS.map((animation) => (
				<ActionSwapButton
					key={animation}
					items={SORT_ITEMS}
					animation={animation}
					variant="outline"
				/>
			))}
		</Row>
	),
})

export const States = meta.story({
	parameters: {
		pseudo: {
			hover: "#action-swap-hover",
			focusVisible: "#action-swap-focus",
			active: "#action-swap-active",
		},
		docs: {
			description: {
				story:
					"Every interactive state, pinned open. Check the focus ring survives on the secondary fill, and that `disabled` kills both the press spring and the cycle — a button that animates its label while refusing to commit the change would report a state the caller never got.",
			},
		},
	},
	render: () => (
		<Row>
			<ActionSwapButton items={SORT_ITEMS} />
			<ActionSwapButton id="action-swap-hover" items={SORT_ITEMS} />
			<ActionSwapButton id="action-swap-focus" items={SORT_ITEMS} />
			<ActionSwapButton id="action-swap-active" items={SORT_ITEMS} />
			<ActionSwapButton items={SORT_ITEMS} disabled />
		</Row>
	),
})

export const IconOnly = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The label dropped, the icon kept. This is the densest form and the one with the sharpest accessibility cost: the button's name comes from the active item's `ariaLabel`, so every item must spell out both the state it is in and the action a press performs — `Notifications muted, turn them on`, not `Muted`. Check that the name changes with the icon.",
			},
		},
	},
	render: () => (
		<Row>
			<ActionSwapButton items={NOTIFY_ITEMS} size="icon" />
			<ActionSwapButton items={BOOKMARK_ITEMS} size="icon" variant="outline" />
		</Row>
	),
	play: async ({ canvas, userEvent }) => {
		const button = canvas.getByRole("button", {
			name: "Notifications on, mute them",
		})

		await userEvent.click(button)
		await expect(
			canvas.getByRole("button", { name: "Notifications muted, turn them on" }),
		).toBeVisible()
	},
})

export const WithIcons = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Icon and label together, the form to reach for whenever there is room. The icon animates on its own track with `mode=\"popLayout\"`, so it swaps under a label that is still widening without the two fighting for the same space. Check they land together rather than in sequence.",
			},
		},
	},
	render: () => (
		<Row>
			<ActionSwapButton items={NOTIFY_ITEMS} />
			<ActionSwapButton items={BOOKMARK_ITEMS} variant="outline" />
		</Row>
	),
})

export const Controlled = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"`value` supplied by the caller, so the button renders what the state says rather than what it was last pressed to. Reach for this whenever the same setting is reachable from anywhere else — a menu, a keyboard shortcut, a restored preference — otherwise the two go out of sync on the first press. Check the caption follows every press.",
			},
		},
	},
	render: () => <ControlledSort />,
})

export const WithoutCycle = meta.story({
	args: { cycle: false, defaultValue: "oldest" },
	parameters: {
		docs: {
			description: {
				story:
					"`cycle={false}`: the press no longer advances anything, so the button becomes a display whose changes are animated by whatever the caller does with `onClick`. Reach for it when the next state is not simply the next item — a step that needs a confirm, or an order the server decides.",
			},
		},
	},
})

export const WithTextAndIcon = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"`ActionSwapText` and `ActionSwapIcon` used on their own inside a control this button does not fit. Both take a `value` — the identity that decides when to animate — and nothing else; the surrounding button, its skin and its semantics stay the caller's. Reach for this when the swap has to live inside an existing control rather than replace it.",
			},
		},
	},
	render: () => <ComposedToggle />,
})
