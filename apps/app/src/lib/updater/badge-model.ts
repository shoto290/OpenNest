import type { UpdateBadgeProps } from "@workspace/ui/components/update-badge"

import type { UpdaterState } from "./updater-controller"

type UpdateBadgeModel = Pick<
	UpdateBadgeProps,
	"status" | "version" | "releaseNotes" | "progress" | "activeBotCount"
>

type UpdateBadgeInput = {
	state: UpdaterState
	busyBotCount: number
}

/** The restart comes first because it is the only thing left to do: a check that
 * failed six hours after the install still has an installed build behind it. A
 * download running outranks an error for the same reason — what is on the screen
 * should be what is happening. */
const statusOf = (state: UpdaterState): UpdateBadgeProps["status"] => {
	if (state.isRestartPending) {
		return "ready"
	}
	if (state.progress !== null) {
		return "downloading"
	}
	if (state.error) {
		return "error"
	}
	return state.available ? "available" : "idle"
}

const BULLET = /^[-*+]\s*/

/** Release bodies come as one block of text, one change to a line, often already
 * bulleted. The panel draws the bullets itself, so the marker is dropped. */
const linesOf = (notes: string | null | undefined): string[] =>
	(notes ?? "")
		.split("\n")
		.map((line) => line.trim().replace(BULLET, ""))
		.filter((line) => line.length > 0)

export const toUpdateBadgeProps = ({
	state,
	busyBotCount,
}: UpdateBadgeInput): UpdateBadgeModel => ({
	status: statusOf(state),
	version: state.available?.version,
	releaseNotes: linesOf(state.available?.notes),
	progress: state.progress ?? 0,
	activeBotCount: busyBotCount,
})
