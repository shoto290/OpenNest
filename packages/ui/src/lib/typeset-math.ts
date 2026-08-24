import "katex/dist/katex.min.css"

import katex from "katex"

export interface TypesetMathOptions {
	source: string
	display: boolean
}

const MAX_SOURCE_LENGTH = 4_096

const MAX_OUTPUT_LENGTH = 65_536

const MAX_RENDER_MS = 100

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
