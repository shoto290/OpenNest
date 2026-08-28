import {
	CODE_LANGUAGES,
	warmCodeLanguage,
} from "@workspace/ui/lib/code-highlight"

const IDLE_TIMEOUT_MS = 2000

const afterNextPaint = (task: () => void) => {
	requestAnimationFrame(() => {
		setTimeout(task)
	})
}

const whenIdle = (task: () => void) => {
	if (typeof requestIdleCallback === "function") {
		requestIdleCallback(() => task(), { timeout: IDLE_TIMEOUT_MS })
		return
	}
	afterNextPaint(task)
}

export const warmCodeHighlighter = () => {
	for (const language of CODE_LANGUAGES) {
		whenIdle(() => warmCodeLanguage(language))
	}
}
