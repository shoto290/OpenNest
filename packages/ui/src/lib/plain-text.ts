const CODE_FENCE = /^ {0,3}(?:`{3,}|~{3,}).*$/gm
const THEMATIC_BREAK = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})[ \t]*$/gm
const HEADING_OPENING = /^ {0,3}#{1,6}[ \t]+/gm
const HEADING_CLOSING = /[ \t]+#+[ \t]*$/gm
const BLOCKQUOTE_MARKER = /^ {0,3}(?:>[ \t]?)+/gm
const LIST_MARKER = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/gm
const TASK_MARKER = /^\[[ xX]\][ \t]+/gm

const INLINE_CODE = /`+([^`]*)`+/g
const INLINE_LINK = /!?\[([^\]]*)\]\([^)]*\)/g
const REFERENCE_LINK = /!?\[([^\]]*)\]\[[^\]]*\]/g
const AUTOLINK = /<((?:https?|mailto):[^>\s]+)>/g
const STAR_EMPHASIS = /(\*{1,2}|~~)(?=\S)([\s\S]*?\S)\1/g
const UNDERSCORE_EMPHASIS = /(?<!\w)(_{1,2})(?=\S)([\s\S]*?\S)\1(?!\w)/g

const REDUCTIONS = [
	[CODE_FENCE, ""],
	[INLINE_CODE, "$1"],
	[INLINE_LINK, "$1"],
	[REFERENCE_LINK, "$1"],
	[AUTOLINK, "$1"],
	[THEMATIC_BREAK, ""],
	[HEADING_OPENING, ""],
	[HEADING_CLOSING, ""],
	[BLOCKQUOTE_MARKER, ""],
	[LIST_MARKER, ""],
	[TASK_MARKER, ""],
	[STAR_EMPHASIS, "$2"],
	[UNDERSCORE_EMPHASIS, "$2"],
] as const satisfies readonly (readonly [RegExp, string])[]

const toPlainText = (markdown: string) =>
	REDUCTIONS.reduce((text, [mark, kept]) => text.replace(mark, kept), markdown)
		.replace(/\s+/g, " ")
		.trim()

export { toPlainText }
