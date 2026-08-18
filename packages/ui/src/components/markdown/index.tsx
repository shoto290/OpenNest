import { useId } from "react"
import ReactMarkdown from "react-markdown"
import rehypeSanitize from "rehype-sanitize"
import remarkGfm from "remark-gfm"

import { MARKDOWN_COMPONENTS } from "@workspace/ui/components/markdown/components"
import {
	MARKDOWN_CODE_SURFACE_CLASS,
	MARKDOWN_PROSE_CLASS,
	MARKDOWN_WHITESPACE_CLASS,
} from "@workspace/ui/components/markdown/prose"
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

/** Raw HTML never reaches the tree: the parser skips it and the allowlist filters
 * whatever a plugin adds, so hostile markup degrades to nothing, never to script. */
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
				remarkPlugins={[remarkGfm]}
			>
				{children}
			</ReactMarkdown>
		</div>
	)
}
