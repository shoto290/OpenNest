"use client"

import { type ComponentPropsWithoutRef, useEffect, useState } from "react"

export const MATH_LANGUAGE = "math"

export interface MarkdownMathProps {
	source: string
	display?: boolean
}

type MathContent = Pick<
	ComponentPropsWithoutRef<"div">,
	"children" | "dangerouslySetInnerHTML"
>

const DISPLAY_CLASS = "my-3 overflow-x-auto"

const contentOf = (html: string, source: string): MathContent =>
	html ? { dangerouslySetInnerHTML: { __html: html } } : { children: source }

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
