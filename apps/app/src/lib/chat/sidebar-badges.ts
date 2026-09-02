import type { BotBadge as ShownBadge } from "@workspace/ui/components/badge"

import type { BotBadge } from "./bot-badge"

type BadgedRow = {
	id: string
}

type Badged<Row> = Row & {
	badge?: ShownBadge
}

const STRONGEST_FIRST: ShownBadge[] = ["attention", "failed", "done"]

const shownBadge = (badge: BotBadge | undefined): ShownBadge | undefined =>
	badge === undefined || badge === "none" ? undefined : badge

export const withBadges = <Row extends BadgedRow>(
	rows: Row[],
	badges: Record<string, BotBadge>,
): Badged<Row>[] =>
	rows.map((row) => ({ ...row, badge: shownBadge(badges[row.id]) }))

type BadgeCarrier = {
	badge?: ShownBadge
}

type BadgeCarriersBySpaceId = Record<string, BadgeCarrier[]>

const strongestBadge = (rows: BadgeCarrier[]): ShownBadge | undefined =>
	STRONGEST_FIRST.find((badge) => rows.some((row) => row.badge === badge))

export const toSpaceBadges = (
	botsBySpaceId: BadgeCarriersBySpaceId,
	conversationsBySpaceId: BadgeCarriersBySpaceId,
): Record<string, ShownBadge> => {
	const spaceIds = new Set([
		...Object.keys(botsBySpaceId),
		...Object.keys(conversationsBySpaceId),
	])
	const badges: Record<string, ShownBadge> = {}
	for (const spaceId of spaceIds) {
		const badge = strongestBadge([
			...(botsBySpaceId[spaceId] ?? []),
			...(conversationsBySpaceId[spaceId] ?? []),
		])
		if (badge) {
			badges[spaceId] = badge
		}
	}
	return badges
}
