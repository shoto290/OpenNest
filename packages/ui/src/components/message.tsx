// beui.dev/components/agents/message

import { motion, useReducedMotion } from "motion/react"
import {
	type ComponentPropsWithRef,
	createContext,
	type ReactNode,
	useContext,
} from "react"
import { useTranslation } from "react-i18next"

import { MessageSideContext } from "@workspace/ui/components/agents/message-context"
import { EASE_OUT } from "@workspace/ui/lib/ease"
import { cn } from "@workspace/ui/lib/utils"

export type MessageFrom = "user" | "assistant"

interface MessageContextValue {
	from: MessageFrom
}

const MessageContext = createContext<MessageContextValue>({
	from: "assistant",
})

type MotionOwnedProps =
	| "onDrag"
	| "onDragStart"
	| "onDragEnd"
	| "onAnimationStart"
	| "onAnimationEnd"
	| "onAnimationIteration"

export interface MessageProps
	extends Omit<
		ComponentPropsWithRef<"article">,
		"children" | MotionOwnedProps
	> {
	from: MessageFrom
	/** Plays a trailing-edge pop-up once when this message row mounts. */
	animateIn?: boolean
	children: ReactNode
}

export interface MessageGroupProps extends ComponentPropsWithRef<"div"> {
	spacing?: "compact" | "default"
	/** Names the transcript for assistive technology. */
	label?: string
}

export interface MessageAvatarProps extends ComponentPropsWithRef<"div"> {
	/** Keep an empty avatar slot so grouped messages remain aligned. */
	placeholder?: boolean
}

export type MessageContentProps = ComponentPropsWithRef<"div">
export type MessageHeaderProps = ComponentPropsWithRef<"div">
export type MessageFooterProps = ComponentPropsWithRef<"div">

export type MessageMarkerProps = ComponentPropsWithRef<"div">

export interface MessageTypingProps extends ComponentPropsWithRef<"span"> {
	label?: string
}

// A sent row should rise from the live edge without changing measured layout.
const MESSAGE_POP_UP = {
	type: "spring",
	stiffness: 480,
	damping: 32,
	mass: 0.62,
} as const

export function Message({
	from,
	animateIn = false,
	children,
	className,
	style,
	...props
}: MessageProps) {
	const { t } = useTranslation("chat")
	const reduce = useReducedMotion() ?? false
	const entrance = animateIn && !reduce

	return (
		<MessageSideContext.Provider value={from === "user" ? "end" : "start"}>
			<MessageContext.Provider value={{ from }}>
				<motion.article
					data-slot="message"
					data-from={from}
					aria-label={props["aria-label"] ?? t(`transcript.message.${from}`)}
					initial={
						entrance ? { transform: "translateY(8px) scale(0.95)" } : false
					}
					animate={
						entrance ? { transform: "translateY(0px) scale(1)" } : undefined
					}
					exit={
						reduce ? undefined : { transform: "translateY(-3px) scale(0.99)" }
					}
					transition={MESSAGE_POP_UP}
					style={{
						transformOrigin: from === "user" ? "100% 100%" : "0% 100%",
						...style,
					}}
					className={cn(
						"group/message flex w-full items-start gap-2",
						from === "user" ? "flex-row-reverse" : "flex-row",
						className,
					)}
					{...props}
				>
					{children}
				</motion.article>
			</MessageContext.Provider>
		</MessageSideContext.Provider>
	)
}

export function MessageGroup({
	spacing = "compact",
	label,
	className,
	...props
}: MessageGroupProps) {
	const { t } = useTranslation("chat")

	return (
		<div
			data-slot="message-group"
			role="log"
			aria-label={label ?? t("transcript.label")}
			aria-live="polite"
			aria-relevant="additions"
			className={cn(
				"flex w-full flex-col",
				spacing === "compact" ? "gap-1.5" : "gap-4",
				className,
			)}
			{...props}
		/>
	)
}

export function MessageAvatar({
	placeholder = false,
	children,
	className,
	...props
}: MessageAvatarProps) {
	return (
		<div
			data-slot="message-avatar"
			aria-hidden={placeholder || undefined}
			className={cn(
				"grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-xs font-medium text-secondary-foreground [&_img]:size-full [&_img]:object-cover [&_svg]:size-3.5",
				placeholder && "invisible",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	)
}

export function MessageContent({ className, ...props }: MessageContentProps) {
	const { from } = useContext(MessageContext)

	return (
		<div
			data-slot="message-content"
			className={cn(
				"flex min-w-0 flex-1 flex-col gap-1.5 text-sm leading-6",
				from === "user" ? "items-end" : "items-start",
				className,
			)}
			{...props}
		/>
	)
}

export function MessageHeader({ className, ...props }: MessageHeaderProps) {
	const { from } = useContext(MessageContext)

	return (
		<div
			data-slot="message-header"
			className={cn(
				"flex items-center gap-1.5 px-1 text-xs leading-none text-muted-foreground",
				from === "user" ? "justify-end" : "justify-start",
				className,
			)}
			{...props}
		/>
	)
}

export function MessageFooter({ className, ...props }: MessageFooterProps) {
	const { from } = useContext(MessageContext)

	return (
		<div
			data-slot="message-footer"
			className={cn(
				"flex min-h-5 items-center gap-1 px-1 text-xs text-muted-foreground",
				from === "user" ? "justify-end" : "justify-start",
				className,
			)}
			{...props}
		/>
	)
}

export function MessageMarker({ className, ...props }: MessageMarkerProps) {
	return (
		<div
			data-slot="message-marker"
			className={cn(
				"mx-auto flex w-fit max-w-lg items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-center text-xs text-secondary-foreground",
				className,
			)}
			{...props}
		/>
	)
}

export function MessageTyping({
	label,
	className,
	...props
}: MessageTypingProps) {
	const { t } = useTranslation("chat")
	const reduce = useReducedMotion() ?? false

	return (
		<span
			data-slot="message-typing"
			className={cn("inline-flex h-5 items-center gap-1", className)}
			{...props}
		>
			<span className="sr-only">{label ?? t("transcript.typing")}</span>
			{[0, 1, 2].map((index) => (
				<motion.span
					key={index}
					aria-hidden="true"
					className="size-1 rounded-full bg-current"
					animate={reduce ? undefined : { y: [0, -2, 0] }}
					transition={{
						duration: 1.05,
						ease: EASE_OUT,
						repeat: Number.POSITIVE_INFINITY,
						delay: index * 0.14,
					}}
				/>
			))}
		</span>
	)
}
