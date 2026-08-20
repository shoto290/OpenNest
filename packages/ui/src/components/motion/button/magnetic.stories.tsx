import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { Row, withStoryProps } from "@workspace/storybook/story-utils"
import { Icons } from "@workspace/ui/components/icons"
import {
	MagneticButton,
	type MagneticButtonProps,
} from "@workspace/ui/components/motion/button/magnetic"

type StoryProps = Pick<
	MagneticButtonProps,
	"strength" | "variant" | "size" | "children" | "disabled" | "onClick"
>

const STRENGTHS = [0.15, 0.25, 0.5]

const meta = preview.meta({
	title: "Primitives/MagneticButton",
	component: withStoryProps<StoryProps>(MagneticButton),
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"`MotionButton` wrapped in `Magnetic`, so the button leans toward the cursor on approach and springs back on leave. Every button prop passes straight through — variant, size, `disabled` — and only `strength` and `magneticClassName` are added, the latter for the wrapper rather than the button. The pull is decoration: it is dropped under `prefers-reduced-motion` and on pointers that cannot hover, and the button underneath keeps its own hit area and label either way. Reach for it on the single control a landing surface is built around; two of them on the same screen cancel each other out, and a toolbar of them is unusable. Its pull is gentler than bare `Magnetic` by default — 0.25 against 0.35 — because a control has to stay under the cursor to be clicked.",
			},
		},
	},
	args: { children: "Get started", onClick: fn() },
	argTypes: {
		strength: { control: { type: "range", min: 0, max: 1, step: 0.05 } },
		children: { control: "text" },
		disabled: { control: "boolean" },
	},
})

export const Playground = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The nominal case: one primary action, default pull. Check that the wrapper never costs the button its click or its keyboard access — tab to it and press Enter, the pull has no say in either.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const button = canvas.getByRole("button", { name: "Get started" })

		await userEvent.tab()
		await expect(button).toHaveFocus()

		await userEvent.keyboard("{Enter}")
		await expect(args.onClick).toHaveBeenCalled()
	},
})

export const Strengths = meta.story({
	render: () => (
		<Row>
			{STRENGTHS.map((strength) => (
				<MagneticButton key={strength} variant="outline" strength={strength}>
					{`${strength}`}
				</MagneticButton>
			))}
		</Row>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The pull, from a hint to a grab. Check that even at 0.5 the cursor never falls outside the button it is dragging — past that the control chases the pointer and the click starts missing. Stay at or below the 0.25 default for anything a reader clicks often.",
			},
		},
	},
})

export const States = meta.story({
	render: () => (
		<Row>
			<MagneticButton>Default</MagneticButton>
			<MagneticButton disabled>Disabled</MagneticButton>
		</Row>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Disabled next to the nominal case. The wrapper listens on itself rather than on the button, so check the pull is genuinely dead here: a control that leans toward the cursor while refusing the click reads as broken rather than as unavailable.",
			},
		},
	},
})

export const WithIcon = meta.story({
	render: () => (
		<MagneticButton
			size="icon"
			variant="secondary"
			aria-label="Start a new session"
		>
			<Icons.Add className="h-4 w-4" />
		</MagneticButton>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The floating single action this is most often reached for. A square target is smaller than a pill, so the pull runs out of room sooner — check the icon stays centred at rest. The `aria-label` lives on the button, not on the wrapper, which contributes no semantics at all.",
			},
		},
	},
})
