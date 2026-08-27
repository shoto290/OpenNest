import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
	ChatMarkProvider,
	useChatMarkId,
} from "@workspace/ui/components/chat-mark-context"

const MarkReader = ({ botId }: { botId?: string }) => {
	const markId = useChatMarkId(botId) ?? "plain"

	return (
		<>
			<i>{markId}</i>
			<i>{markId}</i>
		</>
	)
}

type MarkRequest = { transcriptKey?: string; botIds: (string | undefined)[] }

const readMarkIds = (requests: MarkRequest[]) => {
	const markup = renderToStaticMarkup(
		<div>
			{requests.map(({ transcriptKey, botIds }) => (
				<ChatMarkProvider
					key={transcriptKey ?? "minted"}
					transcriptKey={transcriptKey}
				>
					{botIds.map((botId) => (
						<MarkReader botId={botId} key={botId ?? "unnamed"} />
					))}
				</ChatMarkProvider>
			))}
		</div>,
	)

	return [...markup.matchAll(/<i>(.*?)<\/i>/g)].map(([, markId]) => markId)
}

const inTranscript = (transcriptKey: string, ...botIds: string[]) => ({
	transcriptKey,
	botIds,
})

describe("useChatMarkId", () => {
	it("hands out a different id to every bot of one conversation", () => {
		const [lyraMark, , orionMark] = readMarkIds([
			inTranscript("room-1", "bot-lyra", "bot-orion"),
		])

		expect(lyraMark).not.toBe(orionMark)
	})

	it("hands out a different id to one bot across two conversations", () => {
		const [inFirst, , inSecond] = readMarkIds([
			inTranscript("room-1", "bot-lyra"),
			inTranscript("room-2", "bot-lyra"),
		])

		expect(inFirst).not.toBe(inSecond)
	})

	it("hands out the same id on every render of one bot in one conversation", () => {
		const requests = [inTranscript("room-1", "bot-lyra")]

		expect(readMarkIds(requests)).toEqual(readMarkIds(requests))
	})

	it("shares one id between the readers of one bot", () => {
		const [first, second] = readMarkIds([inTranscript("room-1", "bot-lyra")])

		expect(first).toBe(second)
	})

	it("names no mark for a bot the transcript cannot name", () => {
		const [unnamed] = readMarkIds([
			{ transcriptKey: "room-1", botIds: [undefined] },
		])

		expect(unnamed).toBe("plain")
	})

	it("names a mark under a provider that mints its own key", () => {
		const [minted] = readMarkIds([{ botIds: ["bot-lyra"] }])

		expect(minted).not.toBe("plain")
	})
})
