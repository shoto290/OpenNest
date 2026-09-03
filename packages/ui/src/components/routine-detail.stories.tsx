import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import {
	ROUTINE_RUN_OUTCOMES,
	ROUTINE_RUN_REFUSALS,
	RoutineDetail,
	type RoutineRunModel,
	type RoutineRunOutcome,
} from "@workspace/ui/components/routine-detail"
import {
	DIGEST_DETAIL,
	DIGEST_RUNS,
	RELEASE_WATCH,
	RUNS_READ_AT,
	WATCH_DETAIL,
} from "@workspace/ui/components/routines.fixtures"
import { ROUTINES_PANEL_WIDTH } from "@workspace/ui/components/routines-panel"

const HOUR = 3_600_000

const REASON_OF: Record<RoutineRunOutcome, string | undefined> = {
	reported: undefined,
	nothing: undefined,
	skipped: "leaseHeld",
	failed: "claude exited with status 1: unknown flag --resume-session",
}

const OUTCOME_RUNS: RoutineRunModel[] = ROUTINE_RUN_OUTCOMES.map(
	(outcome, rank) => ({
		id: `run-${outcome}`,
		outcome,
		reason: REASON_OF[outcome],
		startedAt: RUNS_READ_AT - (rank + 1) * HOUR,
	}),
)

const REASONLESS_RUNS: RoutineRunModel[] = DIGEST_RUNS.map((run) => ({
	...run,
	reason: undefined,
}))

const LONG_TITLE =
	"Read every changelog of every package this workspace depends on and summarise it"

const LONG_REASON =
	"claude exited with status 1: the session could not be resumed because the transcript file /Users/ada/Library/Application Support/opennest/sessions/2026-03-04.jsonl was written by another version"

const meta = preview.meta({
	title: "Conversation/Routines/RoutineDetail",
	component: RoutineDetail,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"One routine as the panel shows it once a row is opened: its title, the source that fires it, the way to edit it, the way to run it on the spot, and the runs already recorded. It renders no clock of its own — every relative time comes from the `now` its caller supplies, so a story and a screenshot read the same on every run. A refused Run now is answered beside the control, because a refusal writes no run and would otherwise leave the reader with an unchanged history and no reason.",
			},
		},
	},
	args: {
		...DIGEST_DETAIL,
		onEdit: fn(),
		onRetryRuns: fn(),
		onRunNow: fn(),
	},
	render: (args) => (
		<div style={{ width: ROUTINES_PANEL_WIDTH }}>
			<RoutineDetail {...args} />
		</div>
	),
})

export const Default = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A routine with a page of runs behind it, read short of the page size. Check that the aggregate counts the runs read and the reports among them rather than claiming the whole life of the routine, that the most recent run dates the aggregate, and that the rows come newest first whatever order the caller passed them in.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(canvas.getByText(DIGEST_DETAIL.title)).toBeVisible()
		await expect(
			canvas.getByText(DIGEST_DETAIL.triggerSourceTitle),
		).toBeVisible()

		const aggregate = slotIn(canvasElement, "routine-runs-aggregate")
		await expect(aggregate).toHaveTextContent("6 runs")
		await expect(aggregate).toHaveTextContent("2 reports")
		await expect(aggregate).toHaveTextContent("Most recent 4 minutes ago")

		const rows = slotsIn(canvasElement, "routine-run")
		await expect(rows).toHaveLength(DIGEST_RUNS.length)
		await expect(rows[0]).toHaveTextContent("Running")

		await userEvent.click(canvas.getByRole("button", { name: "Run now" }))
		await expect(args.onRunNow).toHaveBeenCalled()
	},
})

export const Outcomes = meta.story({
	args: { runs: OUTCOME_RUNS },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The four outcomes a finished run can carry, one row each. Check that each is named in words — reported, nothing to report, skipped, failed — and marked by a glyph of its own, so a reader who cannot tell the colours apart still tells the rows apart, and that a stored reason is shown exactly as the run recorded it rather than translated into product prose.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const rows = slotsIn(canvasElement, "routine-run")
		await expect(rows).toHaveLength(ROUTINE_RUN_OUTCOMES.length)

		for (const label of [
			"Reported",
			"Nothing to report",
			"Skipped",
			"Failed",
		]) {
			await expect(canvas.getByText(label)).toBeVisible()
		}

		await expect(canvas.getByText("leaseHeld")).toBeVisible()
		await expect(slotsIn(canvasElement, "routine-run-reason")).toHaveLength(2)
	},
})

