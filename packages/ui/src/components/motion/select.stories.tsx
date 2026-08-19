import { useState } from "react"
import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	Select,
	SelectContent,
	SelectItem,
	type SelectProps,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/motion/select"

/** `SelectItem` renders an `<li>` under a plain `div`, so axe's `listitem` rule
 * fires on any story that leaves the panel open. Reported, not hidden: `todo`
 * keeps the violation in the a11y panel while the markup is fixed upstream. */
const A11Y_LISTBOX_MARKUP_DEBT = { test: "todo" } as const

type Field = {
	placeholder: string
	options: { value: string; label: string; disabled?: boolean }[]
}

const MODES: Field = {
	placeholder: "Pick a mode",
	options: [
		{ value: "swift", label: "Swift" },
		{ value: "balanced", label: "Balanced" },
		{ value: "thorough", label: "Thorough" },
	],
}

const REGIONS: Field = {
	placeholder: "Pick a region",
	options: [
		{ value: "paris", label: "Paris" },
		{ value: "dublin", label: "Dublin" },
		{ value: "montreal", label: "Montreal", disabled: true },
		{ value: "sydney", label: "Sydney" },
	],
}

const POLICIES: Field = {
	placeholder: "Pick a policy",
	options: [
		{
			value: "retention",
			label: "Keep every transcript for ninety days, then archive",
		},
		{
			value: "ephemeral",
			label: "Discard transcripts as soon as the window closes",
		},
		{ value: "manual", label: "Keep until deleted by hand" },
	],
}

type FieldSelectProps = Field &
	Pick<
		SelectProps,
		"value" | "defaultValue" | "disabled" | "onValueChange" | "className"
	>

const FieldSelect = ({ placeholder, options, ...props }: FieldSelectProps) => (
	<Select {...props}>
		<SelectTrigger>
			<SelectValue placeholder={placeholder} />
		</SelectTrigger>
		<SelectContent>
			{options.map((option) => (
				<SelectItem
					key={option.value}
					value={option.value}
					disabled={option.disabled}
				>
					{option.label}
				</SelectItem>
			))}
		</SelectContent>
	</Select>
)

const ControlledRegion = () => {
	const [value, setValue] = useState("dublin")

	return (
		<div className="flex w-64 flex-col gap-3">
			<FieldSelect {...REGIONS} value={value} onValueChange={setValue} />
			<p className="text-muted-foreground text-xs">Deploying to {value}</p>
		</div>
	)
}

const meta = preview.meta({
	title: "Forms/Select",
	component: Select,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"A select whose panel is attached to its trigger rather than dropped on top of it. On open, the edge of the trigger facing the panel snaps flat, the panel unfolds out of it at zero height, then the two pinch apart and both round off — one gesture, not a fade. The options stagger in behind it. The panel is positioned rather than portalled, so it needs a trigger that is not inside a clipping ancestor, and it flips above the trigger on its own when there is no room below. Composed as `Select` → `SelectTrigger` + `SelectValue` → `SelectContent` → `SelectItem`; items stay mounted while closed so the trigger can keep resolving the selected label. Closes on Escape and on an outside press. Reach for it over `ActionSwapButton` as soon as a reader needs to see the options before choosing. Known defect, not yet fixed: `SelectItem` renders an `<li>` with no list around it, so every story that leaves the panel open trips axe's `listitem` rule — those stories mark it `todo` so the violation stays visible in the a11y panel instead of being hidden.",
			},
		},
	},
})

export const Default = meta.story({
	render: () => (
		<div className="w-64">
			<FieldSelect {...MODES} />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Nothing chosen yet: the trigger shows its placeholder in muted text, which is the state a form opens in. Check that the panel unfolds out of the trigger's bottom edge as one piece and that Escape closes it — a reader who opened it by accident must be able to leave without choosing.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: /Pick a mode/ })

		await expect(trigger).toHaveAttribute("aria-expanded", "false")

		await userEvent.click(trigger)
		await expect(trigger).toHaveAttribute("aria-expanded", "true")

		await userEvent.keyboard("{Escape}")
		await expect(trigger).toHaveAttribute("aria-expanded", "false")
	},
})

