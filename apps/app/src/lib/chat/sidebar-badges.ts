import type { AgentSidebarBot } from "@workspace/ui/components/agents/agent-sidebar"
import type { BotBadge as ShownBadge } from "@workspace/ui/components/badge"

import type { BotBadge } from "./bot-badge"

const STRONGEST_FIRST: ShownBadge[] = ["attention", "failed", "done"]

const shownBadge = (badge: BotBadge | undefined): ShownBadge | undefined =>
	badge === undefined || badge === "none" ? undefined : badge

export const withBadges = (
	bots: AgentSidebarBot[],
	badges: Record<string, BotBadge>,
): AgentSidebarBot[] =>
	bots.map((bot) => ({ ...bot, badge: shownBadge(badges[bot.id]) }))

const strongestBadge = (bots: AgentSidebarBot[]): ShownBadge | undefined =>
	STRONGEST_FIRST.find((badge) => bots.some((bot) => bot.badge === badge))

export const toSpaceBadges = (
	botsBySpaceId: Record<string, AgentSidebarBot[]>,
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
