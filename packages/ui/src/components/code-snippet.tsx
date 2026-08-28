"use client"

import { Fragment } from "react"

import { CodeLine } from "@workspace/ui/components/code-block"
import {
	type CodeLanguage,
	highlightCode,
	toCodeLines,
} from "@workspace/ui/lib/code-highlight"
import { cn } from "@workspace/ui/lib/utils"

export type CodeSnippetLanguage = CodeLanguage

export interface CodeSnippetProps {
	code: string
	language?: CodeSnippetLanguage
	className?: string
}

export function CodeSnippet({
	code,
	language = "bash",
	className,
}: CodeSnippetProps) {
	const lines = toCodeLines(code, highlightCode(code, language))

	return (
		<pre
			className={cn(
				"m-0 overflow-x-auto whitespace-pre font-mono text-foreground/85 text-xs leading-5",
				className,
			)}
		>
			<code>
				{lines.map((line, index) => (
					<Fragment key={line.offset}>
						<CodeLine content={line.content} tokens={line.tokens} />
						{index < lines.length - 1 ? "\n" : null}
					</Fragment>
				))}
			</code>
		</pre>
	)
}
