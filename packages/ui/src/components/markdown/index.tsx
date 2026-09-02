import { useId } from "react"
import ReactMarkdown from "react-markdown"
import rehypeSanitize from "rehype-sanitize"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"

import { remarkBotMentions } from "@workspace/ui/components/markdown/bot-mentions"
import { MARKDOWN_COMPONENTS } from "@workspace/ui/components/markdown/components"
import {
	MARKDOWN_CODE_SURFACE_CLASS,
	MARKDOWN_TYPESET_CLASS,
	MARKDOWN_WHITESPACE_CLASS,
} from "@workspace/ui/components/markdown/prose"
import { remarkLiteralHtml } from "@workspace/ui/components/markdown/raw-html"
import { MARKDOWN_SANITIZE_SCHEMA } from "@workspace/ui/components/markdown/sanitize"
import { rehypeScopeIds } from "@workspace/ui/components/markdown/scope-ids"
import { cn } from "@workspace/ui/lib/utils"

export interface MarkdownProps {
	children: string
	className?: string
}

const MARKDOWN_REMARK_PLUGINS = [
	remarkGfm,
	remarkMath,
	remarkLiteralHtml,
	remarkBotMentions,
]

const MARKDOWN_CLASS = cn(
	MARKDOWN_TYPESET_CLASS,
	MARKDOWN_CODE_SURFACE_CLASS,
	MARKDOWN_WHITESPACE_CLASS,
	"text-sm leading-6",
)

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
				remarkPlugins={MARKDOWN_REMARK_PLUGINS}
			>
				{children}
			</ReactMarkdown>
		</div>
	)
}
