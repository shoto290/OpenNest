import type { ComponentPropsWithoutRef } from "react"
import type { ExtraProps } from "react-markdown"

export type MarkdownLinkProps = ComponentPropsWithoutRef<"a"> & ExtraProps

/** Boundary for link cards: today it renders the anchor the parser produced. */
export const MarkdownLink = ({
	node,
	children,
	...props
}: MarkdownLinkProps) => <a {...props}>{children}</a>
