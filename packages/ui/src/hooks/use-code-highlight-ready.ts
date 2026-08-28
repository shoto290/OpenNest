"use client"

import { useCallback, useSyncExternalStore } from "react"

import {
	isCodeLanguageWarm,
	subscribeToCodeHighlighter,
} from "@workspace/ui/lib/code-highlight"

export const useCodeHighlightReady = (language?: string) => {
	const isWarm = useCallback(() => isCodeLanguageWarm(language), [language])
	return useSyncExternalStore(subscribeToCodeHighlighter, isWarm, isWarm)
}
