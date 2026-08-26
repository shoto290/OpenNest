interface MdastNode {
	type: string
	value?: string
	children?: MdastNode[]
	data?: { hName?: string; hProperties?: Record<string, unknown> }
}

const MENTION = /<@([\w-]+)>/g

const BOT_MENTION_ATTRIBUTE = "data-bot-mention"

const mentionOf = (id: string): MdastNode => ({
	type: "botMention",
	data: { hName: "span", hProperties: { [BOT_MENTION_ATTRIBUTE]: id } },
	children: [],
})

const textOf = (value: string): MdastNode => ({ type: "text", value })

const splitMentions = (value: string) => {
	const parts: MdastNode[] = []
	let read = 0

	for (const match of value.matchAll(MENTION)) {
		const at = match.index ?? 0
		if (at > read) parts.push(textOf(value.slice(read, at)))
		parts.push(mentionOf(match[1]))
		read = at + match[0].length
	}

	if (parts.length === 0) return null
	if (read < value.length) parts.push(textOf(value.slice(read)))

	return parts
}

const isText = ({ type, value }: MdastNode) =>
	type === "text" && typeof value === "string"

export const remarkBotMentions = () => (tree: MdastNode) => {
	const rewrite = (node: MdastNode) => {
		if (!node.children) return

		node.children = node.children.flatMap((child) =>
			isText(child) ? (splitMentions(child.value ?? "") ?? child) : child,
		)

		for (const child of node.children) rewrite(child)
	}

	rewrite(tree)
}

export { BOT_MENTION_ATTRIBUTE }
