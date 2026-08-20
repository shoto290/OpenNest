import type { UpdateBadgeProps } from "@workspace/ui/components/update-badge"

import type { UpdaterState } from "./updater-controller"

type UpdateBadgeModel = Pick<
	UpdateBadgeProps,
	| "status"
	| "version"
	| "releaseNotes"
	| "releaseNotesUrl"
	| "progress"
	| "activeBotCount"
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

/** The manifest carries no address, only a version, and every release is
 * published under the tag that version was cut as. */
const RELEASE_TAG_URL = "https://github.com/shoto290/OpenNest/releases/tag"

const releaseNotesUrlOf = (version: string | undefined) =>
	version ? `${RELEASE_TAG_URL}/v${version}` : undefined

export const toUpdateBadgeProps = ({
	state,
	busyBotCount,
}: UpdateBadgeInput): UpdateBadgeModel => ({
	status: statusOf(state),
	version: state.available?.version,
	releaseNotes: linesOf(state.available?.notes),
	releaseNotesUrl: releaseNotesUrlOf(state.available?.version),
	progress: state.progress ?? 0,
	activeBotCount: busyBotCount,
})
