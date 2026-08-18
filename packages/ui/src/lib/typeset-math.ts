import "katex/dist/katex.min.css"

import katex from "katex"

export interface TypesetMathOptions {
	source: string
	display: boolean
}

/** A 100×100 matrix is 49 KB of source, and no expression a reader can follow comes
 * near that: past this the source is never handed to the typesetter at all. */
const MAX_SOURCE_LENGTH = 4_096

/** That same matrix typesets to 2.2 MB of DOM. A generous display expression lands
 * around 26 KB, so this leaves room for the largest readable one and none for a bomb. */
const MAX_OUTPUT_LENGTH = 65_536

/** The backstop for a source that is small to write and slow to typeset. */
const MAX_RENDER_MS = 100

/** Reached by dynamic import alone: KaTeX and its stylesheet stay off the module graph
 * until a document carries math. Glyphs paint in `currentColor`, so one render reads in
 * both themes, and `trust` stays off so `\href` and the html commands cannot reach the
 * output whoever wrote the source. Nothing is returned when the expression cannot be
 * parsed, or when it costs more than the bounds above — the caller keeps the source
 * text on screen, which is the only honest thing to show for either. */
export const typesetMath = ({ display, source }: TypesetMathOptions) => {
	if (source.length > MAX_SOURCE_LENGTH) return ""

	const started = performance.now()

	try {
		const html = katex.renderToString(source, {
			displayMode: display,
			errorColor: "var(--destructive)",
			output: "htmlAndMathml",
			throwOnError: false,
			trust: false,
		})

		if (html.length > MAX_OUTPUT_LENGTH) return ""
		if (performance.now() - started > MAX_RENDER_MS) return ""

		return html
	} catch {
		return ""
	}
}
