"use client"

import { type ComponentPropsWithoutRef, useEffect, useState } from "react"

/** The fence label and the inline class `remark-math` writes for both math nodes. */
export const MATH_LANGUAGE = "math"

export interface MarkdownMathProps {
	/** The expression between the delimiters, as the author typed it. */
	source: string
	display?: boolean
}

type MathContent = Pick<
	ComponentPropsWithoutRef<"div">,
	"children" | "dangerouslySetInnerHTML"
>

/** KaTeX centres a display expression itself, so nothing is centred here: the source
 * text shown in its place reads from the left like the prose around it. */
const DISPLAY_CLASS = "my-3 overflow-x-auto"

/** KaTeX output is generated from escaped source, never from author markup. */
const contentOf = (html: string, source: string): MathContent =>
	html ? { dangerouslySetInnerHTML: { __html: html } } : { children: source }

/** The typesetter is fetched on mount, so a document without math never loads it. Until
 * it lands the expression stands as the text the author typed, in the box the typeset
 * version takes, so the block around it holds its place. That same text is what KaTeX
 * leaves behind for a source it cannot parse — flagged in the destructive tone, never
 * thrown — and for one that would cost more than an expression may. A source that
 * changes, or a block that goes away, is never typeset at all: the work is dropped
 * where it waits rather than after it is paid for. */
export const MarkdownMath = ({
	display = false,
	source,
}: MarkdownMathProps) => {
	const [html, setHtml] = useState("")

	useEffect(() => {
		let wanted = true

		void import("@workspace/ui/lib/typeset-math").then(({ typesetMath }) => {
			if (wanted) setHtml(typesetMath({ display, source }))
		})

		return () => {
			wanted = false
		}
	}, [display, source])

	const content = contentOf(html, source)

	if (display) {
		return (
			<div data-slot="markdown-math" className={DISPLAY_CLASS} {...content} />
		)
	}

	return <span data-slot="markdown-math" {...content} />
}
