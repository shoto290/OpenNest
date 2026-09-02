import { OverlayScrollbars } from "overlayscrollbars"
import type { ComponentType, ReactNode } from "react"
import type { ExtraProps } from "react-markdown"
import { expect, waitFor } from "storybook/test"

import {
	MARKDOWN_CODE_SURFACE_CLASS,
	MARKDOWN_PROSE_CLASS,
	MARKDOWN_WHITESPACE_CLASS,
} from "@workspace/ui/components/markdown/prose"
import { cn } from "@workspace/ui/lib/utils"

export const withStoryProps = <Props,>(component: ComponentType<never>) =>
	component as ComponentType<Partial<Props>>

export const listExhaustively = <T extends string>(members: Record<T, true>) =>
	Object.keys(members) as T[]

export const A11Y_CONTRAST_AWAITING_DESIGN_DECISION = {
	config: {
		rules: [{ id: "color-contrast", reviewOnFail: true }],
	},
}

export const A11Y_FLOATING_FOCUS_GUARDS = {
	config: {
		rules: [{ id: "aria-hidden-focus", reviewOnFail: true }],
	},
}

export const FRAME_POLL = { interval: 10 }

const runsToAnEnd = (animation: Animation) =>
	animation.effect?.getTiming().duration !== "auto" &&
	animation.timeline instanceof DocumentTimeline

export const settled = async (element: HTMLElement) => {
	await waitFor(() => expect(element).toBeVisible(), FRAME_POLL)
	await Promise.all(
		element
			.getAnimations({ subtree: true })
			.filter(runsToAnEnd)
			.map(({ finished }) => finished.catch(() => undefined)),
	)
	return element
}

export const Row = ({ children }: { children: React.ReactNode }) => (
	<div className="flex flex-wrap items-center gap-3">{children}</div>
)

export const slotsIn = (root: Element, slot: string) =>
	Array.from(root.querySelectorAll<HTMLElement>(`[data-slot="${slot}"]`))

export const slotIn = (root: Element, slot: string) => {
	const node = root.querySelector<HTMLElement>(`[data-slot="${slot}"]`)
	if (!node) throw new Error(`Nothing here draws a ${slot}`)
	return node
}

export const hasOverlayScrollbars = (element: HTMLElement) =>
	OverlayScrollbars.valid(OverlayScrollbars(element))

export const widthInRems = (element: HTMLElement) =>
	element.getBoundingClientRect().width /
	Number.parseFloat(getComputedStyle(document.documentElement).fontSize)

export const botIdentityAvatars = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "bot-identity-avatar")

export const UPLOADED_AVATAR_IMAGE =
	"data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCA5NiA5Nic+PHJlY3Qgd2lkdGg9Jzk2JyBoZWlnaHQ9Jzk2JyBmaWxsPScjZThhMzNkJy8+PGNpcmNsZSBjeD0nNDgnIGN5PSczOCcgcj0nMTYnIGZpbGw9JyNmZmY3ZTgnLz48cmVjdCB4PScyMCcgeT0nNjAnIHdpZHRoPSc1NicgaGVpZ2h0PSc0MCcgcng9JzIwJyBmaWxsPScjZmZmN2U4Jy8+PC9zdmc+"

export const PICKED_PICTURE_FILE = new File(["<svg />"], "portrait.svg", {
	type: "image/svg+xml",
})

interface MarkdownProseProps {
	children: ReactNode
}

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

export const elementNode = (
	tagName: string,
	children: ParserChild[],
	properties: ParserNode["properties"] = {},
): ParserNode => ({ type: "element", tagName, properties, children })
