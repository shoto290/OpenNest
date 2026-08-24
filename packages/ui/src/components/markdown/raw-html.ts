interface MdastNode {
	type: string
	value?: string
	spread?: boolean
	children?: MdastNode[]
}

const BLOCK_PARENTS = new Set([
	"blockquote",
	"footnoteDefinition",
	"listItem",
	"root",
])

const literalOf = (value: string, holdsBlocks: boolean): MdastNode => {
	const literal: MdastNode = { type: "literalHtml", value }

	return holdsBlocks ? { type: "paragraph", children: [literal] } : literal
}

const isHtml = ({ type }: MdastNode) => type === "html"

const spreadForBlockHtml = (node: MdastNode) => {
	if (node.type === "listItem" && node.children?.some(isHtml))
		node.spread = true
}

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
