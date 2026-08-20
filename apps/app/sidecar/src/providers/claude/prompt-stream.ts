import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"

import { asAsyncIterable, yielded } from "../../async-iterable"

const asUserMessage = (text: string): SDKUserMessage => ({
	type: "user",
	message: { role: "user", content: [{ type: "text", text }] },
	parent_tool_use_id: null,
})

export const createPromptStream = () => {
	const queued: SDKUserMessage[] = []
	let wake: (() => void) | undefined
	let ended = false

	const release = () => {
		wake?.()
		wake = undefined
	}

	const next = async (): Promise<IteratorResult<SDKUserMessage>> => {
		while (queued.length === 0 && !ended) {
			await new Promise<void>((resolve) => {
				wake = resolve
			})
		}
		return yielded(queued.shift())
	}

	return {
		push: (text: string) => {
			queued.push(asUserMessage(text))
			release()
		},
		end: () => {
			ended = true
			release()
		},
		stream: asAsyncIterable(next),
	}
}
