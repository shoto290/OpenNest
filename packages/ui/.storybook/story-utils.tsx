import type { ComponentType, ReactNode } from "react"
import type { ExtraProps } from "react-markdown"
import { expect, waitFor } from "storybook/test"

import {
	MARKDOWN_CODE_SURFACE_CLASS,
	MARKDOWN_PROSE_CLASS,
	MARKDOWN_WHITESPACE_CLASS,
} from "@workspace/ui/components/markdown/prose"
import { cn } from "@workspace/ui/lib/utils"

/** Motion declares its prop types in a package this workspace cannot resolve by
 * name, so `tsc -b` fails to emit a declaration for any story typed against
 * them. Narrowing a motion component to the props its stories actually drive
 * keeps the emitted types nameable, and costs nothing in the docs: the props
 * table is generated from the component source, not from this type. Props land
 * optional, since a story inherits whatever the meta already supplies. */
export const withStoryProps = <Props,>(component: ComponentType<never>) =>
	component as ComponentType<Partial<Props>>

export const listExhaustively = <T extends string>(members: Record<T, true>) =>
	Object.keys(members) as T[]

export const A11Y_CONTRAST_AWAITING_DESIGN_DECISION = {
	config: {
		rules: [{ id: "color-contrast", reviewOnFail: true }],
	},
}

/** A play function reading an element mid-animation has to look again sooner than
 * the default 50ms, or it measures a frame the tween has already left. */
export const FRAME_POLL = { interval: 10 }

/** The a11y pass reads colours straight after the play function, so an overlay has
 * to have landed before it runs or it measures a half-transparent surface. Waiting
 * on the animations the element is running beats polling a computed value, which
 * only ever reports the frame the poll happened to catch. A tween the component
 * cancels rejects rather than settles, and a cancelled tween is over all the same. */
export const settled = async (element: HTMLElement) => {
	await waitFor(() => expect(element).toBeVisible(), FRAME_POLL)
	await Promise.all(
		element
			.getAnimations({ subtree: true })
			.map(({ finished }) => finished.catch(() => undefined)),
	)
	return element
}

export const Row = ({ children }: { children: React.ReactNode }) => (
	<div className="flex flex-wrap items-center gap-3">{children}</div>
)

/** Every node a component named with `data-slot`, in document order. What a play
 * function reads a rendering through, rather than a class or a tag it does not own. */
export const slotsIn = (root: Element, slot: string) =>
	Array.from(root.querySelectorAll<HTMLElement>(`[data-slot="${slot}"]`))

export const botIdentityAvatars = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "bot-identity-avatar")

/** A picture a reader uploaded, inline so a story needs no host to load it. */
export const UPLOADED_AVATAR_IMAGE =
	"data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCA5NiA5Nic+PHJlY3Qgd2lkdGg9Jzk2JyBoZWlnaHQ9Jzk2JyBmaWxsPScjZThhMzNkJy8+PGNpcmNsZSBjeD0nNDgnIGN5PSczOCcgcj0nMTYnIGZpbGw9JyNmZmY3ZTgnLz48cmVjdCB4PScyMCcgeT0nNjAnIHdpZHRoPSc1NicgaGVpZ2h0PSc0MCcgcng9JzIwJyBmaWxsPScjZmZmN2U4Jy8+PC9zdmc+"

interface MarkdownProseProps {
	children: ReactNode
}

/** The context `<Markdown>` puts around every renderer it hands the parser: the same
 * prose, code surface and whitespace rules, so a renderer shown on its own reads the way
 * it reads inside a block. */
export const MarkdownProse = ({ children }: MarkdownProseProps) => (
	<div
		className={cn(
			MARKDOWN_PROSE_CLASS,
			MARKDOWN_CODE_SURFACE_CLASS,
			MARKDOWN_WHITESPACE_CLASS,
			"w-[44rem] max-w-full text-sm leading-6",
		)}
	>
		{children}
	</div>
)

type ParserNode = NonNullable<ExtraProps["node"]>
type ParserChild = ParserNode["children"][number]

export const textNode = (value: string): ParserChild => ({
	type: "text",
	value,
})

/** A renderer that reads its source from the node rather than from its children — a fence,
 * a table — needs the tree the parser would have handed it. */
export const elementNode = (
	tagName: string,
	children: ParserChild[],
	properties: ParserNode["properties"] = {},
): ParserNode => ({ type: "element", tagName, properties, children })
