import preview from "@workspace/storybook/preview"
import { TextShimmer } from "@workspace/ui/components/motion/text-shimmer"

const DURATIONS = [1, 2.5, 5]

const meta = preview.meta({
	title: "Primitives/TextShimmer",
	component: TextShimmer,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"Text that reads as still working. A light band sweeps across the glyphs on a loop, from `--muted-foreground` through `--foreground` and back, by clipping a gradient to the text rather than painting anything on top of it. Reach for it on a label whose work has no measurable progress — a turn being drafted, a tool still thinking — and drop it the moment there is a number to show, where a progress bar says more. It is a single looping CSS animation with no exit: it stops when the label is replaced, so keep the swap in the caller. Two cautions carry: the glyphs are painted through `bg-clip-text` on transparent text, so the label must never be the only copy of a status a reader needs, and under `prefers-reduced-motion` it drops the gradient and settles on `--muted-foreground` rather than sweeping.",
			},
		},
	},
	args: { children: "Drafting the release note", duration: 2.5 },
	argTypes: {
		children: { control: "text" },
		duration: { control: { type: "number", min: 0.5, step: 0.5 } },
		as: { control: false },
	},
})

export const Playground = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The nominal case: a short status label, sweeping on the default 2.5s loop. Check that the band crosses left to right without a seam at the wrap point, and that the darkest phase still reads as body text rather than as a disabled label.",
			},
		},
	},
})

export const Durations = meta.story({
	render: () => (
		<div className="flex flex-col items-start gap-3 text-sm">
			{DURATIONS.map((duration) => (
				<TextShimmer key={duration} duration={duration}>
					{`Sweeping every ${duration}s`}
				</TextShimmer>
			))}
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The full range worth using, from urgent to ambient. Check that 1s reads as impatient rather than as a flicker, that 5s stays legible through the slow dark phase, and pick the low end only for work a reader is actively waiting on.",
			},
		},
	},
})

export const AsHeading = meta.story({
	render: () => (
		<TextShimmer as="h2" className="font-semibold text-2xl">
			Assembling the workspace
		</TextShimmer>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Rendered through `as` onto a real heading instead of the default `span`, which is how a full-page waiting state keeps its document outline. Check that the gradient scales with the type — the band is a fraction of the text box, so larger type gets a proportionally wider sweep rather than a faster one.",
			},
		},
	},
})

export const LongContent = meta.story({
	render: () => (
		<p className="max-w-sm text-sm leading-6">
			<TextShimmer>
				Reading every file the last commit touched, then summarising what
				changed
			</TextShimmer>
		</p>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A sentence long enough to wrap. The gradient is sized to the whole box, so every line sweeps in step rather than each one running its own band — check that the effect still reads as one surface and not as several. Reach for `Playground` instead wherever the label fits on one line; anything this long is usually a sign the status belongs in a sentence that is not animated.",
			},
		},
	},
})
