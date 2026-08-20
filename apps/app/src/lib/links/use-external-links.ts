import { openUrl } from "@tauri-apps/plugin-opener"
import { useEffect } from "react"

import { isDesktopHost } from "../host"

/** The only schemes that resolve against this window's own origin, so the only
 * ones a link can stay here under. */
const WEB_SCHEMES = ["http:", "https:"]

/** What the system answers for and this window cannot: a page, a mail composer,
 * a dialler. Every other scheme belongs to the app itself. */
const EXTERNAL_SCHEMES = new Set([...WEB_SCHEMES, "mailto:", "tel:"])

const urlOf = (href: string, base?: string): URL | null => {
	try {
		return new URL(href, base)
	} catch {
		return null
	}
}

/** The address a click should hand to the system, or nothing when the link
 * stays here. Resolved against the page it was clicked on, so a fragment, a
 * route and anything else served under this window's own origin reads as
 * internal — whichever scheme the host serves that window under. */
export const externalUrlOf = (
	href: string | null | undefined,
	pageUrl: string,
): string | null => {
	const url = href ? urlOf(href, pageUrl) : null
	if (!url || !EXTERNAL_SCHEMES.has(url.protocol)) {
		return null
	}
	const page = urlOf(pageUrl)
	if (WEB_SCHEMES.includes(url.protocol) && url.origin === page?.origin) {
		return null
	}
	return url.href
}

const anchorOf = (target: EventTarget | null) =>
	target instanceof Element ? target.closest("a[href]") : null

/** Where every external link of the window is answered, once, rather than at
 * each anchor: the webview has no second tab to send a `target="_blank"` to, so
 * a link followed in place would take the reader off the conversation and leave
 * the app showing a page. The click is taken instead and the address handed to
 * the system, which leaves the view exactly where it was. Refused or
 * unanswered, the app carries on — there is nothing else the click was going to
 * do.
 *
 * `bun dev:web` runs in a real browser, which already opens these itself. */
export const useExternalLinks = () => {
	useEffect(() => {
		if (!isDesktopHost()) return

		const openInBrowser = (event: MouseEvent) => {
			if (event.defaultPrevented) return

			const url = externalUrlOf(
				anchorOf(event.target)?.getAttribute("href"),
				window.location.href,
			)
			if (!url) return

			event.preventDefault()
			openUrl(url).catch(() => undefined)
		}

		document.addEventListener("click", openInBrowser)
		return () => document.removeEventListener("click", openInBrowser)
	}, [])
}
