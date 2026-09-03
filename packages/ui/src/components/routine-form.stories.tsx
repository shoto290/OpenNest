import { useState } from "react"
import { expect, fn, screen, spyOn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	slotIn,
} from "@workspace/storybook/story-utils"
import {
	EMPTY_ROUTINE_VALUES,
	type RoutineFilterRow,
	RoutineForm,
	type RoutineFormModel,
	type RoutineFormProps,
} from "@workspace/ui/components/routine-form"
import {
	CALLED_FORM,
	FILTERED_FORM,
	INBOX_FORM,
	SCHEDULED_FORM,
	TRIGGER_SOURCES,
	UNDESCRIBED_FORM,
	WATCHING_FORM,
} from "@workspace/ui/components/routines.fixtures"
import { ROUTINES_PANEL_WIDTH } from "@workspace/ui/components/routines-panel"

const meta = preview.meta({
	title: "Conversation/Routines/RoutineForm",
	component: RoutineForm,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The form a routine is created and edited in, as it reads inside the routines panel: a title, an instruction, the trigger that fires it, and whatever that one trigger needs — a cron expression, a watched path, the address and key of a local webhook, or nothing at all. Creating picks the trigger among the ones the bot declares; editing shows it read only, because the key and the configuration of a routine are tied to it. Refusals come back from the write and land under the field they name, with everything the reader typed still in place. Reach for it inside `RoutinesPanel`; on its own it is only useful to check one trigger's fields.",
			},
		},
	},
	args: {
		...SCHEDULED_FORM,
		onSave: fn(),
		sources: TRIGGER_SOURCES,
	},
	render: (args) => (
		<div style={{ width: ROUTINES_PANEL_WIDTH }}>
			<RoutineForm {...args} />
		</div>
	),
})

export const Default = meta.story({
	args: { id: null, values: EMPTY_ROUTINE_VALUES },
	parameters: {
		docs: {
			description: {
				story:
					"The form a reader lands on after picking the new routine action: nothing filled, no trigger picked, no configuration field yet. Check that the trigger list leaves none of the declared sources out, that picking the schedule brings the cron expression field with it, and that the save control stays operable rather than waiting for the form to be valid — a refusal is the write's answer, not a disabled button.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("combobox"))
		await screen.findByRole("listbox", { name: "Trigger" })

		await expect(await screen.findAllByRole("option")).toHaveLength(
			TRIGGER_SOURCES.length,
		)

		await userEvent.click(
			await screen.findByRole("option", { name: "On a schedule" }),
		)
		await expect(
			canvas.getByRole("textbox", { name: "Cron expression" }),
		).toBeVisible()
		await expect(
			canvas.getByRole("button", { name: "Save routine" }),
		).toBeEnabled()
	},
})

export const OnASchedule = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A written routine the cron fires. Check that the trigger reads as text rather than a list, that the line under it says why it cannot be changed, and that the expression the routine was read with is the one in the field. Pick `Default` for the form that still lets the trigger be chosen.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByDisplayValue("On a schedule")).toHaveAttribute(
			"readonly",
		)
		await expect(canvas.getByDisplayValue("0 8 * * *")).toBeVisible()

		await userEvent.click(canvas.getByRole("button", { name: "Save routine" }))
		await expect(args.onSave).toHaveBeenCalledWith(SCHEDULED_FORM.values)
	},
})

