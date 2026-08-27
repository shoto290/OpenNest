type RosteredRow = { id: string }

type Rosters = Record<string, RosteredRow[]>

export type NewSectionSource = {
	rosters: Rosters
	conversationRosters?: Rosters
	shownSpaceId: string | null
	rowId?: string
}

export type NewSection = {
	spaceId: string
	botId: string | null
	conversationId: string | null
}

const spaceHolding = (rosters: Rosters, rowId: string) =>
	Object.entries(rosters).find(([, rows]) =>
		rows.some((row) => row.id === rowId),
	)?.[0]

export const newSectionFor = ({
	rosters,
	conversationRosters = {},
	shownSpaceId,
	rowId,
}: NewSectionSource): NewSection | undefined => {
	if (!rowId) {
		return shownSpaceId
			? { spaceId: shownSpaceId, botId: null, conversationId: null }
			: undefined
	}
	const botSpace = spaceHolding(rosters, rowId)
	if (botSpace) {
		return { spaceId: botSpace, botId: rowId, conversationId: null }
	}
	const conversationSpace = spaceHolding(conversationRosters, rowId)
	if (conversationSpace) {
		return { spaceId: conversationSpace, botId: null, conversationId: rowId }
	}
	return undefined
}
