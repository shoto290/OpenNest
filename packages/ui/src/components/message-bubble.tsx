"use client"

import { motion, useReducedMotion } from "motion/react"
import {
	type ComponentPropsWithRef,
	cloneElement,
	createContext,
	type ReactElement,
	type ReactNode,
	type Ref,
	useCallback,
	useContext,
	useId,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { MARKDOWN_PROSE_CLASS } from "@workspace/ui/components/markdown/prose"
import { MessageSideContext } from "@workspace/ui/components/message-side-context"
import { SPRING_SWAP } from "@workspace/ui/lib/ease"
import { cn, mergeRefs } from "@workspace/ui/lib/utils"

export type MessageBubbleVariant =
	| "solid"
	| "soft"
	| "tint"
	| "outline"
	| "ghost"
	| "bare"
	| "danger"
export type MessageBubbleAlign = "start" | "end"

const MessageBubbleVariantContext = createContext<MessageBubbleVariant>("soft")

export interface MessageBubbleProps
	extends Omit<ComponentPropsWithRef<"div">, "children"> {
	variant?: MessageBubbleVariant
	align?: MessageBubbleAlign
	children?: ReactNode
}

export interface MessageBubbleContentProps
	extends ComponentPropsWithRef<"div"> {
	render?: ReactElement
}

export interface MessageBubbleGroupProps extends ComponentPropsWithRef<"div"> {
	spacing?: "compact" | "default"
}

export interface MessageBubbleCollapsibleProps
	extends ComponentPropsWithRef<"div"> {
	open?: boolean
	defaultOpen?: boolean
	onOpenChange?: (open: boolean) => void
	collapsedLines?: 2 | 3 | 4 | 5 | 6
	moreLabel?: ReactNode
	lessLabel?: ReactNode
	contentClassName?: string
	triggerClassName?: string
	children?: ReactNode
}

function hasSurface(variant: MessageBubbleVariant) {
	return variant !== "ghost" && variant !== "bare"
}

export function MessageBubble({
	variant = "soft",
	align,
	className,
	children,
	...props
}: MessageBubbleProps) {
	const messageSide = useContext(MessageSideContext)
	const resolvedAlign = align ?? messageSide ?? "start"

	return (
		<MessageBubbleVariantContext.Provider value={variant}>
			<div
				data-slot="message-bubble"
				data-align={resolvedAlign}
				data-variant={variant}
				className={cn(
					"group/bubble flex w-full flex-col",
					hasSurface(variant) && "max-w-[75%]",
					resolvedAlign === "end" ? "items-end" : "items-start",
					className,
				)}
				{...props}
			>
				{children}
			</div>
		</MessageBubbleVariantContext.Provider>
	)
}

export const MESSAGE_BUBBLE_INLINE_PADDING = "px-3.5"

const MENTION_OPENING_PADDING =
	'has-[p:first-child>[data-slot="bot-mention"]:first-child]:py-3.5'

function bubbleContentClass(
	variant: MessageBubbleVariant,
	interactive: boolean,
) {
	return cn(
		"relative z-0 min-w-9 max-w-full break-words rounded-2xl py-2.5 text-sm leading-6 text-foreground",
		MESSAGE_BUBBLE_INLINE_PADDING,
		hasSurface(variant) && MENTION_OPENING_PADDING,
		MARKDOWN_PROSE_CLASS,
		variant === "solid" && "text-primary-foreground",
		variant === "ghost" && "w-full rounded-none px-0 py-0",
		variant === "bare" && "w-auto rounded-none px-0 py-1",
		variant === "danger" && "text-destructive",
		interactive &&
			"cursor-pointer text-left outline-none transition-transform duration-150 hover:brightness-[0.98] focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]",
	)
}

function bubbleSurfaceClass(variant: MessageBubbleVariant) {
	return cn(
		"pointer-events-none absolute inset-0 -z-10 rounded-[inherit]",
		variant === "solid" && "bg-primary",
		variant === "soft" && "bg-muted",
		variant === "tint" && "bg-primary/10",
		variant === "outline" && "border border-border/70 bg-background",
		variant === "danger" && "bg-destructive/10",
	)
}

export function MessageBubbleContent({
	render,
	className,
	children,
	ref,
	...props
}: MessageBubbleContentProps) {
	const variant = useContext(MessageBubbleVariantContext)
	const interactive = render?.type === "button" || render?.type === "a"
	const filled = hasSurface(variant)
	const classes = cn(bubbleContentClass(variant, interactive), className)
	const composedChildren = (
		<>
			{filled ? (
				<span aria-hidden="true" className={bubbleSurfaceClass(variant)} />
			) : null}
			<div className="relative">{children}</div>
		</>
	)

	if (render) {
		const child = render as ReactElement<
			Record<string, unknown> & { className?: string; ref?: Ref<HTMLElement> }
		>

		return cloneElement(child, {
			...props,
			ref: mergeRefs(child.props.ref, ref as Ref<HTMLElement> | undefined),
			className: cn(classes, child.props.className),
			children: composedChildren,
			"data-slot": "message-bubble-content",
		})
	}

	return (
		<div
			ref={ref}
			data-slot="message-bubble-content"
			className={classes}
			{...props}
		>
			{composedChildren}
		</div>
	)
}

export function MessageBubbleGroup({
	spacing = "compact",
	className,
	...props
}: MessageBubbleGroupProps) {
	return (
		<div
			data-slot="message-bubble-group"
			className={cn(
				"flex w-full flex-col",
				spacing === "compact" ? "gap-1.5" : "gap-3",
				className,
			)}
			{...props}
		/>
	)
}

const LINE_CLAMP_CLASS = {
	2: "line-clamp-2",
	3: "line-clamp-3",
	4: "line-clamp-4",
	5: "line-clamp-5",
	6: "line-clamp-6",
} as const

export function MessageBubbleCollapsible({
	open,
	defaultOpen = false,
	onOpenChange,
	collapsedLines = 4,
	moreLabel,
	lessLabel,
	contentClassName,
	triggerClassName,
	className,
	children,
	...props
}: MessageBubbleCollapsibleProps) {
	const { t } = useTranslation("chat")
	const reduce = useReducedMotion() ?? false
	const contentId = useId()
	const [internalOpen, setInternalOpen] = useState(defaultOpen)
	const currentOpen = open ?? internalOpen
	const triggerLabel = currentOpen
		? (lessLabel ?? t("transcript.showLess"))
		: (moreLabel ?? t("transcript.showMore"))

	const setOpen = useCallback(
		(next: boolean) => {
			if (open === undefined) setInternalOpen(next)
			onOpenChange?.(next)
		},
		[onOpenChange, open],
	)

	return (
		<div
			data-slot="message-bubble-collapsible"
			data-state={currentOpen ? "open" : "closed"}
			className={cn("w-full", className)}
			{...props}
		>
			<div
				id={contentId}
				className={cn(
					"transition-[mask-image] duration-200",
					!currentOpen && LINE_CLAMP_CLASS[collapsedLines],
					!currentOpen &&
						"[mask-image:linear-gradient(to_bottom,#000_68%,transparent_100%)]",
					contentClassName,
				)}
			>
				{children}
			</div>
			<button
				type="button"
				aria-expanded={currentOpen}
				aria-controls={contentId}
				onClick={() => setOpen(!currentOpen)}
				className={cn(
					"mt-2 inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
					triggerClassName,
				)}
			>
				<span>{triggerLabel}</span>
				<motion.span
					aria-hidden="true"
					animate={{ rotate: currentOpen ? 180 : 0 }}
					transition={reduce ? { duration: 0 } : SPRING_SWAP}
				>
					<Icons.Expand className="size-3.5" />
				</motion.span>
			</button>
		</div>
	)
}
