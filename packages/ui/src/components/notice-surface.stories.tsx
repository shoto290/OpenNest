import {
	expect,
	screen,
	type UserEventObject,
	waitFor,
	within,
} from "storybook/test"

import preview from "@workspace/storybook/preview"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import {
	Content,
	Description as DialogDescription,
	Root as DialogRoot,
	Title as DialogTitle,
	Trigger,
} from "@workspace/ui/components/dialog"
import {
	type NoticeMessage,
	NoticeSurface,
	type NoticeSurfaceProps,
	raiseFailureNotice,
	raiseTransientNotice,
	TRANSIENT_NOTICE_DELAY,
} from "@workspace/ui/components/notice-surface"

const SAVED: NoticeMessage = {
	title: "Routine saved",
	description: "It runs every morning at nine.",
}

const FAILURE: NoticeMessage = {
	title: "Routine could not run",
	description:
		"The watched folder was not readable. Nothing was written, and the schedule is untouched.",
}

const LONG_FAILURE: NoticeMessage = {
	title: "ScheduledRoutineWatcherCouldNotReadTheWatchedDirectory",
	description:
		"The host refused the read while the routine was starting, so the run was abandoned before the first step. Nothing was written to the thread and the schedule is untouched. The next run is still due at nine tomorrow, and the folder can be repointed from the routine settings in the meantime.",
}

const STACK: NoticeMessage[] = [
	{ title: "First notice", description: "The oldest of the four." },
	{ title: "Second notice", description: "Raised after the first." },
	{ title: "Third notice", description: "Raised after the second." },
	{ title: "Fourth notice", description: "The newest of the four." },
]

const SHORT_DELAY = 700

const SWIPE_DISTANCE = 80

const A11Y_URGENT_NOTICE_HIDDEN_UNTIL_FOCUSED = {
	config: { rules: [{ id: "aria-hidden-focus", enabled: false }] },
}

type NoticeDemoProps = NoticeSurfaceProps & {
	label: string
	raise: () => void
}

const NoticeDemo = ({ label, raise, ...surface }: NoticeDemoProps) => (
	<>
		<Button onClick={raise} variant="outline">
			{label}
		</Button>
		<NoticeSurface {...surface} />
	</>
)

const viewport = () => {
	const surface = document.querySelector<HTMLElement>(
		"[data-slot=toast-viewport]",
	)
	if (!surface) throw new window.Error("The notice surface is not mounted")

	return surface
}

type SwipeOffset = {
	x?: number
	y?: number
}

const swipe = async (
	notice: HTMLElement,
	pointer: UserEventObject,
	offset: SwipeOffset,
) => {
	const box = notice.getBoundingClientRect()
	const from = {
		clientX: box.left + box.width / 2,
		clientY: box.top + box.height / 2,
	}

	const steps = [0.25, 0.5, 0.75, 1].map((ratio) => ({
		target: notice,
		coords: {
			clientX: from.clientX + (offset.x ?? 0) * ratio,
			clientY: from.clientY + (offset.y ?? 0) * ratio,
		},
	}))

	await pointer.pointer([
		{ keys: "[MouseLeft>]", target: notice, coords: from },
		...steps,
		{ keys: "[/MouseLeft]" },
	])
}

const failureNotice = async () => {
	const notice = await within(viewport()).findByRole("alertdialog", {
		hidden: true,
	})
	await waitFor(() => expect(notice).toBeVisible())

	return notice
}

const closeControl = () =>
	within(viewport()).getByRole("button", { hidden: true })

const noticesOnScreen = () =>
	Array.from(
		viewport().querySelectorAll<HTMLElement>("[data-slot=toast]"),
	).filter((notice) => !notice.hasAttribute("data-limited"))

const meta = preview.meta({
	title: "Overlays/NoticeSurface",
	component: NoticeSurface,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The window's notice surface: one viewport mounted once in the shell, and two ways to raise something into it. `raiseTransientNotice` reports what went right and leaves on its own once `TRANSIENT_NOTICE_DELAY` has passed; `raiseFailureNotice` reports what went wrong, wears the destructive border and its alert mark, and stays until the reader closes it — a failure that dismisses itself is close to silence. Both are module-level calls, so a controller, a driver or a scheduler raises a notice without a hook and without a component in scope. Notices land against the top inline-end edge, clear of the composer at the bottom and of the window controls at the top inline-start, newest nearest that edge, three at most. Enter and leave fade and slide over 150ms, and drop to a fade with no movement under `prefers-reduced-motion`. `transientDelay` on the viewport overrides the delay for the whole surface; a failure ignores it.",
			},
		},
	},
})

