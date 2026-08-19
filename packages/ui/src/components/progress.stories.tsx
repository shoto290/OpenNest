import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	Progress,
	ProgressLabel,
	ProgressRing,
	ProgressValue,
} from "@workspace/ui/components/progress"

interface DownloadStep {
	label: string
	value: number
}

const DOWNLOAD_STEPS: DownloadStep[] = [
	{ label: "Fetching signature", value: 8 },
	{ label: "Downloading update", value: 50 },
	{ label: "Verified", value: 100 },
]

const RING_VALUE = 64

const meta = preview.meta({
	title: "Feedback/Progress",
	component: Progress,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					'A determinate task, read as a filling bar. It is a report, never a control: it holds no action and no cancel, so pair it with whatever owns the task. `Progress` is the assembled bar — pass a `ProgressLabel` and a `ProgressValue` as children and they sit above the track, which is why the root wraps. `ProgressRoot` is the same semantics with no track at all, and `ProgressRing` is the shape built on it. Either way `role="progressbar"` needs a name: give it a `ProgressLabel`, which wires `aria-labelledby` for you, or an `aria-label`.',
			},
		},
	},
	args: { value: 40, "aria-label": "Download progress", className: "w-80" },
	argTypes: {
		value: { control: { type: "range", min: 0, max: 100, step: 1 } },
	},
})

export const Playground = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The knob story: drag `value` from end to end and watch the indicator ease rather than jump, since the track transitions on every change. Check that the bar keeps the width it is given — it has no intrinsic size, so a root with no width class collapses. Pick `Values` to compare the ends of the range side by side.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("progressbar")).toHaveAttribute(
			"aria-valuenow",
			"40",
		)
	},
})

export const Values = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The three points worth reviewing at once: barely started, halfway, and done. Check that 8% still paints a visible sliver instead of rounding away to nothing, that the readout stays on tabular figures so it does not jitter as it counts up, and that 100% fills the track edge to edge with the same radius as the track itself. Pick `Indeterminate` for a task whose size is unknown.",
			},
		},
	},
	render: () => (
		<div className="flex w-80 flex-col gap-6">
			{DOWNLOAD_STEPS.map((step) => (
				<Progress key={step.label} value={step.value}>
					<ProgressLabel>{step.label}</ProgressLabel>
					<ProgressValue />
				</Progress>
			))}
		</div>
	),
	play: async ({ canvas }) => {
		const bars = canvas.getAllByRole("progressbar")

		await expect(bars).toHaveLength(DOWNLOAD_STEPS.length)
		for (const [index, step] of DOWNLOAD_STEPS.entries())
			await expect(bars[index]).toHaveAttribute(
				"aria-valuenow",
				String(step.value),
			)
		await expect(bars[DOWNLOAD_STEPS.length - 1]).toHaveAttribute(
			"data-complete",
		)
	},
})

export const Indeterminate = meta.story({
	args: { value: null, "aria-label": undefined },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for `value={null}` when the task has started but its size is unknown — a download with no `Content-Length`, a verification that reports done or not at all. Check that no percentage is announced: the root drops `aria-valuenow` and flips to `data-indeterminate`, so a screen reader says busy rather than a made-up number. The track stays flat here — this surface has no indeterminate animation yet, so prefer a spinner if the wait is long enough to need one.",
			},
		},
	},
	render: () => (
		<Progress className="w-80" value={null}>
			<ProgressLabel>Verifying signature</ProgressLabel>
		</Progress>
	),
	play: async ({ canvas }) => {
		const bar = canvas.getByRole("progressbar", { name: "Verifying signature" })

		await expect(bar).toHaveAttribute("data-indeterminate")
		await expect(bar).not.toHaveAttribute("aria-valuenow")
	},
})

export const AsRing = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"`ProgressRing` is the same value closing as an arc instead of filling a bar, for the places a bar cannot go — this is how `Feedback/UpdateBadge` reports its download around a 36px button. Check that the arc starts at twelve o'clock, that it grows clockwise, and that the value still reaches assistive technology from the root, since the drawing itself is `aria-hidden` and carries none of it. Size it from `className`: the arc scales with the box, so it has no size prop of its own.",
			},
		},
	},
	render: () => (
		<ProgressRing
			aria-label="Update download progress"
			className="size-9"
			value={RING_VALUE}
		/>
	),
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("progressbar", { name: "Update download progress" }),
		).toHaveAttribute("aria-valuenow", String(RING_VALUE))
	},
})
