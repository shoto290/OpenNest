import type { BotAvatarBlot } from "@workspace/ui/components/bot-avatar"

type Space = {
	id: string
	name: string
	colour: BotAvatarBlot
}

const spaceAtRank = (spaces: Space[], rank: number) => spaces[rank - 1]

const spaceBeside = (
	spaces: Space[],
	selectedId: string | undefined,
	step: number,
) => {
	const selected = spaces.findIndex((space) => space.id === selectedId)
	if (selected < 0) return undefined
	return spaces[selected + step]
}

export { type Space, spaceAtRank, spaceBeside }
