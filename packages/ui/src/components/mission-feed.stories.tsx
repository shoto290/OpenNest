import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { listExhaustively, slotsIn } from "@workspace/storybook/story-utils"
import type { MissionEventKind } from "@workspace/ui/components/mission"
import { MissionFeed } from "@workspace/ui/components/mission-feed"
import {
	MISSION_EVENTS,
	MISSION_NOW,
} from "@workspace/ui/components/missions.fixtures"

const MISSION_EVENT_KINDS = listExhaustively<MissionEventKind>({
	opened: true,
	note: true,
	agent_asked: true,
	answered: true,
	escalated: true,
	ready: true,
	failed: true,
	closed: true,
})

const UNBREAKABLE_SOURCE =
	"claude-code-runtime-session-0f3a9c1d4e5b6a7c8d9e0f1a2b3c4d5e"

const meta = preview.meta({
	title: "Conversation/Missions/MissionFeed",
	component: MissionFeed,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"Everything a mission recorded, in the order it happened. An event whose payload holds a text string speaks, and gets the soft bubble the transcript already uses; every other event is a machine line, kept to one line so the feed stays scannable however much a bot writes into a payload. Reach for it inside `MissionThread`; on its own it is useful to compare the two forms an event can take.",
			},
		},
	},
	args: { events: MISSION_EVENTS, now: MISSION_NOW },
	render: (args) => (
		<div className="w-[36rem] max-w-full">
			<MissionFeed {...args} />
		</div>
	),
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A mission that ran, asked, escalated and closed. Check that the two events carrying text are the only bubbles and that every other event is a muted single line reading source, wording and time. Pick `EventKinds` to read the wording of all eight kinds at once.",
			},
		},
	},
})

export const EventKinds = meta.story({
	args: {
		events: MISSION_EVENT_KINDS.map((kind, rank) => ({
			id: `event-${kind}`,
			kind,
			source: "claude-code",
			createdAt: MISSION_NOW - (MISSION_EVENT_KINDS.length - rank) * 60_000,
		})),
	},
	parameters: {
		docs: {
			description: {
				story:
					"The eight kinds an event can carry, exhaustively, all in their machine form. Check that each kind reads as a distinct sentence and that none of them falls back to a raw identifier. Adding a kind to `MISSION_EVENT_KINDS` without adding its wording to the catalogue surfaces here as a missing sentence.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(slotsIn(canvasElement, "mission-machine-line")).toHaveLength(
			MISSION_EVENT_KINDS.length,
		)
	},
})

export const LongContent = meta.story({
	args: {
		events: [
			{
				id: "event-long-source",
				kind: "note",
				source: UNBREAKABLE_SOURCE,
				createdAt: MISSION_NOW - 60_000,
			},
			{
				id: "event-long-text",
				kind: "escalated",
				source: UNBREAKABLE_SOURCE,
				createdAt: MISSION_NOW - 30_000,
				text: `The run stalled on ${UNBREAKABLE_SOURCE} and the mission needs a human to say whether it should be resumed or abandoned.`,
			},
		],
	},
	parameters: {
		docs: {
			description: {
				story:
					"A source no human authored and a bubble holding it inline, in a container squeezed to 320 pixels. Check that the machine line stays on exactly one line and truncates rather than pushing the time out of view, and that the bubble breaks the same string across lines instead of widening the feed. Pick `Default` for realistic lengths.",
			},
		},
	},
	render: (args) => (
		<div className="w-80 max-w-full">
			<MissionFeed {...args} />
		</div>
	),
	play: async ({ canvasElement }) => {
		const line = slotsIn(canvasElement, "mission-machine-line")[0]

		await expect(line).toBeVisible()
		await expect(line?.scrollWidth).toBeLessThanOrEqual(
			(line?.clientWidth ?? 0) + 1,
		)
	},
})

export const Empty = meta.story({
	args: { events: [] },
	parameters: {
		docs: {
			description: {
				story:
					"A mission opened with nothing recorded against it yet. Check that the feed renders nothing at all: no shell, no placeholder line, no illustration. The header and the composer already say a mission is here, so a second empty surface would only repeat them.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			slotsIn(canvasElement, "mission-feed")[0],
		).toBeEmptyDOMElement()
	},
})
