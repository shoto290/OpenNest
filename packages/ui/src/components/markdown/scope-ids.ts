interface HastNode {
	type: string
	properties?: Record<string, unknown>
	children?: HastNode[]
}

export interface ScopeIdsOptions {
	scope: string
}

const eachNode = (node: HastNode, visit: (node: HastNode) => void) => {
	visit(node)
	for (const child of node.children ?? []) eachNode(child, visit)
}

const scopedId = (value: string, ids: Set<string>, scope: string) =>
	ids.has(value) ? `${scope}-${value}` : value

/** Aria references arrive as one string or as a list of tokens. */
const scopedReference = (value: unknown, ids: Set<string>, scope: string) => {
	if (typeof value === "string") return scopedId(value, ids, scope)

	if (Array.isArray(value)) {
		return value.map((token) =>
			typeof token === "string" ? scopedId(token, ids, scope) : token,
		)
	}

	return value
}

/** Footnote ids are fixed strings, so two blocks on one page would collide and every
 * reference would jump to the first block. Scoping ids per instance — and the
 * references that point at them — keeps each block self-contained. */
export const rehypeScopeIds =
	({ scope }: ScopeIdsOptions) =>
	(tree: HastNode) => {
		const ids = new Set<string>()

		eachNode(tree, ({ properties }) => {
			if (typeof properties?.id === "string") ids.add(properties.id)
		})

		if (ids.size === 0) return

		eachNode(tree, ({ properties }) => {
			if (!properties) return

			const { ariaDescribedBy, href, id } = properties

			if (ariaDescribedBy !== undefined) {
				properties.ariaDescribedBy = scopedReference(
					ariaDescribedBy,
					ids,
					scope,
				)
			}

			if (typeof href === "string" && href.startsWith("#")) {
				properties.href = `#${scopedId(href.slice(1), ids, scope)}`
			}

			if (typeof id === "string") properties.id = `${scope}-${id}`
		})
	}
