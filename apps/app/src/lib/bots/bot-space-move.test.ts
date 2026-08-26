import { describe, expect, it, vi } from "vitest"

import { type BotSpaceMove, moveBotToSpace } from "./bot-space-move"

import type { Bot } from "../conversations/store-contract"

const BOT = { id: "beacon" } as Bot

const parts = (moved: Bot | null): BotSpaceMove => ({
	botId: "beacon",
	spaceId: "veille",
	roster: { moveToSpace: vi.fn().mockResolvedValue(moved) },
	chat: {
		close: vi.fn().mockResolvedValue(undefined),
		open: vi.fn().mockResolvedValue(null),
	},
	spaces: { select: vi.fn() },
})

describe("moveBotToSpace", () => {
	it("closes the running session, opens the space it landed in and reopens the bot", async () => {
		const move = parts(BOT)

		await moveBotToSpace(move)

		expect(move.roster.moveToSpace).toHaveBeenCalledWith("beacon", "veille")
		expect(move.chat.close).toHaveBeenCalledWith("beacon")
		expect(move.spaces.select).toHaveBeenCalledWith("veille")
		expect(move.chat.open).toHaveBeenCalledWith("beacon")
	})

	it("leaves the reader where they are when the move is refused", async () => {
		const move = parts(null)

		await moveBotToSpace(move)

		expect(move.chat.close).not.toHaveBeenCalled()
		expect(move.spaces.select).not.toHaveBeenCalled()
		expect(move.chat.open).not.toHaveBeenCalled()
	})
})
