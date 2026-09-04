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
	CLOSED_MISSIONS,
	MISSIONS_READ_AT,
	NO_MISSIONS,
	RUNNING_MISSIONS,
	WAITING_HUMAN_MISSION,
} from "@workspace/ui/components/missions.fixtures"
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
import type { RoutineDetailModel } from "@workspace/ui/components/routine-detail"
import {
	EMPTY_ROUTINE_VALUES,
	type RoutineFormModel,
} from "@workspace/ui/components/routine-form"
import type { RoutineRowModel } from "@workspace/ui/components/routine-row"
import {
	CLEANUP_DETAIL,
	DIGEST_DETAIL,
	DIGEST_RUNS,
	INBOX_FORM,
	MORNING_DIGEST,
	RELEASE_WATCH,
	ROUTINES,
	SCHEDULED_FORM,
	SOURCE_NAMED_BY_ID,
	TRIGGER_SOURCES,
	WATCH_DETAIL,
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

const DETAILS: Record<string, RoutineDetailModel> = {
	[MORNING_DIGEST.id]: DIGEST_DETAIL,
	[RELEASE_WATCH.id]: WATCH_DETAIL,
	[SOURCE_NAMED_BY_ID.id]: CLEANUP_DETAIL,
}

const PanelHost = ({
	isOpen,
	routines,
	form,
	detail,
	...props
}: RoutinesPanelProps) => {
	const [open, setOpen] = useState(isOpen)
	const [held, setHeld] = useState(routines)
	const [shown, setShown] = useState<RoutineFormModel | null>(
		form?.open ?? null,
	)
	const [opened, setOpened] = useState<RoutineDetailModel | null>(
		detail?.open ?? null,
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
			detail={
				detail && {
					...detail,
					onClose: () => {
						detail.onClose()
						setOpened(null)
					},
					onOpen: (routineId) => {
						detail.onOpen(routineId)
						setOpened(DETAILS[routineId] ?? null)
					},
					open: opened,
				}
			}
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
						setOpened((current) =>
							current ? { ...current, title: values.title } : current,
						)
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

const NO_MISSION_AT_ALL = {
	running: NO_MISSIONS,
	closed: NO_MISSIONS,
	now: MISSIONS_READ_AT,
	onOpen: fn(),
}

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
					"The activity of one conversation, on the trailing edge of its thread: the missions running on it above the routines watching it, each list under its own section head. It carries a sidebar provider of its own, so opening or resizing it says nothing to the workspace sidebar on the other side of the window, and it owns no shortcut — the control in the thread header is the only way in and out. Closed, it takes no room at all and the transcript spans the thread. The lists are the whole surface: no mission running gets a dotted line rather than a gap, nothing at all gets an empty state rather than a bare list, a read that failed gets the failure and a retry rather than a list that looks empty, and a change that could not be written says so in its own words rather than borrowing the read's.",
			},
		},
	},
	args: {
		children: THREAD,
		detail: {
			onClose: fn(),
			onOpen: fn(),
			onRetryRuns: fn(),
			onRunNow: fn(),
			open: null,
		},
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
		missions: {
			running: RUNNING_MISSIONS,
			closed: CLOSED_MISSIONS,
			now: MISSIONS_READ_AT,
			onOpen: fn(),
		},
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
					"The panel open beside a live thread: the missions running on the conversation first, the routines watching it under them. Check that the two lists read in that order under their own heads, that every routine row names its routine and the source that fires it — including the routine whose source no read named, which falls back to the source id rather than leaving the line blank — that the transcript keeps its own scroll while the panel stays put, and that flipping a switch reports the routine it belongs to.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const panel = canvas.getByRole("complementary", { name: "Activity" })
		await expect(panel).toBeVisible()
		await expect(slotsIn(canvasElement, "mission-row")).toHaveLength(
			RUNNING_MISSIONS.length,
		)
		await expect(slotsIn(canvasElement, "routine-row")).toHaveLength(
			ROUTINES.length,
		)
		await expect(
			slotIn(canvasElement, "missions-section").compareDocumentPosition(
				slotIn(canvasElement, "routines-section"),
			),
		).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
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
		const control = canvas.getByRole("button", { name: "Activity" })
		await expect(control).toHaveAttribute("aria-expanded", "false")
		await expect(control).toHaveAttribute("aria-controls", "routines-panel")

		const thread = slotIn(canvasElement, "sidebar-inset")
		const panel = canvas.getByRole("complementary", { name: "Activity" })
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
		const control = canvas.getByRole("button", { name: "Activity" })

		await userEvent.click(control)
		await expect(args.onOpenChange).toHaveBeenCalledWith(true)
		await expect(control).toHaveAttribute("aria-expanded", "true")

		const panel = canvas.getByRole("complementary", { name: "Activity" })
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
	args: { missions: NO_MISSION_AT_ALL, routines: NO_ROUTINES },
	parameters: {
		docs: {
			description: {
				story:
					"A conversation nothing runs on yet, neither mission nor routine. Check that the panel keeps the empty state it has always shown rather than a missions head over a dotted line, that no list, however short, is drawn under it, and that the way to write the first routine is the one control of the routines head. Pick `NoMissionRunning` for a conversation whose routines are written but whose missions are all closed.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await expect(canvas.getByText("No routine yet")).toBeVisible()
		await expect(slotsIn(canvasElement, "routines-list")).toHaveLength(0)
		await expect(slotsIn(canvasElement, "missions-none")).toHaveLength(0)
		await expect(slotsIn(canvasElement, "routine-row")).toHaveLength(0)

		await userEvent.click(canvas.getByRole("button", { name: "New routine" }))
		await expect(slotIn(canvasElement, "routine-form")).toBeVisible()
	},
})

export const NoMissionRunning = meta.story({
	args: {
		missions: { ...NO_MISSION_AT_ALL, closed: CLOSED_MISSIONS },
	},
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A conversation whose routines are written and whose missions are all closed. Check that the missions head stays with one dotted line under it rather than collapsing into the routines, and that the routines below read exactly as they do with missions above them.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByText("No mission running")).toBeVisible()
		await expect(slotsIn(canvasElement, "missions-list")).toHaveLength(0)
		await expect(slotsIn(canvasElement, "routine-row")).toHaveLength(
			ROUTINES.length,
		)
	},
})

