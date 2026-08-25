import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
	ChatMarkProvider,
	useChatMarkId,
} from "@workspace/ui/components/chat-mark-context"

const MarkReader = () => <i>{useChatMarkId()}</i>

const readMarkIds = (transcriptKeys: (string | undefined)[]) => {
	const markup = renderToStaticMarkup(
		<div>
			{transcriptKeys.map((transcriptKey) => (
				<ChatMarkProvider
					key={transcriptKey ?? "minted"}
					transcriptKey={transcriptKey}
				>
					<MarkReader />
					<MarkReader />
				</ChatMarkProvider>
			))}
		</div>,
	)

	return [...markup.matchAll(/<i>(.*?)<\/i>/g)].map(([, markId]) => markId)
}

describe("ChatMarkProvider", () => {
	it("hands out a different id to every transcript key", () => {
		const [lyraMark, , orionMark] = readMarkIds(["bot-lyra", "bot-orion"])

		expect(lyraMark).not.toBe(orionMark)
	})

	it("hands out the same id on every render of one transcript key", () => {
		expect(readMarkIds(["bot-lyra"])).toEqual(readMarkIds(["bot-lyra"]))
	})

	it("shares one id between the readers of one provider", () => {
		const [first, second] = readMarkIds(["bot-lyra"])

		expect(first).toBe(second)
	})

	it("mints an id shared by its readers when no transcript key is given", () => {
		const [first, second] = readMarkIds([undefined])

		expect(first).toBeTruthy()
		expect(first).toBe(second)
	})
})
