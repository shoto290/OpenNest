import { useCallback, useEffect, useLayoutEffect } from "react"

import type { ColorScheme } from "@/lib/user/preferences-contract"

type ResolvedScheme = Exclude<ColorScheme, "system">

export type ThemeApplication = {
	colorScheme: ColorScheme
	onColorSchemeChange: (colorScheme: ColorScheme) => void
}

const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)"

const systemScheme = (): ResolvedScheme =>
	window.matchMedia(COLOR_SCHEME_QUERY).matches ? "dark" : "light"

const resolvedSchemeOf = (colorScheme: ColorScheme): ResolvedScheme =>
	colorScheme === "system" ? systemScheme() : colorScheme

const nextSchemeOf = (colorScheme: ColorScheme): ColorScheme =>
	resolvedSchemeOf(colorScheme) === "dark" ? "light" : "dark"

const disableTransitionsTemporarily = () => {
	const style = document.createElement("style")
	style.appendChild(
		document.createTextNode(
			"*,*::before,*::after{-webkit-transition:none!important;transition:none!important}",
		),
	)
	document.head.appendChild(style)

	return () => {
		window.getComputedStyle(document.body)
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				style.remove()
			})
		})
	}
}

const isEditableTarget = (target: EventTarget | null) => {
	if (!(target instanceof HTMLElement)) {
		return false
	}

	if (target.isContentEditable) {
		return true
	}

	return Boolean(
		target.closest("input, textarea, select, [contenteditable='true']"),
	)
}

export const useTheme = ({
	colorScheme,
	onColorSchemeChange,
}: ThemeApplication) => {
	const applyTheme = useCallback(() => {
		const root = document.documentElement
		const restoreTransitions = disableTransitionsTemporarily()

		root.classList.remove("light", "dark")
		root.classList.add(resolvedSchemeOf(colorScheme))

		restoreTransitions()
	}, [colorScheme])

	useLayoutEffect(() => {
		applyTheme()

		if (colorScheme !== "system") {
			return undefined
		}

		const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY)
		mediaQuery.addEventListener("change", applyTheme)

		return () => {
			mediaQuery.removeEventListener("change", applyTheme)
		}
	}, [applyTheme, colorScheme])

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.repeat) {
				return
			}

			if (event.metaKey || event.ctrlKey || event.altKey) {
				return
			}

			if (event.key.toLowerCase() !== "d") {
				return
			}

			if (isEditableTarget(event.target)) {
				return
			}

			onColorSchemeChange(nextSchemeOf(colorScheme))
		}

		window.addEventListener("keydown", handleKeyDown)

		return () => {
			window.removeEventListener("keydown", handleKeyDown)
		}
	}, [colorScheme, onColorSchemeChange])
}
