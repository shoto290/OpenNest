type RosteredBot = { id: string }

export type NewSectionSpace = {
	rosters: Record<string, RosteredBot[]>
	shownSpaceId: string | null
	botId?: string
}

export const spaceForNewSection = ({
	rosters,
	shownSpaceId,
	botId,
}: NewSectionSpace): string | undefined => {
	if (!botId) {
		return shownSpaceId ?? undefined
	}
	const holding = Object.entries(rosters).find(([, bots]) =>
		bots.some((bot) => bot.id === botId),
	)
	return holding?.[0]
}
