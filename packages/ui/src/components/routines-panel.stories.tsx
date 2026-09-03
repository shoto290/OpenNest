import { useState } from "react"
import { expect, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	FRAME_POLL,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { AppHeader } from "@workspace/ui/components/app-header"
import { Icons } from "@workspace/ui/components/icons"
import {
	AnimatedSidebar,
	AnimatedSidebarContent,
	AnimatedSidebarHeader,
	AnimatedSidebarMenu,
	AnimatedSidebarMenuButton,
	AnimatedSidebarMenuItem,
	AnimatedSidebarTrigger,
} from "@workspace/ui/components/motion/animated-sidebar"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import {
	EMPTY_ROUTINE_VALUES,
	type RoutineFormModel,
} from "@workspace/ui/components/routine-form"
import type { RoutineRowModel } from "@workspace/ui/components/routine-row"
import {
	INBOX_FORM,
	MORNING_DIGEST,
	RELEASE_WATCH,
	ROUTINES,
	SCHEDULED_FORM,
	SOURCE_NAMED_BY_ID,
	TRIGGER_SOURCES,
	WATCHING_FORM,
} from "@workspace/ui/components/routines.fixtures"
import {
	RoutinesPanel,
	type RoutinesPanelProps,
	RoutinesPanelTrigger,
} from "@workspace/ui/components/routines-panel"
import { ThreadLayout } from "@workspace/ui/components/thread-layout"
import { AssistantTurn, UserTurn } from "@workspace/ui/components/turn"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"

const ANSWER =
	"Three routines watch this conversation: a digest, a changelog watch and a nightly cleanup."

const THREAD = (
	<ThreadLayout
		composer={<PromptInput onSubmit={fn()} />}
		header={<AppHeader trailing={<RoutinesPanelTrigger />} />}
	>
		<UserTurn>What runs on its own here?</UserTurn>
		<AssistantTurn copyText={ANSWER}>{ANSWER}</AssistantTurn>
	</ThreadLayout>
)

const FORMS: Record<string, RoutineFormModel> = {
	[MORNING_DIGEST.id]: SCHEDULED_FORM,
	[RELEASE_WATCH.id]: WATCHING_FORM,
	[SOURCE_NAMED_BY_ID.id]: INBOX_FORM,
}

const PanelHost = ({
	isOpen,
	routines,
	form,
	...props
}: RoutinesPanelProps) => {
	const [open, setOpen] = useState(isOpen)
	const [held, setHeld] = useState(routines)
	const [shown, setShown] = useState<RoutineFormModel | null>(
		form?.open ?? null,
	)

	const answer = (id: string, isEnabled: boolean) =>
		setHeld((rows) =>
			rows.map((row) =>
				row.id === id
					? {
							...row,
							isEnabled,
							hasStoppedItself: row.hasStoppedItself && !isEnabled,
						}
					: row,
			),
		)

	return (
		<RoutinesPanel
			{...props}
			form={
				form && {
					...form,
					onClose: () => {
						form.onClose()
						setShown(null)
					},
					onNew: () => {
						form.onNew()
						setShown({ id: null, values: EMPTY_ROUTINE_VALUES })
					},
					onOpen: (routineId) => {
						form.onOpen(routineId)
						setShown(FORMS[routineId] ?? null)
					},
					onSave: (values) => {
						form.onSave(values)
						setShown(null)
					},
					open: shown,
				}
			}
			isOpen={open}
			onDelete={(id) => {
				props.onDelete(id)
				setHeld((rows) => rows.filter((row) => row.id !== id))
			}}
			onEnabledChange={(id, isEnabled) => {
				props.onEnabledChange(id, isEnabled)
				answer(id, isEnabled)
			}}
			onOpenChange={(next) => {
				props.onOpenChange(next)
				setOpen(next)
			}}
			routines={held}
		/>
	)
}

const NO_ROUTINES: RoutineRowModel[] = []

const WORKSPACE_SIDEBAR = (
	<AnimatedSidebar ariaLabel="Workspace" variant="inset">
		<AnimatedSidebarHeader>
			<AnimatedSidebarTrigger aria-label="Toggle workspace">
				<Icons.Sidebar className="size-4" />
			</AnimatedSidebarTrigger>
		</AnimatedSidebarHeader>
		<AnimatedSidebarContent>
			<AnimatedSidebarMenu>
				<AnimatedSidebarMenuItem>
					<AnimatedSidebarMenuButton>Shift log</AnimatedSidebarMenuButton>
				</AnimatedSidebarMenuItem>
			</AnimatedSidebarMenu>
		</AnimatedSidebarContent>
	</AnimatedSidebar>
)

const handleIn = (canvasElement: HTMLElement, side: string) =>
	canvasElement.querySelector<HTMLElement>(
		`[data-slot="sidebar-resize-handle"][data-side="${side}"]`,
	)

const meta = preview.meta({
	title: "Conversation/Routines/RoutinesPanel",
	component: RoutinesPanel,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The routines of one conversation, on the trailing edge of its thread. It carries a sidebar provider of its own, so opening or resizing it says nothing to the workspace sidebar on the other side of the window, and it owns no shortcut — the control in the thread header is the only way in and out. Closed, it takes no room at all and the transcript spans the thread. The list is the whole surface: no routine at all gets an empty state rather than a bare list, a read that failed gets the failure and a retry rather than a list that looks empty, and a change that could not be written says so in its own words rather than borrowing the read's.",
			},
		},
	},
	args: {
		children: THREAD,
		failure: null,
		form: {
			canCreate: true,
			onClose: fn(),
			onNew: fn(),
			onOpen: fn(),
			onSave: fn(),
			open: null,
			sources: TRIGGER_SOURCES,
		},
		isOpen: true,
		onDelete: fn(),
		onEnabledChange: fn(),
		onOpenChange: fn(),
		onRetry: fn(),
		routines: ROUTINES,
	},
	render: (args) => <PanelHost {...args} />,
})

