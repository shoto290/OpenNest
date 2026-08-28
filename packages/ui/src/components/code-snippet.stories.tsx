import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	CodeSnippet,
	type CodeSnippetLanguage,
} from "@workspace/ui/components/code-snippet"
import { CODE_LANGUAGES } from "@workspace/ui/lib/code-highlight"

const BASH = `bun run nest:sync --workspace packages/ui
bun run types`

const SAMPLES: Record<CodeSnippetLanguage, string> = {
	bash: BASH,
	css: `.nest-card {\n  border-radius: var(--radius-lg);\n}`,
	diff: `- padding: 12px;\n+ padding: var(--spacing-3);`,
	html: `<section class="nest-card">\n  <h2>Nest</h2>\n</section>`,
	json: `{ "nest": "opennest", "tint": "sky" }`,
	markdown: `## Nest\n\nEvery visual belongs to the package.`,
	python: `def nest_tint(name: str) -> str:\n    return TINTS[name]`,
	rust: `fn nest_tint(name: &str) -> Option<&Tint> {\n    TINTS.get(name)\n}`,
	text: `Nest synced. 2 files written, 0 skipped.`,
	tsx: `const NestCard = () => <article className="nest-card" />`,
	typescript: `export const nestTint = (name: TintName) => TINTS[name]`,
	yaml: `nest:\n  tint: sky\n  animals: 12`,
}

const A11Y_SCROLL_FOCUS_AWAITING_DESIGN_DECISION = {
	config: {
		rules: [{ id: "scrollable-region-focusable", reviewOnFail: true }],
	},
}

const LONG_LINE =
	"bun run nest:sync --workspace packages/ui --tint sky --animals owl,cat,fox --out packages/ui/src/components/nest/generated/nest-manifest.ts --verbose"

const meta = preview.meta({
	title: "AI/CodeSnippet",
	component: CodeSnippet,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"Highlighted code with nothing around it — no frame, no header, no copy button. It is the body an agent surface drops into a row it already owns, which is why it carries no background of its own and inherits the tone it lands on. Highlighting is synchronous and cached, so a streamed line paints in the same frame it arrives. Reach for `CodeBlock` when the code is a block a reader acts on; reach for this when it is one detail inside a trace.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="w-full max-w-xl rounded-xl border p-3">
				<Story />
			</div>
		),
	],
	args: { code: BASH },
	argTypes: {
		language: { control: "select", options: [...CODE_LANGUAGES] },
	},
})

export const Playground = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Knob story for the two props that matter. `language` defaults to `bash`, the one an agent writes most, and an unknown value falls back to plain text rather than throwing. Check that the same snippet keeps its shape when the language changes — only the token colours move.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText(/nest:sync/)).toBeVisible()
	},
})

export const Languages = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Every grammar the highlighter ships, one snippet each. Reach for it when adding a language or retuning the theme: both themes are the high-contrast pair, so a token that reads in light must still read in dark. Check the row of them side by side with the theme toolbar rather than one at a time.",
			},
		},
	},
	render: () => (
		<div className="flex flex-col gap-4">
			{CODE_LANGUAGES.map((language) => (
				<div className="flex flex-col gap-1" key={language}>
					<span className="font-medium text-muted-foreground text-xs">
						{language}
					</span>
					<CodeSnippet code={SAMPLES[language]} language={language} />
				</div>
			))}
		</div>
	),
	play: async ({ canvasElement }) => {
		await expect(canvasElement.querySelectorAll("pre")).toHaveLength(
			CODE_LANGUAGES.length,
		)
	},
})

export const SingleLine = meta.story({
	args: { code: "bun run storybook", language: "bash" },
	parameters: {
		docs: {
			description: {
				story:
					"The common case inside a trace: one command, one line. Check that a single line adds no trailing newline and that the block takes exactly the height of its text, so a row built around it needs no compensating margin.",
			},
		},
	},
})

export const Overflow = meta.story({
	args: { code: LONG_LINE },
	parameters: {
		a11y: A11Y_SCROLL_FOCUS_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A command too long for its column. The block scrolls sideways rather than wrapping, because a wrapped command is a command a reader can no longer copy correctly. Check that the surrounding surface keeps its width rather than growing with the text. The scrolling region takes no focus of its own, so the tail of the command is out of a keyboard's reach — flagged here for review rather than patched around in a story.",
			},
		},
	},
})

export const Empty = meta.story({
	args: { code: "" },
	parameters: {
		docs: {
			description: {
				story:
					"Nothing to show yet — the first frame of a streamed command. It renders an empty line rather than collapsing to zero height, so the row it sits in is already the size it will be once the text lands. Check that no highlighting error escapes an empty string.",
			},
		},
	},
})
