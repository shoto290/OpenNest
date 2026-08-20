import { asAsyncIterable, yielded } from "./async-iterable"

export const readLines = (): AsyncIterable<string> => {
	const reader = Bun.stdin.stream().getReader()
	const decoder = new TextDecoder()
	const pending: string[] = []
	let buffer = ""
	let drained = false

	const take = (chunk: Uint8Array) => {
		buffer += decoder.decode(chunk, { stream: true })
		const lines = buffer.split("\n")
		buffer = lines.pop() ?? ""
		pending.push(...lines.filter((line) => line.trim().length > 0))
	}

	const next = async (): Promise<IteratorResult<string>> => {
		while (pending.length === 0 && !drained) {
			const chunk = await reader.read()
			if (chunk.done) {
				drained = true
				if (buffer.trim().length > 0) {
					pending.push(buffer)
				}
				buffer = ""
				break
			}
			take(chunk.value)
		}
		return yielded(pending.shift())
	}

	return asAsyncIterable(next)
}
