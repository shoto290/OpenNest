// @vitest-environment happy-dom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
	EMPTY_ROUTINE_VALUES,
	type RoutineFormModel,
} from "@workspace/ui/components/routine-form"
import {
	CALLED_FORM,
	FILTERED_FORM,
	ROUTINES,
	SCHEDULED_FORM,
	TRIGGER_SOURCES,
} from "@workspace/ui/components/routines.fixtures"
import {
	RoutinesPanel,
	type RoutinesPanelForm,
} from "@workspace/ui/components/routines-panel"

import "@workspace/ui/lib/i18n"

const NEW_SCHEDULE: RoutineFormModel = {
	id: null,
	values: { ...EMPTY_ROUTINE_VALUES, triggerSourceId: "schedule" },
}

const panelHolding = (open: RoutineFormModel, onSave = vi.fn()) => {
	const form: RoutinesPanelForm = {
		canCreate: true,
		onClose: vi.fn(),
		onNew: vi.fn(),
		onOpen: vi.fn(),
		onSave,
		open,
		sources: TRIGGER_SOURCES,
	}

	render(
		<RoutinesPanel
			failure={null}
			form={form}
			isOpen
			onDelete={vi.fn()}
			onEnabledChange={vi.fn()}
			onOpenChange={vi.fn()}
			onRetry={vi.fn()}
			routines={ROUTINES}
		>
			{null}
		</RoutinesPanel>,
	)

	return { form, onSave }
}

const typeInto = (label: string, value: string) =>
	fireEvent.change(screen.getByLabelText(label), { target: { value } })

afterEach(cleanup)

describe("RoutinesPanel", () => {
	it("saves the fields the reader entered", () => {
		const { onSave } = panelHolding(NEW_SCHEDULE)

		typeInto("Title", "Morning digest")
		typeInto("Instruction", "Write a short digest.")
		typeInto("Cron expression", "0 8 * * *")
		fireEvent.click(screen.getByRole("button", { name: "Save routine" }))

		expect(onSave).toHaveBeenCalledWith({
			...NEW_SCHEDULE.values,
			expression: "0 8 * * *",
			instruction: "Write a short digest.",
			title: "Morning digest",
		})
	})

	it("lands a refused expression under the expression field", () => {
		panelHolding({ ...SCHEDULED_FORM, refusal: "unreadableExpression" })

		const field = screen.getByLabelText("Cron expression")
		const message = screen.getByText(
			"This expression cannot be read as a schedule.",
		)

		expect(field.getAttribute("aria-invalid")).toBe("true")
		expect(field.getAttribute("aria-describedby")).toContain(message.id)
		expect(screen.getByDisplayValue("Morning digest")).toBeTruthy()
	})

	it("carries the address, the key and the header of a written routine", () => {
		panelHolding(CALLED_FORM)

		const held = (label: string) =>
			(screen.getByLabelText(label) as HTMLInputElement).value

		expect(held("Address")).toBe(CALLED_FORM.webhook?.url)
		expect(held("Key")).toBe(CALLED_FORM.webhook?.key)
		expect(held("Header name")).toBe(CALLED_FORM.webhook?.header)
	})

	it("marks the refused row and leaves the other rows as entered", () => {
		panelHolding({
			...FILTERED_FORM,
			refusal: { row: 1, operator: "gt", fieldType: "boolean" },
		})

		const rowOf = (rank: number) =>
			within(screen.getByRole("group", { name: `Row ${rank}` }))
		const refused = rowOf(2).getByRole("combobox", { name: "Operator" })
		const message = screen.getByText(
			"is greater than does not fit a field declared as boolean.",
		)

		expect(refused.getAttribute("aria-invalid")).toBe("true")
		expect(refused.getAttribute("aria-describedby")).toContain(message.id)
		const heldValueOf = (rank: number) =>
			(rowOf(rank).getByRole("textbox", { name: "Value" }) as HTMLInputElement)
				.value

		expect(
			rowOf(1)
				.getByRole("combobox", { name: "Operator" })
				.getAttribute("aria-invalid"),
		).toBeNull()
		expect(heldValueOf(1)).toBe("invoice")
		expect(heldValueOf(2)).toBe("10")
	})

	it("holds the values it was read with when the write is refused", () => {
		const { onSave } = panelHolding({
			...SCHEDULED_FORM,
			refusal: "unreadableExpression",
		})

		typeInto("Cron expression", "0 9 * * *")
		fireEvent.click(screen.getByRole("button", { name: "Save routine" }))

		expect(onSave).toHaveBeenCalledWith({
			...SCHEDULED_FORM.values,
			expression: "0 9 * * *",
		})
	})
})
