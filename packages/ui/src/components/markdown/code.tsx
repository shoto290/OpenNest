"use client"

import {
	type ComponentPropsWithoutRef,
	Fragment,
	useDeferredValue,
	useMemo,
	useState,
} from "react"
import type { ExtraProps } from "react-markdown"

import { Button } from "@workspace/ui/components/button"
import { CodeLine } from "@workspace/ui/components/code-block"
import { Icons } from "@workspace/ui/components/icons"
import {
	MarkdownMath,
	MATH_LANGUAGE,
} from "@workspace/ui/components/markdown/math"
import {
	MarkdownMermaid,
	MERMAID_LANGUAGE,
} from "@workspace/ui/components/markdown/mermaid"
import { useCopyText } from "@workspace/ui/hooks/use-copy-text"
import { highlightCode, toCodeLines } from "@workspace/ui/lib/code-highlight"

export type MarkdownCodeProps = ComponentPropsWithoutRef<"code"> & ExtraProps
export type MarkdownPreProps = ComponentPropsWithoutRef<"pre"> & ExtraProps

interface MarkdownFenceProps {
	code: string
	/** Free-form: the fence label the author typed, unknown values render as plain text. */
	language?: string
}

type FenceNode = NonNullable<ExtraProps["node"]>
type FenceChild = FenceNode["children"][number]
type FenceElement = Extract<FenceChild, { tagName: string }>

const LANGUAGE_PREFIX = "language-"

/** Past this a fence takes long enough to tokenise that the first frame would wait on it. */
const HIGHLIGHT_BUDGET_LINES = 200

const isCodeElement = (child: FenceChild): child is FenceElement =>
	child.type === "element" && child.tagName === "code"

const codeChildOf = (node?: FenceNode) => node?.children.find(isCodeElement)

/** What sits between the fence delimiters, byte for byte: the one newline the parser
 * appends when it builds the element is not part of what the author wrote. */
const sourceOf = (node: FenceElement) =>
	node.children
		.map((child) => (child.type === "text" ? child.value : ""))
		.join("")
		.replace(/\n$/, "")

const nameOf = (language?: string) => {
	const named = language?.trim()
	return named ? `Code snippet, ${named}` : "Code snippet"
}

const languageOf = (node: FenceElement) => {
	const names = node.properties?.className
	if (!Array.isArray(names)) return undefined

	return names
		.filter((name): name is string => typeof name === "string")
		.find((name) => name.startsWith(LANGUAGE_PREFIX))
		?.slice(LANGUAGE_PREFIX.length)
}

const fitsInOneFrame = (code: string) =>
	code.split("\n", HIGHLIGHT_BUDGET_LINES + 1).length <= HIGHLIGHT_BUDGET_LINES

/** Inline code: the parser output is already the markup this renderer wants, except for
 * the one label `remark-math` writes — an expression is typeset, not quoted. */
export const MarkdownCode = ({
	node,
	children,
	...props
}: MarkdownCodeProps) => {
	if (node && languageOf(node) === MATH_LANGUAGE) {
		return <MarkdownMath source={sourceOf(node)} />
	}

	return <code {...props}>{children}</code>
}

/** The surface, radius and scroll come from the prose class the renderer owns, so a
 * fence keeps reading like markdown on every bubble variant; the tokens and the copy
 * control are what this adds. The viewport stops short of that control rather than
 * running under it, so no line hides behind the button at any scroll position, and a
 * fence past the budget paints its source first and takes its colours a frame later. */
const MarkdownFence = ({ code, language }: MarkdownFenceProps) => {
	const { copied, copy } = useCopyText(code)
	const [firstPaint] = useState(() => (fitsInOneFrame(code) ? code : ""))
	const painted = useDeferredValue(code, firstPaint)

	const lines = useMemo(() => {
		const tokens = painted === code ? highlightCode(code, language) : undefined
		return toCodeLines(code, tokens)
	}, [code, language, painted])

	return (
		<div data-slot="markdown-fence" className="relative my-2">
			<pre className="whitespace-pre">
				<span
					// biome-ignore lint/a11y/noNoninteractiveTabindex: an overflowing fence must be keyboard scrollable
					tabIndex={0}
					role="group"
					aria-label={nameOf(language)}
					className="mr-8 block overflow-x-auto outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
				>
					<code>
						{lines.map((line, index) => (
							<Fragment key={line.offset}>
								<CodeLine content={line.content} tokens={line.tokens} />
								{index < lines.length - 1 ? "\n" : null}
							</Fragment>
						))}
					</code>
				</span>
			</pre>
			<span className="absolute top-2 right-2">
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label={copied ? "Copied" : "Copy code"}
					tooltip={copied ? "Copied" : "Copy"}
					onClick={() => {
						void copy()
					}}
				>
					{copied ? <Icons.Check /> : <Icons.Copy />}
				</Button>
			</span>
		</div>
	)
}

/** A fence arrives as `pre > code`, so the source text and its label are read from the
 * node rather than from rendered children — a token tree cannot be copied back to text.
 * Two labels are not code at all: `math` is what a `$$` block becomes, and `mermaid` is
 * a drawing an author asked for; both take their own renderer and neither is painted. */
export const MarkdownPre = ({ node, children, ...props }: MarkdownPreProps) => {
	const code = codeChildOf(node)
	if (!code) return <pre {...props}>{children}</pre>

	const source = sourceOf(code)
	const language = languageOf(code)

	if (language === MATH_LANGUAGE) return <MarkdownMath display source={source} />
	if (language === MERMAID_LANGUAGE) return <MarkdownMermaid source={source} />

	return <MarkdownFence code={source} language={language} />
}
