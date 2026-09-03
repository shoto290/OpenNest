import { useState } from "react"
import { expect, fn, screen, spyOn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	slotIn,
} from "@workspace/storybook/story-utils"
import {
	EMPTY_ROUTINE_VALUES,
	RoutineForm,
	type RoutineFormProps,
} from "@workspace/ui/components/routine-form"
import {
	CALLED_FORM,
	INBOX_FORM,
	SCHEDULED_FORM,
	TRIGGER_SOURCES,
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
					"A written routine a local webhook call fires, once its key has been minted. Check that the address, the key and the header name all read as read only, that each carries its own copy control, and that copying announces itself in the polite region rather than through the icon alone. Pick `BeforeItsFirstWrite` for the same trigger before the key exists.",
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
					"Every edit of a webhook routine starts here: the routine is written, its key is read after the form opens, and the three fields hold nothing for as long as that read is out. Check that the block says the read is running instead of borrowing the line of a routine that was never written, and that it says it once — never beside the pending line or the failure. Pick `BeforeItsFirstWrite` for the routine that has no key yet, `KeyUnreadable` for the read that came back empty handed.",
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
