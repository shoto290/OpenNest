"use client"
// Adapted from beui.dev/components/agents/message-bubble

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

import { MessageSideContext } from "@workspace/ui/components/agents/message-context"
import { Icons } from "@workspace/ui/components/icons"
import { MARKDOWN_PROSE_CLASS } from "@workspace/ui/components/markdown/prose"
import { SPRING_LAYOUT, SPRING_SWAP } from "@workspace/ui/lib/ease"
import { cn, mergeRefs } from "@workspace/ui/lib/utils"

/** What a bubble paints behind its content. Two of them paint nothing: `ghost`
 * fills the row for content that lays out its own surface, and `bare` hugs its
 * content for content that arrives already framed — a table, which would
 * otherwise be boxed twice, and whose row keeps its actions beside that frame
 * rather than out at the edge of the transcript. */
export type MessageBubbleVariant =
	| "solid"
	| "soft"
	| "tint"
	| "outline"
	| "ghost"
	| "bare"
	| "danger"
export type MessageBubbleAlign = "start" | "end"

interface MessageBubbleContextValue {
	align?: MessageBubbleAlign
	animateIn: boolean
	variant: MessageBubbleVariant
}

const MessageBubbleContext = createContext<MessageBubbleContextValue>({
	animateIn: true,
	variant: "soft",
})
const MessageBubbleLayoutContext = createContext<() => void>(() => {})

type MotionOwnedProps =
	| "onDrag"
	| "onDragStart"
	| "onDragEnd"
	| "onAnimationStart"
	| "onAnimationEnd"
	| "onAnimationIteration"

export interface MessageBubbleProps
	extends Omit<ComponentPropsWithRef<"div">, "children" | MotionOwnedProps> {
	variant?: MessageBubbleVariant
	/** Defaults to the surrounding Message alignment when omitted. */
	align?: MessageBubbleAlign
	/** Plays the bubble entrance once when this component mounts. */
	animateIn?: boolean
	children?: ReactNode
}

export interface MessageBubbleContentProps
	extends ComponentPropsWithRef<"div"> {
	/** Replaces the content element while preserving bubble styling. */
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

// Sent bubbles should pop into place quickly with one restrained overshoot.
const BUBBLE_POP = {
	type: "spring",
	stiffness: 520,
	damping: 27,
	mass: 0.52,
} as const

export function MessageBubble({
	variant = "soft",
	align,
	animateIn = false,
	className,
	children,
	...props
}: MessageBubbleProps) {
	const reduce = useReducedMotion() ?? false
	const messageSide = useContext(MessageSideContext)
	const resolvedAlign = align ?? messageSide ?? "start"

	return (
		<MessageBubbleContext.Provider
			value={{ align: resolvedAlign, animateIn, variant }}
		>
			<motion.div
				data-slot="message-bubble"
				data-align={resolvedAlign}
				data-variant={variant}
				initial={false}
				exit={reduce ? undefined : { y: -3, scale: 0.99 }}
				transition={SPRING_LAYOUT}
				className={cn(
					"group/bubble flex w-full flex-col",
					resolvedAlign === "end" ? "items-end" : "items-start",
					className,
				)}
				{...props}
			>
				{children}
			</motion.div>
		</MessageBubbleContext.Provider>
	)
}

function bubbleContentClass(
	variant: MessageBubbleVariant,
	interactive: boolean,
) {
	return cn(
		"relative z-0 min-w-9 max-w-full break-words rounded-2xl px-3.5 py-2.5 text-sm leading-6 text-foreground",
		MARKDOWN_PROSE_CLASS,
		variant === "solid" && "text-primary-foreground",
		variant === "ghost" && "w-full rounded-none px-0 py-0",
		// A framed block keeps a hair of the padding it gives up: the run's gap is
		// measured for bubbles, which hold themselves off their neighbours by it.
		variant === "bare" && "w-auto rounded-none px-0 py-1",
		variant === "danger" && "text-destructive",
		interactive &&
			"cursor-pointer text-left outline-none transition-transform duration-150 hover:brightness-[0.98] focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]",
	)
}

function bubbleSurfaceClass(
	variant: MessageBubbleVariant,
	align: MessageBubbleAlign,
) {
	return cn(
		"pointer-events-none absolute inset-0 -z-10 rounded-[inherit]",
		align === "end" ? "origin-bottom-right" : "origin-bottom-left",
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
	const reduce = useReducedMotion() ?? false
	const {
		align = "start",
		animateIn,
		variant,
	} = useContext(MessageBubbleContext)
	const [layoutVersion, setLayoutVersion] = useState(0)
	const notifyLayout = useCallback(
		() => setLayoutVersion((version) => version + 1),
		[],
	)
	const interactive = render?.type === "button" || render?.type === "a"
	const filled = variant !== "ghost" && variant !== "bare"
	const classes = cn(bubbleContentClass(variant, interactive), className)
	const composedChildren = (
		<>
			{filled ? (
				<motion.span
					aria-hidden="true"
					layout={reduce ? false : "size"}
					layoutDependency={layoutVersion}
					initial={animateIn && !reduce ? { scale: 0.92 } : false}
					animate={{ scale: 1 }}
					transition={
						reduce
							? { duration: 0 }
							: { scale: BUBBLE_POP, layout: SPRING_LAYOUT }
					}
					className={bubbleSurfaceClass(variant, align)}
				/>
			) : null}
			<MessageBubbleLayoutContext.Provider value={notifyLayout}>
				<div className="relative">{children}</div>
			</MessageBubbleLayoutContext.Provider>
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
	moreLabel = "Show more",
	lessLabel = "Show less",
	contentClassName,
	triggerClassName,
	className,
	children,
	...props
}: MessageBubbleCollapsibleProps) {
	const reduce = useReducedMotion() ?? false
	const contentId = useId()
	const notifyLayout = useContext(MessageBubbleLayoutContext)
	const [internalOpen, setInternalOpen] = useState(defaultOpen)
	const currentOpen = open ?? internalOpen

	const setOpen = useCallback(
		(next: boolean) => {
			notifyLayout()
			if (open === undefined) setInternalOpen(next)
			onOpenChange?.(next)
		},
		[notifyLayout, onOpenChange, open],
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
				<span>{currentOpen ? lessLabel : moreLabel}</span>
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
