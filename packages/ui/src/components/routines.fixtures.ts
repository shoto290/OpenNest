import type {
	RoutineDetailModel,
	RoutineRunModel,
} from "@workspace/ui/components/routine-detail"
import {
	EMPTY_ROUTINE_FILTER,
	type RoutineFormModel,
	type RoutineTriggerSource,
} from "@workspace/ui/components/routine-form"
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

export const SOURCE_NAMED_BY_ID: RoutineRowModel = {
	id: "routine-nightly-cleanup",
	title: "Nightly cleanup",
	triggerSourceTitle: "webhook",
	isEnabled: true,
	hasStoppedItself: false,
}

export const ROUTINES: RoutineRowModel[] = [
	MORNING_DIGEST,
	RELEASE_WATCH,
	SOURCE_NAMED_BY_ID,
]

export const RUNS_READ_AT = Date.parse("2026-03-04T09:30:00Z")

export const DIGEST_RUNS: RoutineRunModel[] = [
	{ id: "run-digest-f", outcome: null, startedAt: RUNS_READ_AT - 240_000 },
	{
		id: "run-digest-e",
		outcome: "reported",
		startedAt: RUNS_READ_AT - 7_200_000,
	},
	{
		id: "run-digest-d",
		outcome: "nothing",
		startedAt: RUNS_READ_AT - 18_000_000,
	},
	{
		id: "run-digest-c",
		outcome: "skipped",
		reason: "hourlyCap",
		startedAt: RUNS_READ_AT - 32_400_000,
	},
	{
		id: "run-digest-b",
		outcome: "failed",
		reason: "claude exited with status 1: unknown flag --resume-session",
		startedAt: RUNS_READ_AT - 93_600_000,
	},
	{
		id: "run-digest-a",
		outcome: "reported",
		startedAt: RUNS_READ_AT - 180_000_000,
	},
]

export const DIGEST_DETAIL: RoutineDetailModel = {
	id: MORNING_DIGEST.id,
	title: MORNING_DIGEST.title,
	triggerSourceTitle: MORNING_DIGEST.triggerSourceTitle,
	hasStoppedItself: MORNING_DIGEST.hasStoppedItself,
	runs: DIGEST_RUNS,
	isReadingRuns: false,
	hasFailedToReadRuns: false,
	hasReadFullPage: false,
	isRunning: false,
	now: RUNS_READ_AT,
}

export const WATCH_DETAIL: RoutineDetailModel = {
	...DIGEST_DETAIL,
	id: RELEASE_WATCH.id,
	title: RELEASE_WATCH.title,
	triggerSourceTitle: RELEASE_WATCH.triggerSourceTitle,
	hasStoppedItself: RELEASE_WATCH.hasStoppedItself,
	runs: [],
}

export const CLEANUP_DETAIL: RoutineDetailModel = {
	...DIGEST_DETAIL,
	id: SOURCE_NAMED_BY_ID.id,
	title: SOURCE_NAMED_BY_ID.title,
	triggerSourceTitle: SOURCE_NAMED_BY_ID.triggerSourceTitle,
	hasStoppedItself: SOURCE_NAMED_BY_ID.hasStoppedItself,
	runs: [],
}

export const TRIGGER_SOURCES: RoutineTriggerSource[] = [
	{
		id: "schedule",
		title: "On a schedule",
		kind: "schedule",
		payload: [
			{ name: "occurrenceId", type: "string" },
			{ name: "firedAt", type: "datetime" },
		],
	},
	{
		id: "file-watch",
		title: "When a watched file changes",
		kind: "fileWatch",
		payload: [
			{ name: "path", type: "string" },
			{ name: "changedAt", type: "datetime" },
			{ name: "isDirectory", type: "boolean" },
		],
	},
	{
		id: "local-webhook",
		title: "When a local webhook is called",
		kind: "localWebhook",
		payload: [
			{ name: "deliveryId", type: "string" },
			{ name: "event", type: "string" },
			{ name: "attempt", type: "number" },
		],
	},
	{
		id: "space-inbox",
		title: "When the space inbox fills",
		kind: "plain",
		payload: [
			{ name: "subject", type: "string" },
			{ name: "unreadCount", type: "number" },
			{ name: "isFlagged", type: "boolean" },
			{ name: "receivedAt", type: "datetime" },
		],
	},
]

export const SCHEDULED_FORM: RoutineFormModel = {
	id: MORNING_DIGEST.id,
	values: {
		title: "Morning digest",
		instruction: "Read what came in overnight and write a short digest.",
		triggerSourceId: "schedule",
		expression: "0 8 * * *",
		path: "",
		filter: EMPTY_ROUTINE_FILTER,
	},
}

export const WATCHING_FORM: RoutineFormModel = {
	id: RELEASE_WATCH.id,
	values: {
		title: "Release notes watch",
		instruction: "Say what changed in the release notes.",
		triggerSourceId: "file-watch",
		expression: "",
		path: "/notes/CHANGELOG.md",
		filter: EMPTY_ROUTINE_FILTER,
	},
}

export const CALLED_FORM: RoutineFormModel = {
	id: "routine-deploy-call",
	values: {
		title: "Deploy report",
		instruction: "Report what the deployment said.",
		triggerSourceId: "local-webhook",
		expression: "",
		path: "",
		filter: EMPTY_ROUTINE_FILTER,
	},
	webhook: {
		url: "http://127.0.0.1:45367/routines/call",
		key: "e6f0e4ba-2c15-4f7d-9a41-8d2f0c1b7e35",
		header: "X-OpenNest-Delivery",
	},
}

export const INBOX_FORM: RoutineFormModel = {
	id: SOURCE_NAMED_BY_ID.id,
	values: {
		title: "Nightly cleanup",
		instruction: "Close what the space inbox left open.",
		triggerSourceId: "space-inbox",
		expression: "",
		path: "",
		filter: EMPTY_ROUTINE_FILTER,
	},
}

export const FILTERED_FORM: RoutineFormModel = {
	id: SOURCE_NAMED_BY_ID.id,
	values: {
		...INBOX_FORM.values,
		filter: {
			matchMode: "any",
			rows: [
				{ field: "subject", operator: "contains", value: "invoice" },
				{ field: "unreadCount", operator: "gt", value: "10" },
			],
		},
	},
}

export const UNDESCRIBED_FORM: RoutineFormModel = {
	id: "routine-newsletter-sweep",
	values: {
		title: "Newsletter sweep",
		instruction: "Report what the newsletter inbox piled up.",
		triggerSourceId: "space-newsletter",
		expression: "",
		path: "",
		filter: {
			matchMode: "all",
			rows: [
				{
					field: "unreadCount",
					operator: "gt",
					value: "10",
					readAs: { operator: "gt", fieldType: "number" },
				},
				{
					field: "subject",
					operator: "contains",
					value: "invoice",
					readAs: { operator: "contains", fieldType: "string" },
				},
			],
		},
	},
}
