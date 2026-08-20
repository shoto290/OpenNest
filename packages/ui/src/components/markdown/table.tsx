"use client"

import type { ComponentPropsWithoutRef } from "react"
import { useTranslation } from "react-i18next"
import type { ExtraProps } from "react-markdown"

import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import { useCopyText } from "@workspace/ui/hooks/use-copy-text"
import { cn } from "@workspace/ui/lib/utils"

export type MarkdownTableProps = ComponentPropsWithoutRef<"table"> & ExtraProps

/** The slice of a hast node this reads. `@types/hast` is not a dependency here,
 * and the real `Element` is structurally assignable to this. */
interface TableNode {
	tagName?: string
	value?: string
	properties?: Record<string, unknown>
	children?: TableNode[]
}

/** An image carries no text node, so its alt is the only thing left to copy —
 * without it a picture cell would land in the spreadsheet as a hole. */
const textOf = (node: TableNode): string => {
	if (node.tagName === "img") return String(node.properties?.alt ?? "")

	return node.value ?? (node.children ?? []).map(textOf).join("")
}

const rowsOf = (node: TableNode): TableNode[] =>
	node.tagName === "tr" ? [node] : (node.children ?? []).flatMap(rowsOf)

const cellsOf = (row: TableNode) =>
	(row.children ?? []).filter(
		({ tagName }) => tagName === "th" || tagName === "td",
	)

const WHITESPACE_RUN = /\s+/g

/** Tab ends a field and newline ends a row, so whatever a cell holds has to be
 * flattened to single spaces first: one cell carrying a tab would otherwise open
 * a column the header never declared and shear every row below it. */
const fieldOf = (cell: TableNode) =>
	textOf(cell).replace(WHITESPACE_RUN, " ").trim()

/** A spreadsheet reads tab-separated rows as a grid, so the copy lands as a table
 * rather than as the pipes and dashes the author typed. */
const tableToTsv = (node?: TableNode) =>
	(node ? rowsOf(node) : [])
		.map((row) => cellsOf(row).map(fieldOf).join("\t"))
		.join("\n")

/** Rules and header fill derive from the foreground, never from a surface token:
 * the same table has to read on the page, on a muted bubble and on the solid
 * amber one, in both themes — the rule that already governs code chips.
 * `th` keeps `text-left` so an undeclared column stops centring the way the UA
 * stylesheet wants; the alignment GFM declares arrives as an inline style and
 * outranks it. */
const CELL_CLASS =
	"[&_td]:border-foreground/10 [&_td]:border-r [&_td]:border-b [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_th]:border-foreground/10 [&_th]:border-r [&_th]:border-b [&_th]:bg-foreground/5 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_tbody_tr:last-child>*]:border-b-0 [&_tr>*:last-child]:border-r-0"

/** `w-max` keeps every column at its natural width, so a wide table overflows the
 * viewport and scrolls instead of squeezing each cell into a column of wrapped
 * fragments. */
const TABLE_CLASS = `w-max border-collapse tabular-nums ${CELL_CLASS}`

/** `w-fit max-w-full` is what stops the bubble widening: the frame grows with the
 * table until the bubble runs out, then stops and lets the viewport scroll. */
const FRAME_CLASS = "group/markdown-table relative my-2 w-fit max-w-full"

/** The frame is a border rather than a ring so focus can recolour the edge and
 * add the halo at once — the pairing every other focusable surface here uses. */
const VIEWPORT_CLASS =
	"overflow-x-auto rounded-xl border border-foreground/15 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"

/** Faded until the table is hovered or holds focus, so it never sits on a header
 * cell while the reader is reading. It stays in the tab order throughout, and
 * focus reveals it — the viewport is a tab stop of its own, so tabbing to a table
 * lights its copy button before reaching it. No tooltip: the label would have to
 * come through a wrapper span, and that span is what the button would then
 * position against instead of the frame. */
const COPY_CLASS =
	"absolute top-1.5 right-1.5 bg-foreground/10 text-foreground opacity-0 hover:bg-foreground/20 focus-visible:opacity-100 group-focus-within/markdown-table:opacity-100 group-hover/markdown-table:opacity-100"

/** A GFM table in a chat bubble: framed so cells read as a grid, scrollable on its
 * own axis, and copyable into a spreadsheet. */
export const MarkdownTable = ({
	node,
	children,
	className,
	...props
}: MarkdownTableProps) => {
	const { t } = useTranslation("chat")
	const { copied, copy } = useCopyText(tableToTsv(node))

	return (
		<div data-slot="markdown-table" className={FRAME_CLASS}>
			<div
				// biome-ignore lint/a11y/noNoninteractiveTabindex: an overflowing table must be keyboard scrollable
				tabIndex={0}
				role="group"
				aria-label={t("table.label")}
				className={VIEWPORT_CLASS}
			>
				<table {...props} className={cn(TABLE_CLASS, className)}>
					{children}
				</table>
			</div>

			<Button
				aria-label={t("table.copy")}
				variant="ghost"
				size="icon-xs"
				className={COPY_CLASS}
				onClick={() => {
					void copy()
				}}
			>
				{copied ? <Icons.Check /> : <Icons.Copy />}
			</Button>

			<span aria-live="polite" className="sr-only">
				{copied ? t("table.copyAnnounced") : ""}
			</span>
		</div>
	)
}
