import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { MarkdownProse } from "@workspace/storybook/story-utils"
import { MarkdownTaskCheckbox } from "@workspace/ui/components/markdown/task-list"

interface Task {
	label: string
	isDone: boolean
}

const TASKS: Task[] = [
	{ label: "read the nest", isDone: true },
	{ label: "summarise the occupants", isDone: true },
	{ label: "archive the record", isDone: false },
	{ label: "notify the owner", isDone: false },
]

const meta = preview.meta({
	title: "Conversation/Markdown/MarkdownTaskCheckbox",
	component: MarkdownTaskCheckbox,
	parameters: {
		docs: {
			description: {
				component:
					"The box GFM emits for a task list item. A transcript is a record, not a form: the box never changes under the reader, so it stays read-only whether or not the parser marked it disabled, and it names its own state — Done or To do — instead of borrowing the item text through a label. The item text stays a sibling, so a screen reader reads the state and the task as two separate things and the copied transcript keeps its own wording.",
			},
		},
	},
	args: { type: "checkbox", checked: true },
	decorators: [(Story) => <MarkdownProse>{Story()}</MarkdownProse>],
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A checklist as an agent reports progress, both states in one list — the parser marks every box disabled. Check that the list marker is gone, that each box aligns with the first line of its label, and that the checked fill takes the primary token in both themes — flip the theme layout toolbar to side-by-side.",
			},
		},
	},
	render: () => (
		<ul>
			{TASKS.map(({ isDone, label }) => (
				<li key={label} className="task-list-item">
					<MarkdownTaskCheckbox type="checkbox" checked={isDone} disabled />
					{label}
				</li>
			))}
		</ul>
	),
	play: async ({ canvas }) => {
		await expect(
			canvas.getAllByRole("checkbox", { name: "Done" }),
		).toHaveLength(2)
		await expect(
			canvas.getAllByRole("checkbox", { name: "To do" }),
		).toHaveLength(2)
	},
})

export const ReadOnly = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The edge the component exists for: a box the parser left enabled, so a reader can reach it and click it. `readonly` has no effect on a checkbox in HTML, so the guarantee comes from the controlled value — the click is taken and the state is restored. Check that the box does not toggle and that its accessible name still reads Done.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const box = canvas.getByRole("checkbox", { name: "Done" })

		await userEvent.click(box)

		await expect(box).toBeChecked()
	},
})
