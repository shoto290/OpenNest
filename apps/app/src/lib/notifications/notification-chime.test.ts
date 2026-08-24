import { describe, expect, it } from "vitest"

import { createChime } from "./notification-chime"

describe("createChime", () => {
	it("plays nothing where there is no Tauri host to play it", () => {
		expect(() => createChime()()).not.toThrow()
	})
})
