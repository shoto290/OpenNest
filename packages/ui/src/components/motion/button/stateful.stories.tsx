import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	listExhaustively,
	Row,
	withStoryProps,
} from "@workspace/storybook/story-utils"
import { Icons } from "@workspace/ui/components/icons"
import {
	type ButtonState,
	StatefulButton,
	type StatefulButtonProps,
} from "@workspace/ui/components/motion/button/stateful"

type StoryProps = Pick<
	StatefulButtonProps,
	| "state"
	| "children"
	| "loadingText"
	| "successText"
	| "errorText"
	| "icon"
	| "disabled"
>

const BUTTON_STATES = listExhaustively<ButtonState>({
	idle: true,
	loading: true,
	success: true,
	error: true,
})

const meta = preview.meta({
	title: "Primitives/StatefulButton",
	component: withStoryProps<StoryProps>(StatefulButton),
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"One button that carries the whole outcome of the action it fires. `state` drives everything: the label cascades letter by letter into the next one, an icon slides in and animates its own width open so the pill grows instead of jumping, and the width springs to fit the new text. `loading` disables the button and sets `aria-busy`, and the label sits in an `aria-live=\"polite\"` region so the outcome is announced rather than only drawn. The state is the caller's to own — this component never transitions on its own, which is what keeps it honest about the request behind it. Under `prefers-reduced-motion` the cascade collapses to a fade and the width snaps. Reach for it on a submit whose result belongs in the button; where the outcome deserves a sentence, keep a plain button and put the sentence next to it.",
			},
		},
	},
	args: { children: "Save changes", state: "idle" },
	argTypes: {
		state: { control: "inline-radio", options: BUTTON_STATES },
		children: { control: "text" },
		loadingText: { control: "text" },
		successText: { control: "text" },
		errorText: { control: "text" },
		icon: { control: false },
	},
})

export const Playground = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The nominal case, idle. Flip `state` in the controls to watch one label cascade into the next: check that the pill's width follows the text as one motion and never overshoots, and that no glyph is clipped at either end while it travels.",
			},
		},
	},
})

export const States = meta.story({
	render: () => (
		<Row>
			{BUTTON_STATES.map((state) => (
				<StatefulButton key={state} state={state}>
					Save changes
				</StatefulButton>
			))}
		</Row>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Every state at once, in the order a submit walks through them. Check that each one is legible without its icon — the spinner, the check and the cross reinforce the label, they never replace it — and that all four pills sit on the same baseline despite their different widths.",
			},
		},
	},
})

export const Loading = meta.story({
	args: { state: "loading" },
	parameters: {
		docs: {
			description: {
				story:
					"The pending surface. This is the one state that changes behaviour rather than only appearance: the button disables itself and reports `aria-busy`, so a second submit cannot be fired while the first is in flight. Reach for it the moment the request leaves, not after a delay — a button that stays idle under a click reads as dropped.",
			},
		},
	},
	play: async ({ canvas }) => {
		const button = canvas.getByRole("button")

		await expect(button).toBeDisabled()
		await expect(button).toHaveAttribute("aria-busy", "true")
	},
})

export const Error = meta.story({
	args: { state: "error" },
	parameters: {
		docs: {
			description: {
				story:
					"The failure surface. The default label is `Try again` rather than a diagnosis, because the button can only offer the retry — the reason belongs in a notice beside it. Check that the button is clickable again here: unlike `loading`, `error` is a state a reader must be able to act on.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("button")).toBeEnabled()
	},
})

export const WithIcon = meta.story({
	args: { icon: <Icons.Copy className="h-4 w-4" /> },
	parameters: {
		docs: {
			description: {
				story:
					"An `icon` for the idle state only — it animates out as soon as the state changes, so the slot never holds two icons at once. Check the pill narrows smoothly as it leaves rather than dropping the width in a frame, and keep the icon decorative: the label already names the action.",
			},
		},
	},
})

export const WithCustomLabels = meta.story({
	args: {
		children: "Deploy",
		loadingText: "Deploying",
		successText: "Deployed",
		errorText: "Deploy failed",
		state: "loading",
	},
	parameters: {
		docs: {
			description: {
				story:
					"`loadingText`, `successText` and `errorText` overriding the generic defaults. Reach for this whenever the action has a verb of its own — `Deploying` tells a reader what is in flight where `Loading` does not. Keep the four labels close in length; the width spring is what makes them feel like one button rather than four.",
			},
		},
	},
})

export const LongContent = meta.story({
	args: {
		children: "Publish this release to every workspace",
		successText: "Published",
		state: "idle",
	},
	parameters: {
		docs: {
			description: {
				story:
					"A label far longer than its outcome, which is the worst case for the width spring. Check that the pill does not wrap and that the collapse to `Published` stays a single continuous motion. Reach for a shorter verb instead wherever you can — the cascade staggers per letter, so a label this long takes visibly longer to resolve.",
			},
		},
	},
})