export const OnAWatchedFile = meta.story({
	args: WATCHING_FORM,
	parameters: {
		docs: {
			description: {
				story:
					"A written routine a file change fires. Check that the watched path is the only configuration field on screen — no cron expression, no webhook block — and that a path long enough to overflow the panel stays readable rather than pushing the field wider.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByDisplayValue("/notes/CHANGELOG.md")).toBeVisible()
		await expect(
			canvas.queryByRole("textbox", { name: "Cron expression" }),
		).not.toBeInTheDocument()
	},
})

export const OnAWebhookCall = meta.story({
	args: CALLED_FORM,
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A written routine a local webhook call fires, once its key has been minted. Check that the address, the key and the header name all read as read only, that each carries its own copy control and its value rather than a description standing in for it, and that copying announces itself in the polite region rather than through the icon alone. Pick `BeforeItsFirstWrite` for the same trigger before the key exists.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const writeText = spyOn(
			navigator.clipboard,
			"writeText",
		).mockResolvedValue()

		await expect(
			canvas.getByDisplayValue("http://127.0.0.1:45367/routines/call"),
		).toHaveAttribute("readonly")
		await expect(canvas.getByDisplayValue("X-OpenNest-Delivery")).toBeVisible()

		await userEvent.click(
			canvas.getByRole("button", { name: "Copy the Key of this routine" }),
		)
		await expect(writeText).toHaveBeenCalledWith(CALLED_FORM.webhook?.key)
		await expect(await canvas.findByText("Key copied")).toBeInTheDocument()

		const key = canvas.getByLabelText("Key")
		await expect(key).toHaveValue(CALLED_FORM.webhook?.key)
		await expect(key).not.toHaveAccessibleDescription()

		writeText.mockRestore()
	},
})

export const BeforeItsFirstWrite = meta.story({
	args: {
		id: null,
		values: { ...EMPTY_ROUTINE_VALUES, triggerSourceId: "local-webhook" },
	},
	parameters: {
		docs: {
			description: {
				story:
					"The webhook trigger picked on a routine that was never written: the key is minted by the write, so the three fields hold nothing yet. Check that they are still on screen rather than appearing out of nowhere after the first save, that one line says they arrive with the save, and that no copy control offers to copy an empty value.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText(
				"The address, the key and the header name are available once the routine is saved.",
			),
		).toBeVisible()
		await expect(
			canvas.queryByRole("button", { name: "Copy the Key of this routine" }),
		).not.toBeInTheDocument()
	},
})

export const KeyStillReading = meta.story({
	args: { ...CALLED_FORM, webhook: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"Every edit of a webhook routine starts here: the routine is written, its key is read after the form opens, and the three fields hold nothing for as long as that read is out. Check that the block says the read is running instead of borrowing the line of a routine that was never written, that it says it once — never beside the pending line or the failure — and that each of the three fields is described by it, so a reader tabbing into an empty control is told why it is empty rather than meeting a blank. Pick `BeforeItsFirstWrite` for the routine that has no key yet, `KeyUnreadable` for the read that came back empty handed.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText("The address and the key are being read."),
		).toBeVisible()
		await expect(
			canvas.queryByText(
				"The address, the key and the header name are available once the routine is saved.",
			),
		).not.toBeInTheDocument()
		await expect(
			canvas.queryByText(
				"The address and the key of this routine could not be read.",
			),
		).not.toBeInTheDocument()
		await expect(canvas.getByLabelText("Key")).toHaveAccessibleDescription(
			"The address and the key are being read.",
		)
	},
})

const FAIL_THE_READ = "Fail the key read"

const KeyReadHost = (props: RoutineFormProps) => {
	const [hasFailedToReadKey, setFailed] = useState(false)

	return (
		<div
			className="flex flex-col gap-3"
			style={{ width: ROUTINES_PANEL_WIDTH }}
		>
			<button onClick={() => setFailed(true)} type="button">
				{FAIL_THE_READ}
			</button>
			<RoutineForm {...props} hasFailedToReadKey={hasFailedToReadKey} />
		</div>
	)
}

export const KeyReadFailingWhileOpen = meta.story({
	args: { ...CALLED_FORM, webhook: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"The read of the key failing under a form the reader is already looking at, the way it happens in the panel. The control beside the form stands in for the read coming back. Check that the failure replaces the reading line in the same status region rather than in a second one, that the form is never remounted under it, and so that a screen reader hears the failure instead of being left on the last thing it was told.",
			},
		},
	},
	render: (args) => <KeyReadHost {...args} />,
	play: async ({ canvas, canvasElement, userEvent }) => {
		const region = canvas.getByRole("status")
		const form = slotIn(canvasElement, "routine-form")

		await expect(region).toHaveTextContent(
			"The address and the key are being read.",
		)

		await userEvent.click(canvas.getByRole("button", { name: FAIL_THE_READ }))

		await expect(canvas.getByRole("status")).toBe(region)
		await expect(region).toHaveTextContent(
			"The address and the key of this routine could not be read.",
		)
		await expect(slotIn(canvasElement, "routine-form")).toBe(form)
	},
})

