import type { ComponentPropsWithoutRef } from "react"
import type { ExtraProps } from "react-markdown"

export type MarkdownCodeProps = ComponentPropsWithoutRef<"code"> & ExtraProps
export type MarkdownPreProps = ComponentPropsWithoutRef<"pre"> & ExtraProps

/** Boundary for highlighted code: today it renders the code the parser produced. */
export const MarkdownCode = ({
	node,
	children,
	...props
}: MarkdownCodeProps) => <code {...props}>{children}</code>

/** Boundary for CodeBlock: a fence arrives here as `pre > code`. */
export const MarkdownPre = ({ node, children, ...props }: MarkdownPreProps) => (
	<pre {...props}>{children}</pre>
)
