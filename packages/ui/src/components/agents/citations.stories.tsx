import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { A11Y_CONTRAST_AWAITING_DESIGN_DECISION } from "@workspace/storybook/story-utils"
import {
	type CitationItem,
	CitationList,
	CitationMark,
	CitationStack,
} from "@workspace/ui/components/agents/citations"

const SOURCES: CitationItem[] = [
	{
		id: "changelog",
		title: "Every change since the last release",
		domain: "opennest.dev",
		url: "https://opennest.dev/changelog",
	},
	{
		id: "roadmap",
		title: "What ships next, and what will not",
		domain: "www.opennest.dev",
		url: "https://www.opennest.dev/roadmap",
	},
	{
		id: "directory",
		title: "Каталог примеров",
		domain: "xn--e1afmkfd.xn--p1ai",
		url: "https://пример.рф/каталог",
	},
	{
		id: "box",
		title: "The box on this desk",
		domain: "192.168.1.1",
		url: "https://192.168.1.1/admin",
	},
	{
		id: "recall",
		title: "Something the agent recalled on its own",
	},
]

const EXPECTED_MARKS = ["o", "o", "п", "•", ""]

const STACK_LIMIT = 4

const marksOf = (canvasElement: HTMLElement) =>
	[...canvasElement.querySelectorAll('[data-slot="citation-mark"]')].map(
		({ textContent }) => textContent,
	)

const meta = preview.meta({
	title: "AI/CitationMark",
	component: CitationMark,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The mark ahead of a cited source. It is drawn, never fetched: an icon would have to be asked of the source itself or of a service answering for every source, and either one would learn which pages an answer rests on, from which address, at what time. So the mark carries the initial of the host, read off the URL — decoded when the host is internationalized, since the punycode form starts with `x` for all of them — and a neutral dot when the host is an address rather than a name. A source with no URL keeps the generic glyph. It is decoration: `aria-hidden`, unselectable, and the title beside it is what a reader and a screen reader both go by.",
			},
		},
	},
	args: { url: "https://opennest.dev/changelog" },
	argTypes: { url: { control: "text" } },
})

export const Playground = meta.story({})

export const Hosts = meta.story({
	globals: { theme_layout: "side-by-side" },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"Every kind of source a citation list holds, in both themes at once. Check that the letter and the dot hold their contrast on either background, that the box is the same size whichever it shows, and that the Cyrillic source is marked with the letter its reader knows while the row still spells the host in punycode — the mark is the friendly part, the host is the part that cannot lie.",
			},
		},
	},
	render: () => <CitationList citations={SOURCES} />,
	play: async ({ canvasElement }) => {
		await expect(marksOf(canvasElement)).toEqual([
			...EXPECTED_MARKS,
			...EXPECTED_MARKS,
		])
		await expect(canvasElement.querySelectorAll("img")).toHaveLength(0)
	},
})

export const Stacked = meta.story({
	globals: { theme_layout: "side-by-side" },
	parameters: {
		docs: {
			description: {
				story:
					"The same marks overlapped, the way a collapsed answer says how many sources it stands on before naming any. The ring is the background colour, so the stack reads as depth in both themes; check that a letter stays centred once the box is round.",
			},
		},
	},
	render: () => <CitationStack citations={SOURCES} limit={STACK_LIMIT} />,
	play: async ({ canvasElement }) => {
		const stacked = EXPECTED_MARKS.slice(0, STACK_LIMIT)

		await expect(marksOf(canvasElement)).toEqual([...stacked, ...stacked])
	},
})