export const OnASourceWithNoConfiguration = meta.story({
	args: INBOX_FORM,
	parameters: {
		docs: {
			description: {
				story:
					"A trigger the bot declares that takes nothing of its own. Check that the form stops at the trigger — no expression, no path, no webhook block — so what the reader saves carries an empty configuration.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.queryByRole("textbox", { name: "Cron expression" }),
		).not.toBeInTheDocument()
		await expect(
			canvas.queryByRole("textbox", { name: "Watched path" }),
		).not.toBeInTheDocument()
		await expect(canvas.queryByText("Address")).not.toBeInTheDocument()
	},
})

export const Refused = meta.story({
	args: { ...SCHEDULED_FORM, refusal: "unreadableExpression" },
	parameters: {
		docs: {
			description: {
				story:
					"The write came back refusing the expression the cron reader could not read. Check that the refusal sits under the expression field and is tied to it by `aria-describedby` rather than floating at the top of the panel, that the field reads invalid, and that the title and the instruction still hold what the reader typed. Pick `RefusedBlankTitle` for the refusal that names another field.",
			},
		},
	},
	play: async ({ canvas }) => {
		const field = canvas.getByRole("textbox", { name: "Cron expression" })
		const message = canvas.getByText(
			"This expression cannot be read as a schedule.",
		)

		await expect(field).toHaveAttribute("aria-invalid", "true")
		await expect(field.getAttribute("aria-describedby")).toContain(message.id)
		await expect(canvas.getByDisplayValue("Morning digest")).toBeVisible()
	},
})

export const RefusedBlankTitle = meta.story({
	args: {
		...SCHEDULED_FORM,
		refusal: "blankTitle",
		values: { ...SCHEDULED_FORM.values, title: "" },
	},
	parameters: {
		docs: {
			description: {
				story:
					"The write came back naming the title as blank. Check that the refusal lands under the title and nowhere else, and that the instruction and the expression are untouched by it.",
			},
		},
	},
	play: async ({ canvas }) => {
		const field = canvas.getByRole("textbox", { name: "Title" })

		await expect(field).toHaveAttribute("aria-invalid", "true")
		await expect(
			canvas.getByRole("textbox", { name: "Cron expression" }),
		).not.toHaveAttribute("aria-invalid")
	},
})

export const KeyUnreadable = meta.story({
	args: { ...CALLED_FORM, hasFailedToReadKey: true, webhook: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"The routine is written and its key could not be read. Check that the failure is said in the webhook block instead of being swallowed, and that the rest of the form still renders and still saves — a key that cannot be read costs the address, not the routine.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText(
				"The address and the key of this routine could not be read.",
			),
		).toBeVisible()
		await expect(canvas.getByDisplayValue("Deploy report")).toBeVisible()
	},
})

const filtered = (rows: RoutineFilterRow[]): RoutineFormModel => ({
	...INBOX_FORM,
	values: { ...INBOX_FORM.values, filter: { matchMode: "all", rows } },
})

const PRESENCE_FILTER = filtered([
	{ field: "receivedAt", operator: "exists", value: "" },
])

const BOOLEAN_FILTER = filtered([
	{ field: "isFlagged", operator: "equals", value: "true" },
])

const OTHER_PATH_FILTER = filtered([
	{ field: "sender.address", operator: "exists", value: "" },
])

const NUMBER_FILTER = filtered([
	{ field: "unreadCount", operator: "gt", value: "10" },
])

const MISSING_VALUE_FILTER = filtered([
	{ field: "subject", operator: "contains", value: "" },
])

const LONG_FILTER = filtered([
	{
		field: "subject",
		operator: "contains",
		value: "quarterly-invoice-reconciliation-2026-north-region",
	},
	{
		field: "delivery.attachments.first.originalFileName",
		operator: "exists",
		value: "",
	},
])

