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
	Button,
	ButtonLink,
	type ButtonProps,
	type ButtonSize,
	type ButtonVariant,
} from "@workspace/ui/components/motion/button/base"

type StoryProps = Pick<
	ButtonProps,
	"variant" | "size" | "children" | "disabled" | "pressScale" | "onClick"
>

const BUTTON_VARIANTS = listExhaustively<ButtonVariant>({
	primary: true,
	secondary: true,
	ghost: true,
	outline: true,
})

const BUTTON_SIZES = listExhaustively<ButtonSize>({
	sm: true,
	md: true,
	lg: true,
	icon: true,
})

const PRESS_SCALES = [0.98, 0.93, 0.85]

const meta = preview.meta({
	title: "Primitives/MotionButton",
	component: withStoryProps<StoryProps>(Button),
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The pill-shaped button of the motion set: it swells a hair under the cursor and compresses under the press, both on the same spring, so a click feels answered before anything on screen has changed. It is a real `<button>` with a real `type`, so keyboard, form semantics and `disabled` all behave — only the feedback is animated. Everything that could mislead is conditional: the hover swell is skipped on pointers that cannot hover, and every motion is dropped under `prefers-reduced-motion`, leaving the colour transitions to carry the state. This is the marketing-weight button; `Primitives/Button` is the application one, and unless a surface is deliberately expressive that is the one to reach for. `MagneticButton` and `StatefulButton` both build on this.",
			},
		},
	},
	args: { children: "Continue", onClick: fn() },
	argTypes: {
		variant: { control: "inline-radio", options: BUTTON_VARIANTS },
		size: { control: "inline-radio", options: BUTTON_SIZES },
		children: { control: "text" },
		disabled: { control: "boolean" },
		pressScale: { control: { type: "range", min: 0.8, max: 1, step: 0.01 } },
	},
})

export const Playground = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The nominal case, with every knob live. Check that the button takes focus from the keyboard and fires on Enter, and that the press spring settles rather than snapping back — the release is what the hand reads as the click landing.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const button = canvas.getByRole("button", { name: "Continue" })

		await userEvent.tab()
		await expect(button).toHaveFocus()

		await userEvent.keyboard("{Enter}")
		await expect(args.onClick).toHaveBeenCalled()
	},
})

export const Variants = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"Every variant the button ships, in descending weight. One `primary` per surface is the rule — it is the single thing a reader should do next. `secondary` and `outline` differ only in fill, so pick `secondary` on a plain background and `outline` over anything already tinted; `ghost` carries no box at all and belongs in toolbars, never alone as the only action.",
			},
		},
	},
	render: () => (
		<Row>
			{BUTTON_VARIANTS.map((variant) => (
				<Button key={variant} variant={variant}>
					{variant}
				</Button>
			))}
		</Row>
	),
})

export const Sizes = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Every size, text first and icon last. `md` is the default and the one to reach for; `sm` belongs in dense rows and `lg` in a hero. Note that `icon` is the odd one out — it is the only square, rounded to `lg` rather than to a pill, so it sits next to a text button rather than matching it. Check that each icon button carries an `aria-label`.",
			},
		},
	},
	render: () => (
		<div className="flex flex-col gap-4">
			<Row>
				{BUTTON_SIZES.filter((size) => size !== "icon").map((size) => (
					<Button key={size} size={size}>
						{size}
					</Button>
				))}
			</Row>
			<Row>
				<Button size="icon" aria-label="Add a workspace">
					<Icons.Add className="h-4 w-4" />
				</Button>
			</Row>
		</div>
	),
})

export const States = meta.story({
	parameters: {
		pseudo: {
			hover: "#motion-button-hover",
			focusVisible: "#motion-button-focus",
			active: "#motion-button-active",
		},
		docs: {
			description: {
				story:
					"Every interactive state, pinned open. Hover, focus and active are the colour half of the feedback — the scale half is springs, which a static frame cannot show. Check that focus stays visible against the primary fill, and that `disabled` drops the pointer events entirely so neither the swell nor the press can fire on a button that would do nothing.",
			},
		},
	},
	render: () => (
		<Row>
			<Button>Default</Button>
			<Button id="motion-button-hover">Hover</Button>
			<Button id="motion-button-focus">Focus</Button>
			<Button id="motion-button-active">Active</Button>
			<Button disabled>Disabled</Button>
		</Row>
	),
})

export const PressScale = meta.story({
	render: () => (
		<Row>
			{PRESS_SCALES.map((pressScale) => (
				<Button key={pressScale} pressScale={pressScale}>
					{`${pressScale}`}
				</Button>
			))}
		</Row>
	),
	parameters: {
		docs: {
			description: {
				story:
					"How far the button compresses under the press. Tune it up toward 0.98 as the target grows — a large button travelling 15% reads as collapsing — and leave the default alone otherwise. Check that no value lets the button shrink out from under the cursor mid-press.",
			},
		},
	},
})

export const AsLink = meta.story({
	render: () => (
		<Row>
			<ButtonLink href="#docs">Read the docs</ButtonLink>
			<ButtonLink href="#changelog" variant="outline">
				Changelog
			</ButtonLink>
		</Row>
	),
	parameters: {
		docs: {
			description: {
				story:
					"`ButtonLink` renders the same skin on an anchor, for navigation rather than for an action. Reach for it whenever the control leads somewhere — it keeps the middle-click, the context menu and the status bar preview a `<button>` with an `onClick` would throw away. It takes no `disabled`: an anchor that leads nowhere should not be rendered.",
			},
		},
	},
})
