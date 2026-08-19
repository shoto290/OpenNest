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
	type ActionSwapButtonSize,
	type ActionSwapButtonVariant,
	type ActionSwapItem,
	ActionSwapRollButton,
	type ActionSwapRollButtonProps,
	ActionSwapRollIcon,
	ActionSwapRollText,
} from "@workspace/ui/components/motion/action-swap-roll"

type StoryProps = Pick<
	ActionSwapRollButtonProps,
	| "items"
	| "value"
	| "defaultValue"
	| "onValueChange"
	| "variant"
	| "size"
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

const DENSITY_ITEMS: ActionSwapItem[] = [
	{ id: "comfortable", label: "Comfortable" },
	{ id: "cosy", label: "Cosy" },
	{ id: "compact", label: "Compact" },
]

const PLAYBACK_ITEMS: ActionSwapItem[] = [
	{
		id: "playing",
		label: "Playing",
		icon: <Icons.Stop />,
		ariaLabel: "Playing — stop the replay",
	},
	{
		id: "stopped",
		label: "Stopped",
		icon: <Icons.Retry />,
		ariaLabel: "Stopped — replay from the start",
	},
]

const COUNTER_LABELS = ["One", "Two", "Three"]

const RollingCounter = () => {
	const [step, setStep] = useState(0)
	const label = COUNTER_LABELS[step]

	return (
		<button
			type="button"
			onClick={() => setStep((current) => (current + 1) % COUNTER_LABELS.length)}
			className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card px-4 font-medium text-foreground text-sm"
		>
			<ActionSwapRollIcon value={label} className="h-4 w-4">
				<Icons.Next />
			</ActionSwapRollIcon>
			<ActionSwapRollText value={label}>{label}</ActionSwapRollText>
		</button>
	)
}

const meta = preview.meta({
	title: "Primitives/ActionSwapRollButton",
	component: withStoryProps<StoryProps>(ActionSwapRollButton),
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"`ActionSwapButton` with the `roll` animation welded on and the `animation` prop removed. The old label leaves upward while the new one arrives from below, both blurred through the pass, which reads as a mechanical counter rather than as a crossfade. Reach for it when the items form an ordered sequence a reader steps through — a density, a playback state, a page — because the direction of travel is itself information; where the items are simply alternatives, the default `blur` says less and gets in the way less. Everything else is inherited unchanged: same variants, sizes, controlled `value`, `cycle`, and the same collapse to an instant swap under `prefers-reduced-motion`. `ActionSwapRollText` and `ActionSwapRollIcon` are the same preset for the two halves.",
			},
		},
	},
	args: { items: DENSITY_ITEMS, onValueChange: fn() },
	argTypes: {
		variant: { control: "inline-radio", options: VARIANTS },
		size: { control: "inline-radio", options: SIZES },
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
					"The nominal case: three list densities, stepped through in order. Check that every label leaves upward and arrives from below — a roll that reverses direction between presses would tell a reader the sequence went backwards when it did not.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const button = canvas.getByRole("button")

		await expect(button).toHaveTextContent("Comfortable")

		await userEvent.click(button)
		await expect(args.onValueChange).toHaveBeenCalled()
		await expect(button).toHaveTextContent("Cosy")
	},
})

export const Variants = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"Every variant. The roll clips against the button's own box, so the darker fills read the motion more sharply than `ghost` does — on a boxless variant the label appears to slide out of nothing. Prefer `secondary` or `outline` here.",
			},
		},
	},
	render: () => (
		<Row>
			{VARIANTS.map((variant) => (
				<ActionSwapRollButton
					key={variant}
					items={DENSITY_ITEMS}
					variant={variant}
				/>
			))}
		</Row>
	),
})

export const Sizes = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Every size. The roll travels a fixed percentage of the label's own height, so it stays proportional from `sm` to `lg` rather than looking slower on the larger pill. `icon` drops the label entirely and rolls the glyph alone.",
			},
		},
	},
	render: () => (
		<Row>
			{SIZES.filter((size) => size !== "icon").map((size) => (
				<ActionSwapRollButton key={size} items={DENSITY_ITEMS} size={size} />
			))}
			<ActionSwapRollButton items={PLAYBACK_ITEMS} size="icon" />
		</Row>
	),
})

export const States = meta.story({
	parameters: {
		pseudo: {
			hover: "#action-swap-roll-hover",
			focusVisible: "#action-swap-roll-focus",
			active: "#action-swap-roll-active",
		},
		docs: {
			description: {
				story:
					"Every interactive state, pinned open. Check the focus ring is not clipped by the overflow the roll needs, and that `disabled` stops the sequence entirely — a stepper that keeps advancing while disabled would drift out of sync with the caller's state.",
			},
		},
	},
	render: () => (
		<Row>
			<ActionSwapRollButton items={DENSITY_ITEMS} />
			<ActionSwapRollButton id="action-swap-roll-hover" items={DENSITY_ITEMS} />
			<ActionSwapRollButton id="action-swap-roll-focus" items={DENSITY_ITEMS} />
			<ActionSwapRollButton id="action-swap-roll-active" items={DENSITY_ITEMS} />
			<ActionSwapRollButton items={DENSITY_ITEMS} disabled />
		</Row>
	),
})

export const IconOnly = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Label dropped, glyph rolled. The button's name comes from the active item's `ariaLabel`, which must state both where the control is and what a press does — `Playing — stop the replay`. Check the name changes with the glyph, and that the icon never rolls out of its square.",
			},
		},
	},
	render: () => <ActionSwapRollButton items={PLAYBACK_ITEMS} size="icon" />,
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Playing — stop the replay" }),
		)
		await expect(
			canvas.getByRole("button", { name: "Stopped — replay from the start" }),
		).toBeVisible()
	},
})

export const WithoutCycle = meta.story({
	args: { cycle: false, defaultValue: "cosy" },
	parameters: {
		docs: {
			description: {
				story:
					"`cycle={false}`: the press stops advancing the sequence, leaving the button as a display the caller rolls by changing `value`. Reach for it when the next step is decided elsewhere — by a shortcut, a menu or the server — rather than by the press itself.",
			},
		},
	},
})

export const WithTextAndIcon = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"`ActionSwapRollText` and `ActionSwapRollIcon` on their own, inside a control this button does not fit. Both take only a `value`, the identity that decides when to roll, and leave the skin and the semantics to the caller. Check the two halves roll together rather than in sequence.",
			},
		},
	},
	render: () => <RollingCounter />,
})
