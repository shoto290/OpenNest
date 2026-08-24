"use client"

import { type RefObject, useEffect, useState } from "react"

export type ColorScheme = "light" | "dark"

const SCHEME_PROPERTY = "--color-scheme"

export const schemeOf = (element: HTMLElement): ColorScheme =>
	getComputedStyle(element).getPropertyValue(SCHEME_PROPERTY).trim() === "dark"
		? "dark"
		: "light"

export const useColorScheme = (element: RefObject<HTMLElement | null>) => {
	const [scheme, setScheme] = useState<ColorScheme>("light")

	useEffect(() => {
		const read = () => {
			const target = element.current
			if (target) setScheme(schemeOf(target))
		}

		read()

		const observer = new MutationObserver(read)
		for (const target of [document.documentElement, document.body]) {
			observer.observe(target, { attributeFilter: ["class"], attributes: true })
		}

		return () => observer.disconnect()
	}, [element])

	return scheme
}
