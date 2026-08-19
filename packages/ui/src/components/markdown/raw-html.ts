interface MdastNode {
	type: string
	value?: string
	spread?: boolean
	children?: MdastNode[]
}

/** Nodes whose children are blocks. Raw HTML standing in one of them is a block of its
 * own and needs a paragraph to live in, which is where the prose rules keep the line
 * breaks its author wrote. Anywhere else the HTML sits among words, and a leaf is what
 * holds it inside its sentence. */
const BLOCK_PARENTS = new Set([
	"blockquote",
	"footnoteDefinition",
	"listItem",
	"root",
])

/** A type no handler claims, so the source reaches hast as one text node, character for
 * character. An ordinary `text` node would be trimmed of the indentation on every line
 * but the first, which is most of what makes written HTML readable. */
const literalOf = (value: string, holdsBlocks: boolean): MdastNode => {
	const literal: MdastNode = { type: "literalHtml", value }

	return holdsBlocks ? { type: "paragraph", children: [literal] } : literal
}

const isHtml = ({ type }: MdastNode) => type === "html"

/** A tight list item is served as bare text: the parser unwraps the paragraphs inside it,
 * and the source would then read its whitespace from the item, which collapses as soon as
 * it holds a fence, a table, a quote or a nested list. Marking the item spread keeps that
 * paragraph, and with it the line breaks — an item holding a block of source is a spread
 * item, and one holding nothing else reads the same either way. */
const spreadForBlockHtml = (node: MdastNode) => {
	if (node.type === "listItem" && node.children?.some(isHtml))
		node.spread = true
}

/** The parser skips raw HTML, so a bubble carrying nothing else renders empty and the
 * reader never learns why. Here HTML in a message is content being discussed, not markup
 * to run, so its source becomes text while the tree is still markdown: the reader gets
 * the characters that were written, and the browser gets a string — never a script, a
 * style or a request. Nothing turns HTML into nodes, and the allowlist downstream stands
 * unchanged, still with the last word on everything markdown itself produced. */
export const remarkLiteralHtml = () => (tree: MdastNode) => {
	const rewrite = (node: MdastNode) => {
		if (!node.children) return

		const holdsBlocks = BLOCK_PARENTS.has(node.type)

		spreadForBlockHtml(node)

		node.children = node.children.map((child) =>
			isHtml(child) ? literalOf(child.value ?? "", holdsBlocks) : child,
		)

		for (const child of node.children) rewrite(child)
	}

	rewrite(tree)
}
