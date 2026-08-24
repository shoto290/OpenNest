import * as React from "react"

import type { Palette } from "@workspace/ui/lib/palettes"

import type { ColorScheme } from "@/lib/user/preferences-contract"
import {
	isMirrorKey,
	readMirror,
	readStoredTheme,
	sameTheme,
	storeTheme,
	type ThemePreferences,
	writeMirror,
} from "@/lib/user/theme-mirror"

type ResolvedScheme = Exclude<ColorScheme, "system">

type ThemeProviderProps = {
	children: React.ReactNode
	disableTransitionOnChange?: boolean
}

type ThemeProviderState = {
	theme: ColorScheme
	setTheme: (theme: ColorScheme) => void
	palette: Palette
	setPalette: (palette: Palette) => void
}

const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)"

const ThemeProviderContext = React.createContext<
	ThemeProviderState | undefined
>(undefined)

function getSystemTheme(): ResolvedScheme {
	if (window.matchMedia(COLOR_SCHEME_QUERY).matches) {
		return "dark"
	}

	return "light"
}

function disableTransitionsTemporarily() {
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

function getNextTheme(theme: ColorScheme): ColorScheme {
	const resolvedTheme = theme === "system" ? getSystemTheme() : theme

	return resolvedTheme === "dark" ? "light" : "dark"
}

function isEditableTarget(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) {
		return false
	}

	if (target.isContentEditable) {
		return true
	}

	const editableParent = target.closest(
		"input, textarea, select, [contenteditable='true']",
	)
	if (editableParent) {
		return true
	}

	return false
}

export function ThemeProvider({
	children,
	disableTransitionOnChange = true,
}: ThemeProviderProps) {
	const [preferences, setPreferences] =
		React.useState<ThemePreferences>(readMirror)

	const changeTheme = React.useCallback((next: ThemePreferences) => {
		writeMirror(next)
		setPreferences(next)
		void storeTheme(next)
	}, [])

	const applyTheme = React.useCallback(
		(next: ThemePreferences) => {
			const root = document.documentElement
			const resolvedScheme =
				next.colorScheme === "system" ? getSystemTheme() : next.colorScheme
			const restoreTransitions = disableTransitionOnChange
				? disableTransitionsTemporarily()
				: null

			root.classList.remove("light", "dark")
			root.classList.add(resolvedScheme)
			root.dataset.theme = next.palette

			if (restoreTransitions) {
				restoreTransitions()
			}
		},
		[disableTransitionOnChange],
	)

	React.useLayoutEffect(() => {
		applyTheme(preferences)

		if (preferences.colorScheme !== "system") {
			return undefined
		}

		const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY)
		const handleChange = () => {
			applyTheme(preferences)
		}

		mediaQuery.addEventListener("change", handleChange)

		return () => {
			mediaQuery.removeEventListener("change", handleChange)
		}
	}, [preferences, applyTheme])

	React.useEffect(() => {
		void readStoredTheme().then((stored) => {
			if (!stored) {
				return
			}

			writeMirror(stored)
			setPreferences((current) =>
				sameTheme(current, stored) ? current : stored,
			)
		})
	}, [])

	React.useEffect(() => {
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

			changeTheme({
				...preferences,
				colorScheme: getNextTheme(preferences.colorScheme),
			})
		}

		window.addEventListener("keydown", handleKeyDown)

		return () => {
			window.removeEventListener("keydown", handleKeyDown)
		}
	}, [preferences, changeTheme])

	React.useEffect(() => {
		const handleStorageChange = (event: StorageEvent) => {
			if (event.storageArea !== localStorage) {
				return
			}

			if (!isMirrorKey(event.key)) {
				return
			}

			setPreferences(readMirror())
		}

		window.addEventListener("storage", handleStorageChange)

		return () => {
			window.removeEventListener("storage", handleStorageChange)
		}
	}, [])

	const value = React.useMemo(
		() => ({
			theme: preferences.colorScheme,
			setTheme: (colorScheme: ColorScheme) =>
				changeTheme({ ...preferences, colorScheme }),
			palette: preferences.palette,
			setPalette: (palette: Palette) =>
				changeTheme({ ...preferences, palette }),
		}),
		[preferences, changeTheme],
	)

	return (
		<ThemeProviderContext.Provider value={value}>
			{children}
		</ThemeProviderContext.Provider>
	)
}

export const useTheme = () => {
	const context = React.useContext(ThemeProviderContext)

	if (context === undefined) {
		throw new Error("useTheme must be used within a ThemeProvider")
	}

	return context
}