export const Default = meta.story({
	render: () => (
		<NoticeDemo
			label="Save the routine"
			raise={() => raiseTransientNotice(SAVED)}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The transient tier, the one an action that succeeded reaches for. Check that the notice lands in the top inline-end corner on the surface tokens the other floating surfaces use, is announced politely through the viewport's live region rather than interrupting, and leaves on its own once `TRANSIENT_NOTICE_DELAY` has passed without anyone touching it. Pick `Error` for the tier that stays.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Save the routine" }),
		)

		const notice = await screen.findByRole("dialog")
		await expect(notice).toHaveAccessibleName(SAVED.title)
		await expect(notice).toHaveAccessibleDescription(SAVED.description)

		const box = notice.getBoundingClientRect()
		await expect(box.top).toBeLessThanOrEqual(24)
		await expect(window.innerWidth - box.right).toBeLessThanOrEqual(24)

		await expect(viewport()).toHaveAttribute("aria-live", "polite")
		await expect(viewport()).toHaveAccessibleName("Notices")
		await expect(screen.queryByRole("alert")).toBe(null)

		await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null), {
			timeout: TRANSIENT_NOTICE_DELAY + 4000,
		})
	},
})

export const Error = meta.story({
	render: () => (
		<NoticeDemo
			label="Run the routine"
			raise={() => raiseFailureNotice(FAILURE)}
			transientDelay={SHORT_DELAY}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The failure tier, the one a background job reaches for when nobody opened anything. The story raises the failure from the trigger and a transient notice straight from the module, outside any component, then waits for the transient to leave: the failure is still there after a delay that already emptied its neighbour, because it holds until the reader closes it. While nobody has focused the surface, the urgent announcement is the library's hidden mirror and the drawn notice stays out of the accessibility tree, so the title is announced once rather than twice; a Tab to the close control puts the notice back in the tree, with a visible ring, and Enter takes it off screen. Pick `Default` for the tier that leaves on its own, `Dismissing` for the gesture, `LongContent` for a failure whose strings run past the notice width.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Run the routine" }),
		)

		const announcement = await screen.findByRole("alert")
		await expect(announcement).toHaveTextContent(FAILURE.title)

		await failureNotice()

		const announced = screen.getAllByText(FAILURE.title, {
			ignore: '[aria-hidden="true"], [aria-hidden="true"] *',
		})
		await expect(announced).toHaveLength(1)
		await expect(announcement).toContainElement(announced[0])

		raiseTransientNotice(SAVED)
		await within(viewport()).findByText(SAVED.title)
		await waitFor(
			() => expect(within(viewport()).queryByText(SAVED.title)).toBe(null),
			{ timeout: SHORT_DELAY + 4000 },
		)

		await expect(within(viewport()).getByText(FAILURE.title)).toBeVisible()

		const close = closeControl()
		await waitFor(async () => {
			await userEvent.tab()
			await expect(close).toHaveFocus()
		})
		await expect(close.matches(":focus-visible")).toBe(true)
		await expect(close).toHaveAccessibleName("Close notice")
		await expect(await screen.findByRole("alertdialog")).toHaveAccessibleName(
			FAILURE.title,
		)
		await expect(screen.queryByRole("alert")).toBe(null)

		await userEvent.keyboard("{Enter}")
		await waitFor(() =>
			expect(within(viewport()).queryByText(FAILURE.title)).toBe(null),
		)
	},
})

export const Stacked = meta.story({
	parameters: {
		a11y: A11Y_URGENT_NOTICE_HIDDEN_UNTIL_FOCUSED,
		docs: {
			description: {
				story:
					"Four failures raised in a row from the module itself, three kept. Reach for this when several jobs fail at once: check that the surface holds no more than three notices, that the one that no longer fits is the oldest, and that the newest sits nearest the top inline-end edge so a reader's eye lands on what just happened rather than on what they already read. The `aria-hidden-focus` audit is off here for the same reason as in `LongContent`: three urgent notices sit unfocused, hidden from the accessibility tree by the library while their mirrors do the announcing.",
			},
		},
	},
	play: async () => {
		for (const notice of STACK) {
			raiseFailureNotice(notice)
			await within(viewport()).findByText(notice.title)
		}

		await waitFor(() => expect(noticesOnScreen()).toHaveLength(3))

		const onScreen = noticesOnScreen()
		await expect(onScreen[0]).toHaveTextContent(STACK[3].title)
		await expect(onScreen[1]).toHaveTextContent(STACK[2].title)
		await expect(onScreen[2]).toHaveTextContent(STACK[1].title)
		await expect(within(viewport()).getByText(STACK[0].title)).not.toBeVisible()

		const tops = onScreen.map((notice) => notice.getBoundingClientRect().top)
		await expect(tops[0]).toBeLessThan(tops[1])
		await expect(tops[1]).toBeLessThan(tops[2])
	},
})

