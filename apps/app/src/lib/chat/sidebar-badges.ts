import type { AppSidebarBot } from "@workspace/ui/components/app-sidebar"
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

const strongestBadge = (bots: AppSidebarBot[]): ShownBadge | undefined =>
	STRONGEST_FIRST.find((badge) => bots.some((bot) => bot.badge === badge))

export const toSpaceBadges = (
	botsBySpaceId: Record<string, AppSidebarBot[]>,
): Record<string, ShownBadge> => {
	const badges: Record<string, ShownBadge> = {}
	for (const [spaceId, bots] of Object.entries(botsBySpaceId)) {
		const badge = strongestBadge(bots)
		if (badge) {
			badges[spaceId] = badge
		}
	}
	return badges
}
