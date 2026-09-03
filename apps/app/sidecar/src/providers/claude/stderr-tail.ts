const STDERR_TAIL_CHARS = 4000

export const createStderrTail = () => {
	let tail = ""
	return {
		append: (chunk: string) => {
			tail = (tail + chunk).slice(-STDERR_TAIL_CHARS)
		},
		kept: () => tail.trim(),
	}
}
