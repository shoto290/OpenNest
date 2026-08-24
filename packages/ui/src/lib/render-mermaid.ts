import mermaid from "mermaid"

export type DiagramScheme = "light" | "dark"

export interface RenderMermaidOptions {
	id: string
	source: string
	scheme: DiagramScheme
	signal?: AbortSignal
}

const MERMAID_THEMES = { light: "neutral", dark: "dark" } as const

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

export const renderMermaid = (options: RenderMermaidOptions) => {
	const changesTheme = options.scheme !== claimed
	claimed = options.scheme

	const drawn = changesTheme ? drawing.then(() => draw(options)) : draw(options)
	drawing = Promise.all([drawing, drawn])

	return drawn
}
