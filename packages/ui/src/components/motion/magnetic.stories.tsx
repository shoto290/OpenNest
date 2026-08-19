import preview from "@workspace/storybook/preview"
import { Row } from "@workspace/storybook/story-utils"
import { Icons } from "@workspace/ui/components/icons"
import { Button } from "@workspace/ui/components/motion/button/base"
import { Magnetic } from "@workspace/ui/components/motion/magnetic"

const STRENGTHS = [0.15, 0.35, 0.6]

const meta = preview.meta({
	title: "Primitives/Magnetic",
	component: Magnetic,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"A wrapper that lets its child lean toward the cursor. It measures the pointer against its own centre and springs an offset out of that distance, so the child drifts a fraction of the way to the cursor and settles back the moment the pointer leaves. It is decoration, never affordance: the child keeps its own hit area, its own focus ring and its own label, and the pull is skipped entirely under `prefers-reduced-motion` and on pointers that cannot hover — a touch device would otherwise strand the child off-centre after a tap. Reach for it on the one control a screen is built around; a row of them reads as noise. Wrapping a button? `MagneticButton` already composes the two.",
			},
		},
	},
	args: { strength: 0.35 },
	argTypes: {
		strength: { control: { type: "range", min: 0, max: 1, step: 0.05 } },
	},
})

export const Playground = meta.story({
	args: { children: <Button>Point at me</Button> },
	parameters: {
		docs: {
			description: {
				story:
					"The nominal case: one control, default pull. Check that the button follows the cursor without ever leaving it behind, that it springs back to centre on leave rather than snapping, and that clicking still lands — the wrapper must never eat the press.",
			},
		},
	},
})

export const Strengths = meta.story({
	render: () => (
		<Row>
			{STRENGTHS.map((strength) => (
				<Magnetic key={strength} strength={strength}>
					<Button variant="outline">{`${strength}`}</Button>
				</Magnetic>
			))}
		</Row>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The usable range of `strength`, which is the fraction of the cursor's offset the child travels. Check that 0.15 reads as a hint and 0.6 as a grab, and that even at 0.6 the child never travels far enough for the cursor to fall outside it — past that the control chases the pointer and becomes hard to click.",
			},
		},
	},
})

export const ZeroValue = meta.story({
	render: () => (
		<Magnetic strength={0}>
			<Button variant="outline">No pull</Button>
		</Magnetic>
	),
	parameters: {
		docs: {
			description: {
				story:
					"`strength` at 0: the springs still run, they just resolve to zero, so the child never moves. Reach for this to switch the effect off from a prop rather than branching the markup, and check it is visually identical to a bare button — this is also what the wrapper collapses to under reduced motion and on touch.",
			},
		},
	},
})

export const WithIcon = meta.story({
	render: () => (
		<Magnetic>
			<Button size="icon" variant="secondary" aria-label="Start a new chat">
				<Icons.Add className="h-4 w-4" />
			</Button>
		</Magnetic>
	),
	parameters: {
		docs: {
			description: {
				story:
					"An icon-only control, which is the shape this is usually reached for — a single floating action. Check that the button carries its own `aria-label`: the wrapper adds no semantics at all, so a control with no visible text is unnamed unless it names itself.",
			},
		},
	},
})
