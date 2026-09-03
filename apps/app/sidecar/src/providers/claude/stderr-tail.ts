const STDERR_TAIL_CHARS = 4000

export type StderrTail = {
	append: (chunk: string) => void
	kept: () => string
}

export const createStderrTail = (): StderrTail => {
	let tail = ""
	return {
		append: (chunk) => {
			tail = (tail + chunk).slice(-STDERR_TAIL_CHARS)
		},
		kept: () => tail.trim(),
	}
}
