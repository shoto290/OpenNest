import { useId } from "react"
import ReactMarkdown from "react-markdown"
import rehypeSanitize from "rehype-sanitize"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"

import { MARKDOWN_COMPONENTS } from "@workspace/ui/components/markdown/components"
import {
	MARKDOWN_CODE_SURFACE_CLASS,
	MARKDOWN_PROSE_CLASS,
	MARKDOWN_WHITESPACE_CLASS,
} from "@workspace/ui/components/markdown/prose"
import { remarkLiteralHtml } from "@workspace/ui/components/markdown/raw-html"
import { MARKDOWN_SANITIZE_SCHEMA } from "@workspace/ui/components/markdown/sanitize"
import { rehypeScopeIds } from "@workspace/ui/components/markdown/scope-ids"
import { cn } from "@workspace/ui/lib/utils"

export interface MarkdownProps {
	/** One markdown block — a chat bubble carries exactly one. */
	children: string
	className?: string
}

/** The code surface deliberately overrides the prose fill, so the two are merged once. */
const MARKDOWN_CLASS = cn(
	MARKDOWN_PROSE_CLASS,
	MARKDOWN_CODE_SURFACE_CLASS,
	MARKDOWN_WHITESPACE_CLASS,
	"text-sm leading-6",
)

/** Raw HTML never becomes markup: the parser never turns it into nodes, `remarkLiteralHtml`
 * keeps its source as text so the reader can read what was written, and the allowlist filters
 * everything else — hostile markup degrades to characters, never to script. */
export const Markdown = ({ children, className }: MarkdownProps) => {
	const scope = useId()

	return (
		<div data-slot="markdown" className={cn(MARKDOWN_CLASS, className)}>
			<ReactMarkdown
				components={MARKDOWN_COMPONENTS}
				rehypePlugins={[
					[rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA],
					[rehypeScopeIds, { scope }],
				]}
				remarkPlugins={[remarkGfm, remarkMath, remarkLiteralHtml]}
			>
				{children}
			</ReactMarkdown>
		</div>
	)
}
