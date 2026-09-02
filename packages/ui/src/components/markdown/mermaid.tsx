"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { MARKDOWN_ESCAPED_BLOCK_CLASS } from "@workspace/ui/components/markdown/prose"
import { schemeOf } from "@workspace/ui/hooks/use-color-scheme"
import type { DiagramScheme } from "@workspace/ui/lib/render-mermaid"

export const MERMAID_LANGUAGE = "mermaid"

export interface MarkdownMermaidProps {
	source: string
}

const FRAME_CLASS = `${MARKDOWN_ESCAPED_BLOCK_CLASS} my-2 w-fit max-w-full`

const VIEWPORT_CLASS =
	"overflow-x-auto rounded-xl border border-foreground/15 p-2 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"

let drawn = 0

const nextDiagramId = () => `mermaid-${++drawn}`

const showDiagram = (host: HTMLElement, svg: string) => {
	const root = host.shadowRoot ?? host.attachShadow({ mode: "open" })
	root.innerHTML = svg
}

export const MarkdownMermaid = ({ source }: MarkdownMermaidProps) => {
	const { t } = useTranslation("chat")
	const host = useRef<HTMLDivElement>(null)
	const [isDrawn, setIsDrawn] = useState(false)

	useEffect(() => {
		const dropped = new AbortController()
		let painted: DiagramScheme | undefined

		const paint = async () => {
			const element = host.current
			if (!element) return

			const scheme = schemeOf(element)
			if (scheme === painted) return
			painted = scheme

			const { renderMermaid } = await import("@workspace/ui/lib/render-mermaid")
			const diagram = await renderMermaid({
				id: nextDiagramId(),
				scheme,
				signal: dropped.signal,
				source,
			})

			if (dropped.signal.aborted) return

			showDiagram(element, diagram)
			setIsDrawn(diagram !== "")
		}

		void paint()

		const observer = new MutationObserver(() => {
			void paint()
		})
		for (const target of [document.documentElement, document.body]) {
			observer.observe(target, { attributeFilter: ["class"], attributes: true })
		}

		return () => {
			dropped.abort()
			observer.disconnect()
		}
	}, [source])

	return (
		<div data-slot="markdown-mermaid" className={FRAME_CLASS}>
			<div
				// biome-ignore lint/a11y/noNoninteractiveTabindex: an overflowing diagram must be keyboard scrollable
				tabIndex={0}
				role="group"
				aria-label={t("diagram.label")}
				className={VIEWPORT_CLASS}
				hidden={!isDrawn}
				ref={host}
			/>
			{isDrawn ? null : <pre>{source}</pre>}
		</div>
	)
}