export const Running = meta.story({
	args: { runs: DIGEST_RUNS.slice(0, 1) },
	parameters: {
		docs: {
			description: {
				story:
					"A run started and not ended. Check that the row reads as running rather than borrowing an outcome it does not have yet, that it is counted in the runs read but not among the reports, and that its spinner stops under reduced motion instead of turning forever.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByText("Running")).toBeVisible()

		const aggregate = slotIn(canvasElement, "routine-runs-aggregate")
		await expect(aggregate).toHaveTextContent("1 run")
		await expect(aggregate).toHaveTextContent("0 reports")
	},
})

export const WithoutReason = meta.story({
	args: { runs: REASONLESS_RUNS },
	parameters: {
		docs: {
			description: {
				story:
					"Runs that recorded no reason. Check that each row stops after its outcome and its time, with no empty line held open under it, and that the rows stay the same height as one another. Pick `Outcomes` for the rows that do carry a reason.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(slotsIn(canvasElement, "routine-run")).toHaveLength(
			REASONLESS_RUNS.length,
		)
		await expect(slotsIn(canvasElement, "routine-run-reason")).toHaveLength(0)
	},
})

export const FullPageRead = meta.story({
	args: { hasReadFullPage: true },
	parameters: {
		docs: {
			description: {
				story:
					"The read came back full, so older runs are still in the store. Check that the aggregate says the last runs read rather than counting them as everything the routine ever did — the runs here are shortened to six for readability, the app reads a page of fifty. Pick `Default` for the read that came back short of a page.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			slotIn(canvasElement, "routine-runs-aggregate"),
		).toHaveTextContent("Last 6 runs read")
	},
})

export const StoppedItself = meta.story({
	args: {
		...WATCH_DETAIL,
		runs: OUTCOME_RUNS,
	},
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A routine that failed enough times in a row to stop itself. Check that the badge reads the same words as the one on the list row and is driven by the same value, so a reader who opened the row is not told two different things about the same routine.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByText(RELEASE_WATCH.title)).toBeVisible()
		await expect(slotIn(canvasElement, "routine-stopped")).toHaveTextContent(
			"Stopped itself",
		)
	},
})

export const Loading = meta.story({
	args: { isReadingRuns: true, runs: [] },
	parameters: {
		docs: {
			description: {
				story:
					"The first read of the runs, still in flight. Check that the reading state takes the place of both the aggregate and the rows rather than sitting above an empty list, and that it is announced politely instead of stealing the focus the detail just took.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			slotIn(canvasElement, "routine-runs-reading"),
		).toHaveTextContent("Reading the runs of this routine.")
		await expect(slotsIn(canvasElement, "routine-runs-aggregate")).toHaveLength(
			0,
		)
		await expect(slotsIn(canvasElement, "routine-run")).toHaveLength(0)
	},
})

export const Empty = meta.story({
	args: { runs: [] },
	parameters: {
		docs: {
			description: {
				story:
					"A routine no run was recorded for. Check that the empty state says exactly that — a routine can have fired and been refused without ever writing a row, so nothing here claims it never fired — and that the Run now control stays offered above it.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByText("No run recorded")).toBeVisible()
		await expect(slotsIn(canvasElement, "routine-run")).toHaveLength(0)
		await expect(canvas.getByRole("button", { name: "Run now" })).toBeVisible()
	},
})

export const Error = meta.story({
	args: { hasFailedToReadRuns: true, runs: [] },
	parameters: {
		docs: {
			description: {
				story:
					"The runs could not be read. Check that the failure takes the place of the history rather than passing for an empty one, that it blames the read of the runs and not the read of the routines, and that its retry asks for the runs again. Pick `Empty` for the routine that really has no run.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByText("The runs could not be read")).toBeVisible()
		await expect(canvas.queryByText("No run recorded")).not.toBeInTheDocument()

		await userEvent.click(canvas.getByRole("button", { name: "Retry" }))
		await expect(args.onRetryRuns).toHaveBeenCalled()
	},
})

export const RunNowInFlight = meta.story({
	args: { isRunning: true },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A Run now request on its way. Check that the control stays where it was rather than being swapped for a spinner, that it is disabled and marked busy so a second press cannot start a second run, and that the history under it is left as it was until the request settles.",
			},
		},
	},
	play: async ({ args, canvas }) => {
		const control = canvas.getByRole("button", { name: "Run now" })
		await expect(control).toBeDisabled()
		await expect(control).toHaveAttribute("aria-busy", "true")
		await expect(args.onRunNow).not.toHaveBeenCalled()
	},
})

const REFUSED_RUN: RoutineRunModel = {
	id: "run-refused",
	outcome: "reported",
	startedAt: RUNS_READ_AT - HOUR,
}

export const RunNowRefused = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"Every answer a refused Run now can carry, one detail each. A refusal writes no run, so it is never readable in the history: the sentence beside the control is the only place a reader learns why nothing happened. Check that each refusal names its own cause rather than sharing one catch-all sentence.",
			},
		},
	},
	render: (args) => (
		<div
			className="flex flex-col gap-4"
			style={{ width: ROUTINES_PANEL_WIDTH }}
		>
			{ROUTINE_RUN_REFUSALS.map((refusal) => (
				<RoutineDetail
					{...args}
					key={refusal}
					refusal={refusal}
					runs={[REFUSED_RUN]}
				/>
			))}
		</div>
	),
	play: async ({ canvasElement }) => {
		const shown = slotsIn(canvasElement, "routine-run-refusal")
		await expect(shown).toHaveLength(ROUTINE_RUN_REFUSALS.length)

		const sentences = shown.map((line) => line.textContent)
		await expect(new Set(sentences).size).toBe(ROUTINE_RUN_REFUSALS.length)
		await expect(shown[0]).toHaveTextContent("This routine is off")
	},
})

export const LongContent = meta.story({
	args: {
		title: LONG_TITLE,
		runs: [
			{
				id: "run-long",
				outcome: "failed",
				reason: LONG_REASON,
				startedAt: RUNS_READ_AT - HOUR,
			},
		],
	},
	parameters: {
		docs: {
			description: {
				story:
					"A title and a stored reason longer than the panel is wide, the worst case a reader hits at 200 percent zoom. Check that both wrap inside the panel width instead of being cut or pushing a scrollbar sideways, and that the two controls stay side by side until they no longer fit and then stack.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const surface = slotIn(canvasElement, "routine-detail")
		const reason = slotIn(canvasElement, "routine-run-reason")

		await expect(canvas.getByText(LONG_TITLE)).toBeVisible()
		await expect(reason.scrollWidth).toBeLessThanOrEqual(
			surface.clientWidth + 1,
		)
	},
})
