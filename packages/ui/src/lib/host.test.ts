import { describe, expect, it } from "vitest"

import { hostInitial } from "@workspace/ui/lib/host"

describe("host initial", () => {
	it("reads the initial off the host and drops the www prefix", () => {
		expect(hostInitial("https://opennest.dev/changelog")).toBe("o")
		expect(hostInitial("https://www.opennest.dev/roadmap")).toBe("o")
		expect(hostInitial("https://docs.opennest.dev")).toBe("d")
	})

	it("decodes an internationalized host instead of marking every one with x", () => {
		expect(hostInitial("https://xn--e1afmkfd.xn--p1ai")).toBe("п")
		expect(hostInitial("https://xn--mnchen-3ya.de")).toBe("m")
		expect(hostInitial("https://xn--fiqs8s.cn")).toBe("中")
	})

	it("marks an address with a neutral glyph rather than a digit or a bracket", () => {
		expect(hostInitial("https://192.168.1.1/admin")).toBe("•")
		expect(hostInitial("https://[2001:db8::1]/admin")).toBe("•")
	})

	it("gives nothing back for a value that is not a URL", () => {
		expect(hostInitial("not a url")).toBeNull()
		expect(hostInitial("")).toBeNull()
	})
})