export const LongContent = meta.story({
	render: () => (
		<NoticeDemo
			label="Report the long failure"
			raise={() => raiseFailureNotice(LONG_FAILURE)}
		/>
	),
	parameters: {
		a11y: A11Y_URGENT_NOTICE_HIDDEN_UNTIL_FOCUSED,
		docs: {
			description: {
				story:
					"A failure whose title is one unbreakable word and whose description runs several sentences. Check that both wrap inside the notice instead of pushing it wider than the window, and that the close control keeps its own column at the inline end, still fully inside the notice and still 24 CSS pixels of hit area. The `aria-hidden-focus` audit is off here: the library keeps an urgent notice out of the accessibility tree until the surface is focused, so that its hidden mirror announces it once, and the close control stays in the tab order meanwhile.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Report the long failure" }),
		)

		const notice = await failureNotice()
		const close = closeControl()

		await expect(close).toHaveAttribute("aria-label", "Close notice")

		const noticeBox = notice.getBoundingClientRect()
		const closeBox = close.getBoundingClientRect()

		await expect(noticeBox.right).toBeLessThanOrEqual(window.innerWidth)
		await expect(closeBox.right).toBeLessThanOrEqual(noticeBox.right)
		await expect(closeBox.width).toBeGreaterThanOrEqual(24)
		await expect(closeBox.height).toBeGreaterThanOrEqual(24)
		await expect(
			within(viewport()).getByText(LONG_FAILURE.title).scrollWidth,
		).toBeLessThanOrEqual(Math.ceil(noticeBox.width))
	},
})

export const Dismissing = meta.story({
	render: () => (
		<NoticeDemo
			label="Run the routine"
			raise={() => raiseFailureNotice(FAILURE)}
		/>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The pointer way out. Notices are anchored to the top inline-end corner, so they leave through that corner: a drag up or toward the inline end dismisses, a drag toward the middle of the window snaps back and keeps the notice. Reach for this when checking that the gesture points at the nearest edge rather than dragging the notice across the surface.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Run the routine" }),
		)

		const notice = await failureNotice()

		await swipe(notice, userEvent, { y: SWIPE_DISTANCE })
		await expect(within(viewport()).getByText(FAILURE.title)).toBeVisible()

		await swipe(notice, userEvent, { y: -SWIPE_DISTANCE })
		await waitFor(() =>
			expect(within(viewport()).queryByText(FAILURE.title)).toBe(null),
		)
	},
})

export const WithDialog = meta.story({
	render: () => (
		<>
			<DialogRoot>
				<Trigger className={buttonVariants({ variant: "outline" })}>
					Bot settings
				</Trigger>
				<Content>
					<DialogTitle>Bot settings</DialogTitle>
					<DialogDescription>
						Name the bot, point it at a folder and tell it how to behave.
					</DialogDescription>
				</Content>
			</DialogRoot>
			<NoticeSurface />
		</>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A background failure raised while a modal dialog holds the window — the moment the surface exists for. The dialog dims the page and takes pointer interaction away from everything behind it, so the notice viewport draws above it and takes its own pointer events back: check that the notice is the topmost element under its own centre, that its close control dismisses it, and that the dialog is still open and untouched afterwards. Focus stays trapped in the dialog while it is open, so the notice is reachable here by pointer, not by Tab.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Bot settings" }))
		const dialog = await screen.findByRole("dialog")
		await waitFor(() => expect(dialog).toBeVisible())

		raiseFailureNotice(FAILURE)
		const notice = await failureNotice()

		const box = notice.getBoundingClientRect()
		const topmost = document.elementFromPoint(
			box.left + box.width / 2,
			box.top + box.height / 2,
		)
		await expect(notice.contains(topmost)).toBe(true)

		await userEvent.click(closeControl())
		await waitFor(() =>
			expect(within(viewport()).queryByText(FAILURE.title)).toBe(null),
		)
		await expect(dialog).toBeVisible()
	},
})