export const WithDefaultValue = meta.story({
	render: () => (
		<div className="w-64">
			<FieldSelect {...MODES} defaultValue="balanced" />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Uncontrolled with a starting value, the shape to reach for when the field has a sensible default and nothing outside the select needs to know about it. The label is resolved from the mounted items rather than passed in, so check the trigger reads `Balanced` on first paint with no flash of the placeholder.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("button")).toHaveTextContent("Balanced")
	},
})

export const Controlled = meta.story({
	render: () => <ControlledRegion />,
	parameters: {
		docs: {
			description: {
				story:
					"`value` owned by the caller. Reach for this whenever the same setting can change from anywhere else — a reset, a restored preference, a server default — otherwise the trigger and the state drift apart on the first choice. Check the caption below follows every selection, and that choosing closes the panel.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: /Dublin/ }))
		await userEvent.click(canvas.getByRole("option", { name: "Sydney" }))

		await expect(canvas.getByText("Deploying to sydney")).toBeVisible()
	},
})

export const States = meta.story({
	parameters: {
		pseudo: {
			hover: ".select-hover button",
			focusVisible: ".select-focus button",
		},
		docs: {
			description: {
				story:
					"Every state the closed trigger can be in. Hover strengthens the border, focus draws its own ring, and `disabled` on the `Select` drops both the pointer events and the keyboard, so the panel cannot be reached at all. Check the disabled trigger still reads its value — a field a reader cannot change is not a field whose value should be hidden.",
			},
		},
	},
	render: () => (
		<div className="flex w-64 flex-col gap-4">
			<FieldSelect {...MODES} defaultValue="swift" />
			<FieldSelect {...MODES} className="select-hover" defaultValue="swift" />
			<FieldSelect {...MODES} className="select-focus" defaultValue="swift" />
			<FieldSelect {...MODES} defaultValue="swift" disabled />
		</div>
	),
})

export const WithDisabledItem = meta.story({
	render: () => (
		<div className="w-64">
			<FieldSelect {...REGIONS} defaultValue="paris" />
		</div>
	),
	parameters: {
		a11y: A11Y_LISTBOX_MARKUP_DEBT,
		docs: {
			description: {
				story:
					"One option present but unavailable. Reach for `disabled` over removing the row whenever its absence would be confusing — a region that exists but is full still belongs in the list. Check it dims, refuses the press, and keeps announcing itself as an option so its existence is not a purely visual fact.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: /Paris/ }))
		await expect(canvas.getByRole("option", { name: "Montreal" })).toBeDisabled()
	},
})

export const LongContent = meta.story({
	render: () => (
		<div className="w-64">
			<FieldSelect {...POLICIES} defaultValue="retention" />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Labels longer than the trigger. The panel is pinned to the trigger's width, so the rows wrap rather than widen — check the panel height animates to the wrapped height instead of clipping the last line, and that the trigger itself truncates rather than pushing the layout. Reach for a shorter label plus a description beneath the field wherever this starts wrapping to three lines.",
			},
		},
	},
})

export const FlipsUp = meta.story({
	parameters: {
		layout: "fullscreen",
		a11y: A11Y_LISTBOX_MARKUP_DEBT,
		docs: {
			description: {
				story:
					"The trigger pinned to the bottom of the viewport, where the panel has nowhere to unfold. On open it measures the room below against the room above and flips: the panel attaches to the trigger's top edge, the flat corners move to the other side and the gap opens upward. Check that no corner is left square after a flip — every corner is written on every render precisely so a second open cannot strand one.",
			},
		},
	},
	render: () => (
		<div className="flex h-screen items-end justify-center p-4">
			<div className="w-64">
				<FieldSelect {...MODES} defaultValue="swift" />
			</div>
		</div>
	),
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: /Swift/ })

		await userEvent.click(trigger)
		await expect(trigger).toHaveAttribute("aria-expanded", "true")
	},
})

export const InForm = meta.story({
	render: () => (
		<form className="flex w-72 flex-col gap-2 rounded-xl border border-border p-4">
			<span className="font-medium text-foreground text-sm">Answer mode</span>
			<FieldSelect {...MODES} defaultValue="thorough" />
			<p className="text-muted-foreground text-xs">
				Thorough reads more files before answering.
			</p>
		</form>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The field as it is actually shipped: a name above it, a hint below. The trigger is a button rather than a native `<select>`, so it carries no form value of its own — the caller holds the state and submits it. Check the hint sits close enough to read as belonging to the field, and that opening the panel does not push it down.",
			},
		},
	},
})
