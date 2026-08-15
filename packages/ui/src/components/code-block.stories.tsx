import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { CodeBlock } from "@workspace/ui/components/code-block"
import {
	CODE_LANGUAGES,
	type CodeLanguage,
} from "@workspace/ui/lib/code-highlight"

const TYPESCRIPT_SNIPPET = `import { readNest } from "@opennest/core"

export interface NestSummary {
	id: string
	occupants: number
}

export async function summarise(id: string): Promise<NestSummary> {
	const nest = await readNest(id)
	return { id: nest.id, occupants: nest.occupants.length }
}`

const STREAMING_SNIPPET = `export async function summarise(id: string) {
	const nest = await readNest(id)
	return { id: nest.id, occup`

const LONG_LINE_SNIPPET = `const migration = { table: "nest_occupants", columns: ["id", "nest_id", "display_name", "joined_at", "left_at", "role", "invited_by", "notes"], indexes: ["nest_id_joined_at", "display_name_trgm"] }

export const plan = Object.entries(migration).map(([key, value]) => \`\${key}: \${Array.isArray(value) ? value.join(", ") : value}\`).join("\\n")`

const LANGUAGE_SAMPLES: Record<CodeLanguage, string> = {
	bash: `bun install\nbun run storybook --port 6006`,
	diff: `- const occupants = nest.occupants\n+ const occupants = nest.occupants ?? []`,
	json: `{\n\t"id": "nest_42",\n\t"occupants": 3,\n\t"archived": false\n}`,
	text: `Nest 42 is missing two occupants.\nRe-run the sync before archiving it.`,
	tsx: `export const NestBadge = ({ label }: { label: string }) => (\n\t<span className="rounded-full px-2">{label}</span>\n)`,
	typescript: `export const nestId = "nest_42" as const\nexport type NestId = typeof nestId`,
}

const meta = preview.meta({
	title: "AI/CodeBlock",
	component: CodeBlock,
	parameters: {
		docs: {
			description: {
				component:
					"Renders the code an agent writes inside a response, streamed or finished. Highlighting is synchronous and bundled — no grammar is fetched at runtime, so the same code always paints the same tokens. Reach for it whenever a message carries a file, a patch or a command; prose stays in the message body.",
			},
		},
	},
	args: {
		code: TYPESCRIPT_SNIPPET,
		language: "typescript",
	},
	argTypes: {
		language: { control: "select", options: [...CODE_LANGUAGES, "python"] },
		status: { control: "inline-radio", options: ["streaming", "complete"] },
		showLineNumbers: { control: "boolean" },
		wrap: { control: "boolean" },
		copyable: { control: "boolean" },
		maxHeight: { control: { type: "number", min: 80, step: 20 } },
	},
	decorators: [
		(Story) => <div className="w-[44rem] max-w-full">{Story()}</div>,
	],
})

export const Playground = meta.story({
	args: { onCopy: fn() },
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The finished snippet an agent hands back once it stopped writing: `status` is complete, the header reads Ready. Check that every line is numbered and that the tokens are coloured in both themes — flip the theme layout toolbar to side-by-side. Pick `Streaming` instead for the half-written state.",
			},
		},
	},
})

export const Streaming = meta.story({
	args: { code: STREAMING_SNIPPET, status: "streaming" },
	parameters: {
		docs: {
			description: {
				story:
					"The model is still emitting the file: the last line stops mid-identifier and the trailing braces are missing. Check that the truncated line still highlights instead of falling back to grey, that the header spinner replaces the Ready check, and that the block carries `aria-busy`. `Default` covers the same snippet once complete.",
			},
		},
	},
})

export const WithFilename = meta.story({
	args: { filename: "packages/core/src/nest/summarise.ts" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the code belongs to a file the agent is about to write: the path replaces the anonymous header and becomes the accessible name of the scroll region. Check that a long path truncates instead of pushing the copy button out of the header.",
			},
		},
	},
})

export const Languages = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Every grammar bundled today, one block each. Check that each sample is actually tokenised — `text` is the deliberate exception and stays monochrome. A language added to `CODE_LANGUAGES` without a sample here is a type error, so this matrix cannot drift.",
			},
		},
	},
	render: (args) => (
		<div className="flex flex-col gap-4">
			{CODE_LANGUAGES.map((language) => (
				<CodeBlock
					{...args}
					key={language}
					code={LANGUAGE_SAMPLES[language]}
					language={language}
					showLineNumbers={false}
				/>
			))}
		</div>
	),
})

export const UnknownLanguage = meta.story({
	args: {
		language: "python",
		code: `def summarise(nest_id: str) -> dict:\n\tnest = read_nest(nest_id)\n\treturn {"id": nest.id, "occupants": len(nest.occupants)}`,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A model streamed a fence for a grammar we do not bundle. Check that the block still renders the code verbatim as plain text and keeps advertising the requested language in the header, instead of throwing on the missing grammar. Anything outside `Languages` lands here.",
			},
		},
	},
})

export const LongContent = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Lines far wider than the container, shown scrolled then wrapped. Check that the first block scrolls horizontally without stretching the message column and that its viewport is reachable with the keyboard, and that the second one wraps without breaking the line-number gutter. Vertical overflow is capped by `maxHeight` in both.",
			},
		},
	},
	render: (args) => (
		<div className="flex flex-col gap-4">
			<CodeBlock {...args} code={LONG_LINE_SNIPPET} maxHeight={140} />
			<CodeBlock {...args} code={LONG_LINE_SNIPPET} maxHeight={140} wrap />
		</div>
	),
})

export const Copy = meta.story({
	args: { onCopy: fn(), filename: "packages/core/src/nest/summarise.ts" },
	parameters: {
		docs: {
			description: {
				story:
					"The copy affordance, driven through a stubbed `onCopy` so the story never touches the real clipboard. Check that the button is reachable by keyboard, that the icon swaps to a check, and that the result is announced in the polite live region rather than by the icon alone. A rejected copy announces the failure through the same region.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const copy = canvas.getByRole("button", { name: "Copy code" })

		await userEvent.click(copy)

		await expect(args.onCopy).toHaveBeenCalledTimes(1)
		await expect(
			await canvas.findByText("Code copied to clipboard"),
		).toBeInTheDocument()
	},
})
