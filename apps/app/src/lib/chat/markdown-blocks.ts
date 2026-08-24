const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/

const LIST_ITEM = /^ {0,3}(?:([-*+])|\d{1,9}([.)]))(?:\s|$)/

const INDENTED = /^\s/

const TABLE_DELIMITER = /^ {0,3}[-:|][-:| ]*$/

type LineKind = "break" | "code" | "text"

const fenceMarkerOf = (line: string): string | null =>
	FENCE.exec(line)?.[1] ?? null

const closesFence = (line: string, marker: string): boolean => {
	const match = FENCE.exec(line)
	return (
		match !== null &&
		match[1][0] === marker[0] &&
		match[1].length >= marker.length &&
		match[2].trim().length === 0
	)
}

const listMarkerOf = (line: string): string | null => {
	const match = LIST_ITEM.exec(line)
	return match ? (match[1] ?? match[2]) : null
}

const continuesList = (marker: string | null, line: string): boolean =>
	marker !== null && (marker === listMarkerOf(line) || INDENTED.test(line))

const toLineKinds = (lines: string[]): LineKind[] => {
	const kinds: LineKind[] = []
	let fence: string | null = null

	for (const line of lines) {
		if (fence) {
			kinds.push("code")
			fence = closesFence(line, fence) ? null : fence
			continue
		}
		kinds.push(line.length === 0 ? "break" : "text")
		fence = fenceMarkerOf(line)
	}
	return kinds
}

const toWrittenLines = (text: string, unfinished: boolean): string[] => {
	const lines = text.split("\n")
	if (unfinished || lines.at(-1) === "") {
		lines.pop()
	}
	return lines
}

const splitBlocks = (lines: string[]): string[] => {
	const kinds = toLineKinds(lines)
	const blocks: string[] = []
	let block: string[] = []
	let blanks: string[] = []
	let marker: string | null = null

	lines.forEach((line, index) => {
		const kind = kinds[index]
		if (kind === "break") {
			if (block.length > 0) {
				blanks.push(line)
			}
			return
		}
		if (blanks.length > 0) {
			if (continuesList(marker, line)) {
				block.push(...blanks)
			} else {
				blocks.push(block.join("\n"))
				block = []
				marker = null
			}
			blanks = []
		}
		block.push(line)
		if (kind === "text") {
			marker ??= listMarkerOf(line)
		}
	})

	if (block.length > 0) {
		blocks.push(block.join("\n"))
		if (blanks.length > 0 && marker === null) {
			blocks.push("")
		}
	}
	return blocks
}

export const toPublishedBlocks = (
	text: string,
	unfinished: boolean,
): string[] => {
	const blocks = splitBlocks(toWrittenLines(text, unfinished))
	const closed = unfinished ? blocks.slice(0, -1) : blocks
	return closed
		.map((block) => block.trimEnd())
		.filter((block) => block.length > 0)
}

export const isTableBlock = (block: string): boolean => {
	const lines = block.split("\n")
	return (
		lines.length > 1 &&
		TABLE_DELIMITER.test(lines[1]) &&
		lines.every((line) => line.includes("|"))
	)
}
