import mermaid from "mermaid"

export type DiagramScheme = "light" | "dark"

export interface RenderMermaidOptions {
	id: string
	source: string
	scheme: DiagramScheme
	signal?: AbortSignal
}

const MERMAID_THEMES = { light: "neutral", dark: "dark" } as const

/** `useMaxWidth: false` keeps a diagram at its natural width, so the frame around it
 * scrolls instead of scaling every label down to the container. Errors are suppressed
 * because this module reports a failure by returning nothing: the caller keeps the
 * source on screen rather than showing mermaid's own error graphic. */
const configure = (scheme: DiagramScheme) => {
	mermaid.initialize({
		flowchart: { useMaxWidth: false },
		securityLevel: "strict",
		sequence: { useMaxWidth: false },
		startOnLoad: false,
		suppressErrorRendering: true,
		theme: MERMAID_THEMES[scheme],
	})
}

/** A drawing dropped before it starts costs nothing, and one dropped while it runs is
 * thrown away rather than handed back to a caller that has moved on. */
const draw = async ({ id, scheme, signal, source }: RenderMermaidOptions) => {
	if (signal?.aborted) return ""

	try {
		configure(scheme)
		const { svg } = await mermaid.render(id, source)
		return signal?.aborted ? "" : svg
	} catch {
		return ""
	}
}

let claimed: DiagramScheme | undefined
let drawing: Promise<unknown> = Promise.resolve()

/** Reached by dynamic import alone: mermaid stays off the module graph until a document
 * declares a diagram. The theme lives in mermaid's own module state, so a diagram that
 * needs it changed waits for every diagram already drawing — and for nothing else. One
 * that takes the theme already claimed starts at once, so two bubbles never queue behind
 * each other for a change neither of them asked for. */
export const renderMermaid = (options: RenderMermaidOptions) => {
	const changesTheme = options.scheme !== claimed
	claimed = options.scheme

	const drawn = changesTheme ? drawing.then(() => draw(options)) : draw(options)
	drawing = Promise.all([drawing, drawn])

	return drawn
}
