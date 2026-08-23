import { describe, expect, it, vi } from "vitest"

import type {
	DiagramScheme,
	renderMermaid as RenderMermaid,
} from "@workspace/ui/lib/render-mermaid"

const started: string[] = []
const finish: Array<() => void> = []

const initialize = vi.fn()

const render = vi.fn(async (id: string) => {
	started.push(id)
	await new Promise<void>((resolve) => {
		finish.push(resolve)
	})
	return { svg: `<svg id="${id}"></svg>` }
})

vi.mock("mermaid", () => ({ default: { initialize, render } }))

let renderMermaid: typeof RenderMermaid

/** Module state carries the theme in force, so every case starts from a clean one. */
const loadRenderer = async () => {
	vi.resetModules()
	started.length = 0
	finish.length = 0
	initialize.mockClear()
	render.mockClear()
	renderMermaid = (await import("@workspace/ui/lib/render-mermaid"))
		.renderMermaid
}

const finishAll = () => {
	for (const resolve of finish.splice(0)) resolve()
}

const draw = (id: string, scheme: DiagramScheme, signal?: AbortSignal) =>
	renderMermaid({ id, scheme, signal, source: "flowchart TD\n\tA --> B" })

describe("render mermaid", () => {
	it("draws diagrams that share the theme in force at the same time", async () => {
		await loadRenderer()

		const first = draw("a", "light")
		await vi.waitFor(() => expect(started).toEqual(["a"]))

		const second = draw("b", "light")
		await vi.waitFor(() => expect(started).toEqual(["a", "b"]))

		finishAll()
		expect(await Promise.all([first, second])).toEqual([
			'<svg id="a"></svg>',
			'<svg id="b"></svg>',
		])
	})

	it("holds a diagram that needs the theme changed until the others are drawn", async () => {
		await loadRenderer()

		const light = draw("a", "light")
		await vi.waitFor(() => expect(started).toEqual(["a"]))

		const dark = draw("b", "dark")
		await new Promise((resolve) => setTimeout(resolve, 10))
		expect(started).toEqual(["a"])

		finishAll()
		await vi.waitFor(() => expect(started).toEqual(["a", "b"]))

		finishAll()
		await Promise.all([light, dark])
		expect(initialize).toHaveBeenCalledTimes(2)
	})

	it("drops a drawing dropped before it starts", async () => {
		await loadRenderer()
		const dropped = new AbortController()
		dropped.abort()

		expect(await draw("a", "light", dropped.signal)).toBe("")
		expect(render).not.toHaveBeenCalled()
	})

	it("throws away a drawing dropped while it runs", async () => {
		await loadRenderer()
		const dropped = new AbortController()

		const drawing = draw("a", "light", dropped.signal)
		await vi.waitFor(() => expect(started).toEqual(["a"]))

		dropped.abort()
		finishAll()

		expect(await drawing).toBe("")
	})
})
