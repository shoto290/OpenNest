import { describe, expect, it } from "vitest"

import { externalUrlOf } from "./use-external-links"

const PACKAGED = "tauri://localhost/index.html"
const DEV = "http://localhost:1420/index.html"

describe("externalUrlOf", () => {
	it("hands a web address to the system", () => {
		expect(externalUrlOf("https://example.com/notes", PACKAGED)).toBe(
			"https://example.com/notes",
		)
	})

	it("hands over what only the system can answer", () => {
		expect(externalUrlOf("mailto:hello@example.com", PACKAGED)).toBe(
			"mailto:hello@example.com",
		)
		expect(externalUrlOf("tel:+33123456789", PACKAGED)).toBe("tel:+33123456789")
	})

	it("keeps a fragment of the page being read here", () => {
		expect(externalUrlOf("#citation-3", PACKAGED)).toBeNull()
	})

	it("keeps a route of this window here", () => {
		expect(externalUrlOf("/settings", PACKAGED)).toBeNull()
		expect(externalUrlOf("/settings", DEV)).toBeNull()
	})

	it("keeps the window's own origin here while it is served over http", () => {
		expect(externalUrlOf("http://localhost:1420/help", DEV)).toBeNull()
	})

	it("sends another origin out, http or not", () => {
		expect(externalUrlOf("http://localhost:3000/help", DEV)).toBe(
			"http://localhost:3000/help",
		)
	})

	it("opens nothing for a link with no address", () => {
		expect(externalUrlOf(null, PACKAGED)).toBeNull()
		expect(externalUrlOf("", PACKAGED)).toBeNull()
	})

	it("opens nothing for a scheme the browser is not for", () => {
		expect(externalUrlOf("file:///etc/passwd", PACKAGED)).toBeNull()
		expect(externalUrlOf("javascript:alert(1)", PACKAGED)).toBeNull()
	})
})