export const ClosedMissions = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The missions this conversation is done with, one screen away. Check that the control of the missions head pushes them over the panel rather than growing the running list, that the running missions and the routines are gone while it is up, and that coming back hands the keyboard to the control that opened it.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Closed missions" }),
		)

		await expect(slotsIn(canvasElement, "mission-row")).toHaveLength(
			CLOSED_MISSIONS.length,
		)
		await expect(slotsIn(canvasElement, "routine-row")).toHaveLength(0)

		await userEvent.click(
			canvas.getByRole("button", { name: "Back to the activity" }),
		)
		await expect(slotsIn(canvasElement, "mission-row")).toHaveLength(
			RUNNING_MISSIONS.length,
		)
		await waitFor(
			() =>
				expect(
					canvas.getByRole("button", { name: "Closed missions" }),
				).toHaveFocus(),
			FRAME_POLL,
		)
	},
})

export const OpeningAMission = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A mission picked from the running list. Check that the whole row is what answers the pointer and the keyboard — the row carries no control of its own — and that it reports the mission it belongs to rather than opening anything inside the panel.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await userEvent.click(canvas.getByText(WAITING_HUMAN_MISSION.objective))
		await expect(args.missions.onOpen).toHaveBeenCalledWith(
			WAITING_HUMAN_MISSION.id,
		)

		await userEvent.keyboard("{Enter}")
		await expect(args.missions.onOpen).toHaveBeenCalledTimes(2)
		await expect(slotsIn(canvasElement, "routine-row")).toHaveLength(
			ROUTINES.length,
		)
	},
})