export const Default = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The panel open beside a live thread, one row per routine. Check that every row names its routine and the source that fires it — including the routine whose source no read named, which falls back to the source id rather than leaving the line blank — that the transcript keeps its own scroll while the panel stays put, and that flipping a switch reports the routine it belongs to.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const panel = canvas.getByRole("complementary", { name: "Routines" })
		await expect(panel).toBeVisible()
		await expect(slotsIn(canvasElement, "routine-row")).toHaveLength(
			ROUTINES.length,
		)
		await expect(canvas.getByText("Every day at 08:00")).toBeVisible()
		await expect(
			canvas.getByText(SOURCE_NAMED_BY_ID.triggerSourceTitle),
		).toBeVisible()

		await userEvent.click(
			canvas.getByRole("switch", { name: "Morning digest" }),
		)
		await expect(args.onEnabledChange).toHaveBeenCalledWith(
			"routine-morning-digest",
			false,
		)
	},
})

export const Closed = meta.story({
	args: { isOpen: false },
	parameters: {
		docs: {
			description: {
				story:
					"The panel folded away. Check that the transcript spans the whole thread with no gutter left behind, and that the control in the header reports the panel closed rather than merely looking unpressed.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const control = canvas.getByRole("button", {
			name: "Routines of this conversation",
		})
		await expect(control).toHaveAttribute("aria-expanded", "false")
		await expect(control).toHaveAttribute("aria-controls", "routines-panel")

		const thread = slotIn(canvasElement, "sidebar-inset")
		const panel = canvas.getByRole("complementary", { name: "Routines" })
		await waitFor(
			() => expect(panel.getBoundingClientRect().width).toBe(0),
			FRAME_POLL,
		)
		await expect(thread.getBoundingClientRect().width).toBe(
			panel.parentElement?.getBoundingClientRect().width,
		)
	},
})

export const Toggling = meta.story({
	args: { isOpen: false },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The one way in and out. Check that the control opens the panel and closes it again, that it reports the state it is in on every press, and that closing hands the keyboard back to the control rather than dropping focus into a panel that is no longer there.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const control = canvas.getByRole("button", {
			name: "Routines of this conversation",
		})

		await userEvent.click(control)
		await expect(args.onOpenChange).toHaveBeenCalledWith(true)
		await expect(control).toHaveAttribute("aria-expanded", "true")

		const panel = canvas.getByRole("complementary", { name: "Routines" })
		await waitFor(
			() => expect(panel.getBoundingClientRect().width).toBeGreaterThan(0),
			FRAME_POLL,
		)

		await userEvent.click(control)
		await expect(args.onOpenChange).toHaveBeenCalledWith(false)
		await expect(control).toHaveAttribute("aria-expanded", "false")
		await waitFor(() => expect(control).toHaveFocus(), FRAME_POLL)
	},
})

