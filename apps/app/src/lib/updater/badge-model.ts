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

const linesOf = (notes: string | null | undefined): string[] =>
	(notes ?? "")
		.split("\n")
		.map((line) => line.trim().replace(BULLET, ""))
		.filter((line) => line.length > 0)

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
