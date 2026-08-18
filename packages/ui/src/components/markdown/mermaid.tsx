"use client"

import { useEffect, useRef, useState } from "react"

import type { DiagramScheme } from "@workspace/ui/lib/render-mermaid"

/** The fence label an author declares to get a diagram. */
export const MERMAID_LANGUAGE = "mermaid"

export interface MarkdownMermaidProps {
	/** The diagram source between the fence delimiters. */
	source: string
}

const SCHEME_PROPERTY = "--diagram-scheme"

const FRAME_CLASS = "my-2 w-fit max-w-full"

/** The frame the markdown table already uses: a hairline edge, and focus recolouring it
 * while the halo lands, so the one tab stop that scrolls the diagram stays visible. */
const VIEWPORT_CLASS =
	"overflow-x-auto rounded-xl border border-foreground/15 p-2 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"

/** Read from the host itself rather than from the document, so a diagram takes the
 * theme of the surface it sits on — two themes side by side each get their own. */
const schemeOf = (element: HTMLElement) =>
	getComputedStyle(element).getPropertyValue(SCHEME_PROPERTY).trim() === "dark"
		? "dark"
		: "light"

let drawn = 0

/** Mermaid drops whatever already carries the id it is about to draw, so a drawing that
 * reused its own id would delete the diagram on screen. Every drawing takes a fresh id,
 * which also keeps two diagrams on one page from erasing each other. */
const nextDiagramId = () => `mermaid-${++drawn}`

/** Mermaid ships the diagram with a stylesheet of its own — selectors it prefixes, and
 * keyframes it does not. Left in the document that is a `<style>` node loose in the page
 * and two animation names loose in the global namespace, so the diagram goes into a
 * shadow root instead: its CSS reaches this diagram and nothing else, while the tokens
 * and the type it inherits still cross the boundary. */
const showDiagram = (host: HTMLElement, svg: string) => {
	const root = host.shadowRoot ?? host.attachShadow({ mode: "open" })
	root.innerHTML = svg
}

/** Mermaid is fetched on mount, so a document without a diagram never loads it. The
 * source holds the block until the diagram replaces it, and a source mermaid cannot
 * parse leaves that same source on screen instead of throwing. Colours are baked into
 * the SVG, so the diagram is drawn again — and only then — when the theme under it
 * changes. A source that changes, or a block that goes away, drops the drawing it was
 * waiting on rather than paying for a diagram nobody will read. */
export const MarkdownMermaid = ({ source }: MarkdownMermaidProps) => {
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
				aria-label="Diagram"
				className={VIEWPORT_CLASS}
				hidden={!isDrawn}
				ref={host}
			/>
			{isDrawn ? null : <pre>{source}</pre>}
		</div>
	)
}