export const Empty = meta.story({
	args: { routines: NO_ROUTINES },
	parameters: {
		docs: {
			description: {
				story:
					"A conversation nothing runs on yet. Check that the panel says so in a sentence a reader can act on, that the way to write the first routine is offered in the empty state itself rather than only in the header, and that no list, however short, is drawn under it. Pick `ReadFailed` for the case where routines exist but could not be read.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await expect(canvas.getByText("No routine yet")).toBeVisible()
		await expect(slotsIn(canvasElement, "routines-list")).toHaveLength(0)
		await expect(slotsIn(canvasElement, "routine-row")).toHaveLength(0)

		const empty = within(slotIn(canvasElement, "routines-empty"))
		await userEvent.click(empty.getByRole("button", { name: "New routine" }))
		await expect(slotIn(canvasElement, "routine-form")).toBeVisible()
	},
})

export const ReadFailed = meta.story({
	args: { failure: "read", routines: NO_ROUTINES },
	parameters: {
		docs: {
			description: {
				story:
					"The read failed. Check that the failure takes the place of the empty state rather than sitting beside it — a conversation whose routines could not be read has not lost them — and that the retry is the only thing asked of the reader. Pick `WriteFailed` for the failure that follows a change the reader asked for.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(canvas.getByText("Routines could not be read")).toBeVisible()
		await expect(canvas.queryByText("No routine yet")).not.toBeInTheDocument()
		await expect(slotsIn(canvasElement, "routine-row")).toHaveLength(0)

		await userEvent.click(canvas.getByRole("button", { name: "Retry" }))
		await expect(args.onRetry).toHaveBeenCalled()
	},
})

export const WriteFailed = meta.story({
	args: { failure: "write" },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A switch that could not be written. Check that the panel says a change failed rather than blaming a read that never happened, that the routines the app is holding stay on screen under it, and that the switch reads as it did before the attempt.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvas.getByText("The routine could not be changed"),
		).toBeVisible()
		await expect(
			canvas.queryByText("Routines could not be read"),
		).not.toBeInTheDocument()
		await expect(slotsIn(canvasElement, "routine-row")).toHaveLength(
			ROUTINES.length,
		)
	},
})

export const Creating = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The new routine action of the header, from the list to the empty form and back. Check that the form takes the place of the list inside the panel rather than opening a dialog over the thread, that the keyboard lands in the form when it opens, and that leaving hands focus back to the action that opened it with the list where it was. Pick `Editing` for the same form filled from a row.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "New routine" }))
		await expect(args.form?.onNew).toHaveBeenCalled()

		const form = canvas.getByRole("form", { name: "New routine" })
		await waitFor(() => expect(form).toHaveFocus(), FRAME_POLL)
		await expect(slotsIn(canvasElement, "routine-row")).toHaveLength(0)
		await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument()

		await userEvent.click(
			canvas.getByRole("button", { name: "Back to the routines" }),
		)
		await expect(slotsIn(canvasElement, "routine-row")).toHaveLength(
			ROUTINES.length,
		)
		await waitFor(
			() =>
				expect(
					canvas.getByRole("button", { name: "New routine" }),
				).toHaveFocus(),
			FRAME_POLL,
		)
	},
})

export const Editing = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A row picked from the list. Check that the form opens filled with that routine — its title, its instruction, the expression it was read with — that its trigger reads as text rather than a list, and that leaving returns focus to the row that opened it rather than to the header.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await userEvent.click(canvas.getByText("Morning digest"))
		await expect(args.form?.onOpen).toHaveBeenCalledWith(MORNING_DIGEST.id)

		await expect(canvas.getByDisplayValue("Morning digest")).toBeVisible()
		await expect(canvas.getByDisplayValue("0 8 * * *")).toBeVisible()
		await expect(canvas.getByDisplayValue("On a schedule")).toHaveAttribute(
			"readonly",
		)

		await userEvent.click(
			canvas.getByRole("button", { name: "Back to the routines" }),
		)
		const row = slotsIn(canvasElement, "routine-row")[0]
		await waitFor(
			() => expect(row?.querySelector("button[data-opens]")).toHaveFocus(),
			FRAME_POLL,
		)
	},
})

export const WithoutSeatedLead = meta.story({
	args: {
		form: {
			canCreate: false,
			onClose: fn(),
			onNew: fn(),
			onOpen: fn(),
			onSave: fn(),
			open: null,
			sources: TRIGGER_SOURCES,
		},
	},
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A conversation with no lead bot seated: a routine written here would have nobody to run it. Check that the new routine action is left out of the header and of the empty state rather than shown and refused on save, and that the routines already written stay readable and editable.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.queryByRole("button", { name: "New routine" }),
		).not.toBeInTheDocument()
		await expect(canvas.getByText("Morning digest")).toBeVisible()
	},
})

export const InWorkspaceShell = meta.story({
	args: { isOpen: false },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The panel where it really lives: inside the shell, opposite the workspace sidebar. This is the one to open when the two panels are suspected of sharing a context. Check that opening the routines panel leaves the sidebar on the other side expanded and exactly as wide as it was, and that widening the routines panel from its handle does not narrow the sidebar with it.",
			},
		},
	},
	render: (args) => (
		<WorkspaceShell sidebar={WORKSPACE_SIDEBAR}>
			<PanelHost {...args} />
		</WorkspaceShell>
	),
	play: async ({ canvas, canvasElement, userEvent }) => {
		const workspace = canvas.getByRole("complementary", { name: "Workspace" })
		const widthBefore = workspace.getBoundingClientRect().width

		await userEvent.click(
			canvas.getByRole("button", { name: "Routines of this conversation" }),
		)
		const panel = canvas.getByRole("complementary", { name: "Routines" })
		await waitFor(
			() => expect(panel.getBoundingClientRect().width).toBeGreaterThan(0),
			FRAME_POLL,
		)

		const handle = handleIn(canvasElement, "right")
		await expect(handle).not.toBeNull()
		handle?.focus()
		await userEvent.keyboard("{ArrowLeft}")

		await waitFor(
			() => expect(handle).toHaveAttribute("aria-valuenow", "336"),
			FRAME_POLL,
		)
		await expect(workspace).toHaveAttribute("data-state", "expanded")
		await expect(workspace.getBoundingClientRect().width).toBe(widthBefore)
	},
})