export const FilterWithoutARow = meta.story({
	args: INBOX_FORM,
	parameters: {
		docs: {
			description: {
				story:
					"A routine no row narrows: every event the trigger reports runs it. Check that the block says so in words rather than showing an empty list, and that the match mode is absent — one row is what makes the question of every or any worth asking. Pick `FilterOnTwoRows` for the same block once rows exist.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText("Every event runs this routine."),
		).toBeVisible()
		await expect(
			canvas.queryByRole("combobox", { name: "Run when" }),
		).not.toBeInTheDocument()
		await expect(
			canvas.getByRole("button", { name: "Add a row" }),
		).toBeVisible()
	},
})

export const FilterOnTwoRows = meta.story({
	args: FILTERED_FORM,
	parameters: {
		docs: {
			description: {
				story:
					"A saved filter reopened: two rows in the order they were saved, each with the field, the operator and the value they were saved with, under one match mode for the whole list. Check that the rows carry their rank for a screen reader, that appending a row lands the focus on the field control of that row, that removing it hands the focus to the row that took its place, and that saving sends the rows as they stand.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const rowOne = within(canvas.getByRole("group", { name: "Row 1" }))
		const rowTwo = within(canvas.getByRole("group", { name: "Row 2" }))

		await expect(
			canvas.getByRole("combobox", { name: "Run when" }),
		).toHaveTextContent("Any row holds")
		await expect(
			rowOne.getByRole("combobox", { name: "Field" }),
		).toHaveTextContent("subject")
		await expect(
			rowOne.getByRole("combobox", { name: "Operator" }),
		).toHaveTextContent("contains")
		await expect(rowOne.getByRole("textbox", { name: "Value" })).toHaveValue(
			"invoice",
		)
		await expect(rowTwo.getByRole("spinbutton", { name: "Value" })).toHaveValue(
			10,
		)

		await userEvent.click(canvas.getByRole("button", { name: "Add a row" }))
		const rowThree = within(canvas.getByRole("group", { name: "Row 3" }))
		await expect(
			rowThree.getByRole("combobox", { name: "Field" }),
		).toHaveFocus()

		await userEvent.click(
			rowThree.getByRole("button", { name: "Remove the row on subject" }),
		)
		await expect(
			within(canvas.getByRole("group", { name: "Row 2" })).getByRole(
				"combobox",
				{
					name: "Field",
				},
			),
		).toHaveFocus()

		await userEvent.click(canvas.getByRole("button", { name: "Save routine" }))
		await expect(args.onSave).toHaveBeenCalledWith(FILTERED_FORM.values)
	},
})

export const FilterOnAPresentField = meta.story({
	args: PRESENCE_FILTER,
	parameters: {
		docs: {
			description: {
				story:
					"A row whose operator asks nothing but presence. Check that no value control is drawn for it — an operator that takes no value must not leave a box the reader could fill and lose — and that removing the only row hands the focus back to the control that appends one.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const row = within(canvas.getByRole("group", { name: "Row 1" }))

		await expect(
			row.getByRole("combobox", { name: "Operator" }),
		).toHaveTextContent("is present")
		await expect(
			row.queryByRole("textbox", { name: "Value" }),
		).not.toBeInTheDocument()

		await userEvent.click(
			row.getByRole("button", { name: "Remove the row on receivedAt" }),
		)
		await expect(
			canvas.getByRole("button", { name: "Add a row" }),
		).toHaveFocus()
	},
})

export const FilterOnABooleanField = meta.story({
	args: BOOLEAN_FILTER,
	parameters: {
		docs: {
			description: {
				story:
					"A row on a field the source declares as a boolean. Check that the value is picked from a list holding true and false and nothing else, so no typed word can reach a field that takes neither, and that the operator list is the short one a boolean accepts.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const row = within(canvas.getByRole("group", { name: "Row 1" }))
		const value = row.getByRole("combobox", { name: "Value" })

		await expect(value).toHaveTextContent("True")
		await userEvent.click(value)
		await expect(await screen.findAllByRole("option")).toHaveLength(2)
	},
})

export const FilterOnAnotherPath = meta.story({
	args: OTHER_PATH_FILTER,
	parameters: {
		docs: {
			description: {
				story:
					"A row on a dotted path the source does not declare. Check that the field control reads as another path and brings a text control for the path itself, and that the operator list holds presence alone: the engine reads a value through the type its source declares, so a path no source declares can only be asked whether it is there. Pick `FilterOnABooleanField` for a field whose declared type opens the comparison operators.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const row = within(canvas.getByRole("group", { name: "Row 1" }))

		await expect(
			row.getByRole("combobox", { name: "Field" }),
		).toHaveTextContent("Another path")
		await expect(row.getByRole("textbox", { name: "Path" })).toHaveValue(
			"sender.address",
		)
		await expect(
			row.queryByRole("textbox", { name: "Value" }),
		).not.toBeInTheDocument()

		await userEvent.click(row.getByRole("combobox", { name: "Operator" }))
		await expect(await screen.findAllByRole("option")).toHaveLength(2)
	},
})

export const FilterMovedToAnotherPath = meta.story({
	args: FILTERED_FORM,
	parameters: {
		docs: {
			description: {
				story:
					"A row leaving a declared field for a free path, and coming back. Check that the operator falls back to one the path still offers instead of staying on a comparison no payload could ever hold, that the path control keeps the focus while a reader types a name the source happens to declare, and that picking a declared field from the field control puts that field back in place of the path.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const row = () => within(canvas.getByRole("group", { name: "Row 1" }))

		await userEvent.click(row().getByRole("combobox", { name: "Field" }))
		await userEvent.click(
			await screen.findByRole("option", { name: "Another path" }),
		)
		await expect(
			row().getByRole("combobox", { name: "Operator" }),
		).toHaveTextContent("is present")

		await userEvent.type(
			row().getByRole("textbox", { name: "Path" }),
			"subject",
		)
		await expect(row().getByRole("textbox", { name: "Path" })).toHaveFocus()
		await expect(row().getByRole("textbox", { name: "Path" })).toHaveValue(
			"subject",
		)

		await userEvent.click(row().getByRole("combobox", { name: "Field" }))
		await userEvent.click(
			await screen.findByRole("option", { name: "subject" }),
		)
		await expect(
			row().queryByRole("textbox", { name: "Path" }),
		).not.toBeInTheDocument()
	},
})

export const FilterOnANumberField = meta.story({
	args: NUMBER_FILTER,
	parameters: {
		docs: {
			description: {
				story:
					"A row on a field the source declares as a number. Check that the value control carries a number and nothing else — the engine reads the value as the declared type, and a word saved there would make the row false for every payload — and that typing letters into it leaves it empty rather than storing them.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const value = within(
			canvas.getByRole("group", { name: "Row 1" }),
		).getByRole("spinbutton", { name: "Value" })

		await expect(value).toHaveValue(10)
		await userEvent.clear(value)
		await userEvent.type(value, "many")
		await expect(value).toHaveValue(null)
	},
})

export const FilterMissingAValue = meta.story({
	args: MISSING_VALUE_FILTER,
	parameters: {
		docs: {
			description: {
				story:
					"A row whose operator takes a value the reader left empty, at the moment they save. The engine accepts such a row and then never matches on it, so the form is the last place it can be caught. Check that saving marks the value control of that row, that the message is tied to that control, that the routine is left unwritten, and that filling the value clears the mark without a second save.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Save routine" }))

		const value = within(
			canvas.getByRole("group", { name: "Row 1" }),
		).getByRole("textbox", { name: "Value" })
		const message = canvas.getByText("This row needs a value.")

		await expect(value).toHaveAttribute("aria-invalid", "true")
		await expect(value.getAttribute("aria-describedby")).toContain(message.id)
		await expect(args.onSave).not.toHaveBeenCalled()

		await userEvent.type(value, "invoice")
		await expect(value).not.toHaveAttribute("aria-invalid")
		await userEvent.click(canvas.getByRole("button", { name: "Save routine" }))
		await expect(args.onSave).toHaveBeenCalledTimes(1)
	},
})

export const FilterRefusedForItsOperator = meta.story({
	args: {
		...FILTERED_FORM,
		refusal: { row: 1, operator: "gt", fieldType: "boolean" },
	},
	parameters: {
		docs: {
			description: {
				story:
					"The write came back refusing the second row: Rust is the only authority on what an operator may ask of a declared type. Check that the refusal marks the operator control of that row alone, that it names the operator and the type in a message tied to that control, and that the first row and everything above it still hold what the reader entered.",
			},
		},
	},
	play: async ({ canvas }) => {
		const refused = within(
			canvas.getByRole("group", { name: "Row 2" }),
		).getByRole("combobox", { name: "Operator" })
		const message = canvas.getByText(
			"is greater than does not fit a field declared as boolean.",
		)

		await expect(refused).toHaveAttribute("aria-invalid", "true")
		await expect(refused.getAttribute("aria-describedby")).toContain(message.id)
		await expect(
			within(canvas.getByRole("group", { name: "Row 1" })).getByRole(
				"combobox",
				{
					name: "Operator",
				},
			),
		).not.toHaveAttribute("aria-invalid")
		await expect(canvas.getByDisplayValue("invoice")).toBeVisible()
	},
})

export const FilterRefusedThenEdited = meta.story({
	args: {
		...FILTERED_FORM,
		refusal: { row: 1, operator: "gt", fieldType: "boolean" },
	},
	parameters: {
		docs: {
			description: {
				story:
					"The row a write was refused for, removed by the reader. The refusal names a rank in the filter that was written, so it stops describing anything the moment the rows move. Check that no mark is left behind on the row that took its place, and that nothing is marked once the refused row is gone. Pick `FilterRefusedForItsOperator` for the refusal as it lands.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			within(canvas.getByRole("group", { name: "Row 2" })).getByRole("button", {
				name: "Remove the row on unreadCount",
			}),
		)

		await expect(
			within(canvas.getByRole("group", { name: "Row 1" })).getByRole(
				"combobox",
				{
					name: "Operator",
				},
			),
		).not.toHaveAttribute("aria-invalid")
		await expect(
			canvas.queryByText(
				"is greater than does not fit a field declared as boolean.",
			),
		).not.toBeInTheDocument()
	},
})

export const FilterAtThePanelWidth = meta.story({
	args: LONG_FILTER,
	parameters: {
		docs: {
			description: {
				story:
					"The block at the width the panel opens at, holding a path and a value longer than the panel is wide. Check that the controls of a row stack instead of sharing a line, that none of them is cut off, and that nothing pushes the form into a horizontal scrollbar the reader would have to drag the panel wider to escape.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const block = slotIn(canvasElement, "routine-filter")

		await expect(block.scrollWidth).toBeLessThanOrEqual(block.clientWidth)
		for (const row of block.querySelectorAll<HTMLElement>(
			"[data-slot='routine-filter-row']",
		)) {
			await expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth)
		}
	},
})

export const FilterCarriedToAnotherSource = meta.story({
	args: { id: null, values: EMPTY_ROUTINE_VALUES },
	parameters: {
		docs: {
			description: {
				story:
					"A routine still unwritten, whose rows were built against one trigger before the reader picked another. Each source declares its own payload, so a row can lose the field it was written for. Check that the operator falls back to one the new source accepts rather than staying on a comparison its control no longer offers, and that the value goes with it: an operator or a value the engine cannot read would be saved as a row that never holds.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const pick = async (label: string, option: string) => {
			await userEvent.click(canvas.getByRole("combobox", { name: label }))
			await userEvent.click(await screen.findByRole("option", { name: option }))
		}

		await pick("Trigger", "When the space inbox fills")
		await userEvent.click(canvas.getByRole("button", { name: "Add a row" }))

		const row = () => within(canvas.getByRole("group", { name: "Row 1" }))
		await pick("Field", "subject")
		await pick("Operator", "contains")
		await userEvent.type(
			row().getByRole("textbox", { name: "Value" }),
			"invoice",
		)

		await pick("Trigger", "On a schedule")

		const operator = row().getByRole("combobox", { name: "Operator" })
		await expect(operator).toHaveTextContent("is present")
		await userEvent.click(operator)
		await expect(await screen.findAllByRole("option")).toHaveLength(2)
	},
})

export const FilterRefusedThenMovedToAnotherSource = meta.story({
	args: {
		id: null,
		values: FILTERED_FORM.values,
		refusal: { row: 1, operator: "gt", fieldType: "boolean" },
	},
	parameters: {
		docs: {
			description: {
				story:
					"A refusal raised against one source, on a routine still unwritten, then another trigger picked. The refusal names a rank in a filter written for the source that was on screen; the rows are rehomed by the pick, so the refusal describes nothing any more. Check that no row is left marked and that the message is gone rather than hanging over the row that took its place.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("combobox", { name: "Trigger" }))
		await userEvent.click(
			await screen.findByRole("option", { name: "On a schedule" }),
		)

		await expect(
			canvas.queryByText(
				"is greater than does not fit a field declared as boolean.",
			),
		).not.toBeInTheDocument()
		await expect(
			within(canvas.getByRole("group", { name: "Row 2" })).getByRole(
				"combobox",
				{
					name: "Operator",
				},
			),
		).not.toHaveAttribute("aria-invalid")
	},
})

export const FilterOnAPathTheNextSourceDeclares = meta.story({
	args: { id: null, values: EMPTY_ROUTINE_VALUES },
	parameters: {
		docs: {
			description: {
				story:
					"A row moved onto a free path under one trigger, whose path names a field the next trigger declares. Check that picking that trigger hands the row the field control of a declared field instead of leaving it on the path control it was built with: the path is a field again, and the operators of its declared type come back with it.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const pick = async (label: string, option: string) => {
			await userEvent.click(canvas.getByRole("combobox", { name: label }))
			await userEvent.click(await screen.findByRole("option", { name: option }))
		}

		await pick("Trigger", "When the space inbox fills")
		await userEvent.click(canvas.getByRole("button", { name: "Add a row" }))

		const row = () => within(canvas.getByRole("group", { name: "Row 1" }))
		await pick("Field", "Another path")
		await userEvent.type(row().getByRole("textbox", { name: "Path" }), "path")

		await pick("Trigger", "When a watched file changes")

		await expect(
			row().queryByRole("textbox", { name: "Path" }),
		).not.toBeInTheDocument()
		await expect(
			row().getByRole("combobox", { name: "Field" }),
		).toHaveTextContent("path")
	},
})

export const FilterOnAnUndescribedSource = meta.story({
	args: UNDESCRIBED_FORM,
	parameters: {
		docs: {
			description: {
				story:
					"A written routine whose trigger nothing described to the form: no field is declared, so every row reads as a free path. Check that each row keeps the operator it was read with rather than falling back to presence, and that the value control still carries the type the value was read in. Pick `FilterPathRenamedOnAnUndescribedSource` for what the reader editing that path does to the reading.",
			},
		},
	},
	play: async ({ canvas }) => {
		const row = within(canvas.getByRole("group", { name: "Row 1" }))

		await expect(
			row.getByRole("combobox", { name: "Operator" }),
		).toHaveTextContent("is greater than")
		await expect(row.getByRole("spinbutton", { name: "Value" })).toHaveValue(10)
		await expect(row.getByRole("textbox", { name: "Path" })).toHaveValue(
			"unreadCount",
		)
	},
})

export const FilterValueEditedOnAnUndescribedSource = meta.story({
	args: UNDESCRIBED_FORM,
	parameters: {
		docs: {
			description: {
				story:
					"The value of a row read as a number, edited on a source that declares nothing. Check that the control takes a number and hands one back, so the write carries the type the row was read with instead of turning a comparison into text the engine cannot read.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const value = within(
			canvas.getByRole("group", { name: "Row 1" }),
		).getByRole("spinbutton", { name: "Value" })

		await userEvent.clear(value)
		await userEvent.type(value, "7")
		await userEvent.click(canvas.getByRole("button", { name: "Save routine" }))

		await expect(args.onSave).toHaveBeenCalledWith({
			...UNDESCRIBED_FORM.values,
			filter: {
				matchMode: "all",
				rows: [
					{
						...UNDESCRIBED_FORM.values.filter.rows[0],
						value: "7",
					},
					UNDESCRIBED_FORM.values.filter.rows[1],
				],
			},
		})
	},
})

export const FilterValueRefusedOnAnUndescribedSource = meta.story({
	args: UNDESCRIBED_FORM,
	parameters: {
		docs: {
			description: {
				story:
					"A word typed into the value of a row read as a number. The control takes no letters, so the row is left without a value, and a row whose operator takes a value is not saved without one. Check that the row is marked, that the form stays open on what the reader entered, and that the other row keeps its value untouched.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const value = within(
			canvas.getByRole("group", { name: "Row 1" }),
		).getByRole("spinbutton", { name: "Value" })

		await userEvent.clear(value)
		await userEvent.type(value, "abc")
		await userEvent.click(canvas.getByRole("button", { name: "Save routine" }))

		await expect(args.onSave).not.toHaveBeenCalled()
		await expect(value).toHaveAttribute("aria-invalid", "true")
		await expect(canvas.getByText("This row needs a value.")).toBeVisible()
		await expect(
			within(canvas.getByRole("group", { name: "Row 2" })).getByRole(
				"textbox",
				{
					name: "Value",
				},
			),
		).toHaveValue("invoice")
	},
})

export const FilterOperatorTakenBackOnAnUndescribedSource = meta.story({
	args: UNDESCRIBED_FORM,
	parameters: {
		docs: {
			description: {
				story:
					"A presence operator picked on a row read with a comparison, on a source that declares nothing. Nothing on screen knows the type of that path, so the comparison the row was read with stays in the list rather than disappearing behind the pick. Check that it can be picked again and that the value comes back with it.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const row = () => within(canvas.getByRole("group", { name: "Row 1" }))
		const pick = async (option: string) => {
			await userEvent.click(row().getByRole("combobox", { name: "Operator" }))
			await userEvent.click(await screen.findByRole("option", { name: option }))
		}

		await pick("is present")
		await expect(
			row().queryByRole("spinbutton", { name: "Value" }),
		).not.toBeInTheDocument()

		await pick("is greater than")
		await expect(row().getByRole("spinbutton", { name: "Value" })).toHaveValue(
			10,
		)
	},
})

export const FilterPathRenamedOnAnUndescribedSource = meta.story({
	args: UNDESCRIBED_FORM,
	parameters: {
		docs: {
			description: {
				story:
					"The free path of a row read as a number, renamed to another path no field declares, then its value edited. Renaming a path is not the reader saying the row is something else: check that the value control still takes a number after the rename, that the operator the row was read with is still the one on screen, and that the saved row carries the new path with that operator and a number. Pick `FilterMovedToAnotherPath` for the rename that lands on a declared field, where the declared type takes over.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const row = () => within(canvas.getByRole("group", { name: "Row 1" }))

		await userEvent.type(row().getByRole("textbox", { name: "Path" }), "s")
		await expect(
			row().getByRole("combobox", { name: "Operator" }),
		).toHaveTextContent("is greater than")

		const value = row().getByRole("spinbutton", { name: "Value" })
		await userEvent.clear(value)
		await userEvent.type(value, "7")
		await userEvent.click(canvas.getByRole("button", { name: "Save routine" }))

		await expect(args.onSave).toHaveBeenCalledWith({
			...UNDESCRIBED_FORM.values,
			filter: {
				matchMode: "all",
				rows: [
					{
						...UNDESCRIBED_FORM.values.filter.rows[0],
						field: "unreadCounts",
						value: "7",
					},
					UNDESCRIBED_FORM.values.filter.rows[1],
				],
			},
		})
	},
})

export const FilterPathLeavingADeclaredField = meta.story({
	args: { id: null, values: EMPTY_ROUTINE_VALUES },
	parameters: {
		docs: {
			description: {
				story:
					"A row taken to a free path, typed onto a field the source declares, given a comparison and a value, then typed away again onto a name nothing declares. The engine reads a comparison through the declared type of the field, so a row that leaves the field keeps nothing of what the field lent it. Check that the operator control falls back to presence and offers nothing else, that the value goes with it, and that the row saved is the one on screen.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const row = () => within(canvas.getByRole("group", { name: "Row 1" }))
		const pick = async (label: string, option: string) => {
			await userEvent.click(canvas.getByRole("combobox", { name: label }))
			await userEvent.click(await screen.findByRole("option", { name: option }))
		}

		await pick("Trigger", "When the space inbox fills")
		await userEvent.click(canvas.getByRole("button", { name: "Add a row" }))
		await pick("Field", "Another path")
		await userEvent.type(
			row().getByRole("textbox", { name: "Path" }),
			"subject",
		)
		await pick("Operator", "contains")
		await userEvent.type(
			row().getByRole("textbox", { name: "Value" }),
			"invoice",
		)

		await userEvent.type(row().getByRole("textbox", { name: "Path" }), "s")

		const operator = row().getByRole("combobox", { name: "Operator" })
		await expect(operator).toHaveTextContent("is present")
		await expect(
			row().queryByRole("textbox", { name: "Value" }),
		).not.toBeInTheDocument()

		await userEvent.click(operator)
		await expect(await screen.findAllByRole("option")).toHaveLength(2)
		await userEvent.keyboard("{Escape}")

		await userEvent.click(canvas.getByRole("button", { name: "Save routine" }))
		await expect(args.onSave).toHaveBeenCalledWith({
			...EMPTY_ROUTINE_VALUES,
			triggerSourceId: "space-inbox",
			filter: {
				matchMode: "all",
				rows: [{ field: "subjects", operator: "exists", value: "" }],
			},
		})
	},
})

export const FilterPathRenamedBackOnAnUndescribedSource = meta.story({
	args: UNDESCRIBED_FORM,
	parameters: {
		docs: {
			description: {
				story:
					"The free path of a row read as a number, renamed and then typed back to the name it was read with. Nothing the reader did leaves a trace: check that the row saved is the row read, so the write can hand back the filter it read rather than a rebuilt one.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const path = () =>
			within(canvas.getByRole("group", { name: "Row 1" })).getByRole(
				"textbox",
				{
					name: "Path",
				},
			)

		await userEvent.type(path(), "s")
		await userEvent.type(path(), "{backspace}")
		await expect(path()).toHaveValue("unreadCount")

		await userEvent.click(canvas.getByRole("button", { name: "Save routine" }))
		await expect(args.onSave).toHaveBeenCalledWith(UNDESCRIBED_FORM.values)
	},
})
