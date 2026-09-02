import type { RoutineRowModel } from "@workspace/ui/components/routine-row"

export const MORNING_DIGEST: RoutineRowModel = {
	id: "routine-morning-digest",
	title: "Morning digest",
	triggerSourceTitle: "Every day at 08:00",
	isEnabled: true,
	hasStoppedItself: false,
}

export const RELEASE_WATCH: RoutineRowModel = {
	id: "routine-release-watch",
	title: "Release notes watch",
	triggerSourceTitle: "CHANGELOG.md changes",
	isEnabled: false,
	hasStoppedItself: true,
}

export const UNNAMED_SOURCE: RoutineRowModel = {
	id: "routine-unnamed-source",
	title: "Nightly cleanup",
	triggerSourceTitle: null,
	isEnabled: true,
	hasStoppedItself: false,
}

export const ROUTINES: RoutineRowModel[] = [
	MORNING_DIGEST,
	RELEASE_WATCH,
	UNNAMED_SOURCE,
]
