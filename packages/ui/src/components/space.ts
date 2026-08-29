import type { BotAvatarBlot } from "@workspace/ui/components/bot-avatar"

type Space = {
	id: string
	name: string
	colour?: BotAvatarBlot | null
}

const spaceAtRank = (spaces: Space[], rank: number) => spaces[rank - 1]

export { type Space, spaceAtRank }
