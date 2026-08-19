import { expect, spyOn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	elementNode,
	MarkdownProse,
	textNode,
} from "@workspace/storybook/story-utils"
import { MarkdownTable } from "@workspace/ui/components/markdown/table"

interface TableFixture {
	headers: string[]
	rows: string[][]
}

const NEST_TABLE: TableFixture = {
	headers: ["nest", "occupants", "status", "archived"],
	rows: [
		["nest_42", "3", "active", "no"],
		["nest_43", "0", "empty", "yes"],
		["nest_44", "12", "active", "no"],
	],
}

const WIDE_TABLE: TableFixture = {
	headers: [
		"nest",
		"occupants",
		"joined",
		"left",
		"role",
		"invited by",
		"last sync",
		"note",
	],
	rows: [
		[
			"nest_42",
			"3",
			"2026-01-04",
			"—",
			"resident",
			"nest_01",
			"2026-08-18 09:12",
			"rejoined after the archive pass",
		],
		[
			"nest_43",
			"0",
			"2025-11-27",
			"2026-02-02",
			"visitor",
			"nest_42",
			"2026-08-18 09:12",
			"last occupant left before the sync",
		],
	],
}

const HEADER_ONLY_TABLE: TableFixture = {
	headers: NEST_TABLE.headers,
	rows: [],
}

const rowNode = (tagName: string, cells: string[]) =>
	elementNode(
		"tr",
		cells.map((cell) => elementNode(tagName, [textNode(cell)])),
	)

const tableNode = ({ headers, rows }: TableFixture) =>
	elementNode("table", [
		elementNode("thead", [rowNode("th", headers)]),
		elementNode(
			"tbody",
			rows.map((row) => rowNode("td", row)),
		),
	])

const tsvOf = ({ headers, rows }: TableFixture) =>
	[headers, ...rows].map((cells) => cells.join("\t")).join("\n")

const renderTable = (fixture: TableFixture) => (
	<MarkdownTable node={tableNode(fixture)}>
		<thead>
			<tr>
				{fixture.headers.map((header) => (
					<th key={header} scope="col">
						{header}
					</th>
				))}
			</tr>
		</thead>
		<tbody>
			{fixture.rows.map((row) => (
				<tr key={row[0]}>
					{row.map((cell, column) => (
						<td key={fixture.headers[column]}>{cell}</td>
					))}
				</tr>
			))}
		</tbody>
	</MarkdownTable>
)

const meta = preview.meta({
	title: "AI/MarkdownTable",
	component: MarkdownTable,
	parameters: {
		docs: {
			description: {
				component:
					"A GFM table as it lands in a transcript: framed so the cells read as a grid, scrollable on its own axis, and copyable into a spreadsheet. Rules and header fill derive from the foreground rather than from a surface token, so the same table reads on the page, on a muted bubble and on a solid one, in both themes. The copy control writes tab-separated rows read from the hast node — whatever a cell holds is flattened to single spaces first, because one tab inside a cell would open a column the header never declared. The viewport is a tab stop of its own, so a keyboard can scroll a wide table, and reaching it reveals the copy control before focus lands on it.",
			},
		},
	},
	decorators: [(Story) => <MarkdownProse>{Story()}</MarkdownProse>],
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Four declared columns, three rows. Check that the frame hugs the table instead of stretching to the block width, that the copy control stays faded until the table is hovered or holds focus, and that the header fill and the rules read in both themes — flip the theme layout toolbar to side-by-side.",
			},
		},
	},
	render: () => renderTable(NEST_TABLE),
	play: async ({ canvas, userEvent }) => {
		const writeText = spyOn(
			navigator.clipboard,
			"writeText",
		).mockResolvedValue()

		await userEvent.click(canvas.getByRole("button", { name: "Copy table" }))

		await expect(writeText).toHaveBeenCalledWith(tsvOf(NEST_TABLE))
		await expect(
			await canvas.findByText("Table copied to clipboard"),
		).toBeInTheDocument()

		writeText.mockRestore()
	},
})

export const WiderThanTheBlock = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Eight columns, one of them holding a sentence. Every column keeps its natural width, so the table overflows and the viewport scrolls rather than squeezing each cell into a column of wrapped fragments. Check that the block does not widen, that the copy control stays pinned to the frame while the rows scroll under it, and that tabbing reaches the viewport before the control.",
			},
		},
	},
	render: () => renderTable(WIDE_TABLE),
	play: async ({ canvas }) => {
		const viewport = canvas.getByRole("group", { name: "Table" })

		await expect(viewport.scrollWidth).toBeGreaterThan(viewport.clientWidth)
	},
})

export const HeaderOnly = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The columns are declared and no row followed — a table cut mid-stream, or a query that matched nothing. The frame and the header still read as a table rather than collapsing to a stray line, and the copy hands back the header row alone. Check that the header keeps its bottom rule with no body under it.",
			},
		},
	},
	render: () => renderTable(HEADER_ONLY_TABLE),
	play: async ({ canvas, userEvent }) => {
		const writeText = spyOn(
			navigator.clipboard,
			"writeText",
		).mockResolvedValue()

		await expect(canvas.getAllByRole("columnheader")).toHaveLength(4)
		await expect(canvas.queryAllByRole("cell")).toHaveLength(0)

		await userEvent.click(canvas.getByRole("button", { name: "Copy table" }))
		await expect(writeText).toHaveBeenCalledWith(tsvOf(HEADER_ONLY_TABLE))

		writeText.mockRestore()
	},
})
