import type { ComponentPropsWithoutRef } from "react"
import type { ExtraProps } from "react-markdown"

export type MarkdownTableProps = ComponentPropsWithoutRef<"table"> & ExtraProps

/** Boundary for styled tables: today it renders the table the parser produced. */
export const MarkdownTable = ({
	node,
	children,
	...props
}: MarkdownTableProps) => <table {...props}>{children}</table>
