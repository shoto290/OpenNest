/** A fence line: up to three spaces, then three or more backticks or tildes.
 * The tail is an info string, which only an opening fence carries. */
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/

/** A bullet or an ordered item, at an indent markdown still reads as a list.
 * The captured bullet or delimiter tells one list from the next: markdown opens
 * a new list wherever that marker changes. */
const LIST_ITEM = /^ {0,3}(?:([-*+])|\d{1,9}([.)]))(?:\s|$)/

/** A line that hangs off the line above it rather than starting its own block. */
const INDENTED = /^\s/

/** The dashes under a table's header: a line of pipes, dashes and the colons that
 * declare a column's alignment, and nothing else. It is what tells a table from a
 * paragraph that happens to hold pipes. Opening on one of those three keeps an
 * indented code sample out, where a leading space would let one in. */
const TABLE_DELIMITER = /^ {0,3}[-:|][-:| ]*$/

/** What a line does to the block it lands in. A blank line breaks one, unless a
 * fence is holding the block open: there a blank line is code, and the sample
 * stays in one piece. */
type LineKind = "break" | "code" | "text"

const fenceMarkerOf = (line: string): string | null =>
	FENCE.exec(line)?.[1] ?? null

/** A fence closes on the character it opened with, at least as long, and with
 * nothing but the marker on the line. */
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

/** A blank line ends a block, except inside one list: its items and the
 * paragraphs indented under them are one loose list, so they belong in one
 * bubble — indentation and all, since that is what ties them to their item. */
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

/** The lines the writer has finished. Whatever follows the final newline is no
 * line yet: mid-stream it is half written, and says nothing about the block it
 * will land in — `2` breaks a list where `2.` continues one — while a turn that
 * has ended leaves only the empty tail of its closing newline. */
const toWrittenLines = (text: string, unfinished: boolean): string[] => {
	const lines = text.split("\n")
	if (unfinished || lines.at(-1) === "") {
		lines.pop()
	}
	return lines
}

/** The markdown blocks the lines are made of, in the order they were written and
 * with their own indentation, which is what tells an indented code block from a
 * paragraph. The last block is closed — and followed by an empty one saying so —
 * only when a blank line ended it and no list can reopen it; everything else
 * still stands to grow. */
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

/** The blocks of an answer a transcript may show. One that has not ended keeps
 * its trailing block private — a fence it has not closed and a list it may still
 * add an item to included — so nothing published is rewritten by a later delta. */
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

/** A block that is nothing but a GFM table: a header row, the dashes under it,
 * and the rows below — every line a row of pipes. Such a block draws its own
 * frame, so the screen has nothing left to put a bubble around. */
export const isTableBlock = (block: string): boolean => {
	const lines = block.split("\n")
	return (
		lines.length > 1 &&
		TABLE_DELIMITER.test(lines[1]) &&
		lines.every((line) => line.includes("|"))
	)
}