export const ReadFailed = meta.story({
	args: { failure: "read", missions: NO_MISSION_AT_ALL, routines: NO_ROUTINES },
	parameters: {
		docs: {
			description: {
				story:
					"A read that failed, whether the missions or the routines are the ones that could not be read. Check that the failure takes the place of the empty state rather than sitting beside it — a conversation whose activity could not be read has not lost it — and that the retry is the only thing asked of the reader. Pick `WriteFailed` for the failure that follows a change the reader asked for.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(canvas.getByText("Routines could not be read")).toBeVisible()
		await expect(canvas.queryByText("No routine yet")).not.toBeInTheDocument()
		await expect(slotsIn(canvasElement, "mission-row")).toHaveLength(0)
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

export const Opening = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A row picked from the list. Check that the detail takes the place of the list inside the panel, that it repeats the title and the trigger source the row carried rather than a shortened version of them, that the runs are read as it opens, and that leaving returns focus to the row that opened it. Pick `Editing` for the form reached from here.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await userEvent.click(canvas.getByText("Morning digest"))
		await expect(args.detail?.onOpen).toHaveBeenCalledWith(MORNING_DIGEST.id)

		const detail = slotIn(canvasElement, "routine-detail")
		await waitFor(() => expect(detail).toHaveFocus(), FRAME_POLL)
		await expect(slotsIn(canvasElement, "routine-row")).toHaveLength(0)
		await expect(canvas.getByText("Every day at 08:00")).toBeVisible()
		await expect(slotsIn(canvasElement, "routine-run")).toHaveLength(
			DIGEST_RUNS.length,
		)

		await userEvent.click(
			canvas.getByRole("button", { name: "Back to the routines" }),
		)
		const rows = slotsIn(canvasElement, "routine-row")
		await expect(rows).toHaveLength(ROUTINES.length)
		await waitFor(
			() => expect(rows[0]?.querySelector("button[data-opens]")).toHaveFocus(),
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
					"The form as it is really reached: from the detail, not from the list. Check that it opens filled with that routine — its title, its expression, its trigger read as text rather than a list — that leaving it lands back on the detail rather than on the list two screens down, and that focus returns to the edit control that opened it. Pick `Saving` for what the detail shows once the form is submitted.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await userEvent.click(canvas.getByText("Morning digest"))
		await userEvent.click(canvas.getByRole("button", { name: "Edit routine" }))
		await expect(args.form?.onOpen).toHaveBeenCalledWith(MORNING_DIGEST.id)

		await expect(canvas.getByDisplayValue("Morning digest")).toBeVisible()
		await expect(canvas.getByDisplayValue("0 8 * * *")).toBeVisible()
		await expect(canvas.getByDisplayValue("On a schedule")).toHaveAttribute(
			"readonly",
		)

		await userEvent.click(
			canvas.getByRole("button", { name: "Back to the routine" }),
		)
		await expect(slotIn(canvasElement, "routine-detail")).toBeVisible()
		await waitFor(
			() =>
				expect(
					canvas.getByRole("button", { name: "Edit routine" }),
				).toHaveFocus(),
			FRAME_POLL,
		)
	},
})

export const Saving = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A routine renamed from the form the detail opened. Check that saving lands back on the detail rather than leaving the form on screen, and that the detail reads the title just saved while keeping the trigger source, which a written routine cannot change.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await userEvent.click(canvas.getByText("Morning digest"))
		await userEvent.click(canvas.getByRole("button", { name: "Edit routine" }))

		const title = canvas.getByLabelText("Title")
		await userEvent.clear(title)
		await userEvent.type(title, "Overnight digest")
		await userEvent.click(canvas.getByRole("button", { name: "Save routine" }))

		const detail = within(slotIn(canvasElement, "routine-detail"))
		await expect(detail.getByText("Overnight digest")).toBeVisible()
		await expect(detail.getByText("Every day at 08:00")).toBeVisible()
	},
})

export const RunNowFailed = meta.story({
	args: {
		detail: {
			onClose: fn(),
			onOpen: fn(),
			onRetryRuns: fn(),
			onRunNow: fn(),
			open: DIGEST_DETAIL,
		},
		failure: "write",
	},
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A Run now the app could not even send. Check that the detail borrows the write failure the panel already carries rather than growing a notice of its own, that the notice sits above the detail with the history left as it was, and that the runs are not blamed for a failure that never reached them. Pick the `Error` story of `RoutineDetail` for the runs that could not be read.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvas.getByText("The routine could not be changed"),
		).toBeVisible()
		await expect(slotIn(canvasElement, "routine-detail")).toBeVisible()
		await expect(slotsIn(canvasElement, "routine-run")).toHaveLength(
			DIGEST_RUNS.length,
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

		await userEvent.click(canvas.getByRole("button", { name: "Activity" }))
		const panel = canvas.getByRole("complementary", { name: "Activity" })
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
