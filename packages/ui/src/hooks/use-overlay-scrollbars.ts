"use client"

import { OverlayScrollbars, type PartialOptions } from "overlayscrollbars"
import { type RefObject, useEffect, useRef } from "react"

import {
	type ColorScheme,
	useColorScheme,
} from "@workspace/ui/hooks/use-color-scheme"

const HANDLE_THEMES: Record<ColorScheme, string> = {
	dark: "os-theme-dark",
	light: "os-theme-light",
}

const FROZEN_SCROLLBARS = {
	autoHide: "leave",
	autoHideSuspend: true,
} as const

const withDefaults = (
	scheme: ColorScheme,
	options?: PartialOptions,
): PartialOptions => ({
	...options,
	scrollbars: {
		...FROZEN_SCROLLBARS,
		theme: HANDLE_THEMES[scheme],
		...options?.scrollbars,
	},
})

export interface OverlayScrollbarsSetup {
	isEnabled?: boolean
	options?: PartialOptions
}

export const useOverlayScrollbars = (
	element: RefObject<HTMLElement | null>,
	{ isEnabled = true, options }: OverlayScrollbarsSetup = {},
) => {
	const scheme = useColorScheme(element)
	const instance = useRef<OverlayScrollbars | null>(null)

	useEffect(() => {
		const target = element.current
		if (!target || !isEnabled) return

		instance.current = OverlayScrollbars(
			{ target, elements: { viewport: target } },
			{ scrollbars: FROZEN_SCROLLBARS },
		)

		return () => {
			instance.current?.destroy()
			instance.current = null
		}
	}, [element, isEnabled])

	useEffect(() => {
		instance.current?.options(withDefaults(scheme, options))
	}, [scheme, options])
}
