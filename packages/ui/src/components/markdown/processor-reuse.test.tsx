// @vitest-environment happy-dom
import { render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const processors = vi.hoisted(() => ({ built: 0 }))

vi.mock("react-markdown", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-markdown")>()
	const { createElement: element } = await import("react")
	return {
		...actual,
		default: (props: Parameters<typeof actual.default>[0]) => {
			processors.built += 1
			return element(actual.default, props)
		},
	}
})

const { I18nProvider } = await import("@workspace/ui/components/i18n-provider")
const { Markdown } = await import("@workspace/ui/components/markdown")

const SOURCE = "A **claim** with `code` and a [link](https://opennest.dev)"

const page = (blocks: number, className?: string) => (
	<I18nProvider>
		{Array.from({ length: blocks }, (_, index) => `block-${index}`).map(
			(key) => (
				<Markdown className={className} key={key}>
					{SOURCE}
				</Markdown>
			),
		)}
	</I18nProvider>
)

describe("markdown processor reuse", () => {
	beforeEach(() => {
		processors.built = 0
	})

	it("builds no processor when a mounted block re-renders", () => {
		const view = render(page(1))
		const onMount = processors.built

		view.rerender(page(1))
		view.rerender(page(1, "mt-4"))

		expect({ onMount, onRerender: processors.built }).toEqual({
			onMount: 1,
			onRerender: 1,
		})
	})

	it("builds one processor per block on a page", () => {
		render(page(20))

		expect(processors.built).toBe(20)
	})
})
