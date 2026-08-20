"use client"

import { type HTMLMotionProps, motion, useReducedMotion } from "motion/react"
import { forwardRef, type ReactNode } from "react"

import { SPRING_PRESS } from "@workspace/ui/lib/ease"
import { useHoverCapable } from "@workspace/ui/lib/hooks/use-hover-capable"
import { cn } from "@workspace/ui/lib/utils"

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline"
export type ButtonSize = "sm" | "md" | "lg" | "icon"

export interface ButtonProps
	extends Omit<HTMLMotionProps<"button">, "children"> {
	variant?: ButtonVariant
	size?: ButtonSize
	pressScale?: number
	children?: ReactNode
}

export interface ButtonLinkProps
	extends Omit<HTMLMotionProps<"a">, "children"> {
	variant?: ButtonVariant
	size?: ButtonSize
	pressScale?: number
	children?: ReactNode
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
	primary: "bg-primary text-primary-foreground hover:bg-primary/90",
	secondary: "border border-border bg-card text-foreground hover:border-border",
	ghost: "text-muted-foreground hover:text-foreground hover:bg-primary/5",
	outline:
		"border border-border bg-transparent text-foreground hover:bg-primary/5",
}

const SIZE_CLASS: Record<ButtonSize, string> = {
	sm: "h-8 px-3 text-xs gap-1.5 rounded-full",
	md: "h-10 px-5 text-sm gap-2 rounded-full",
	lg: "h-12 px-6 text-base gap-2 rounded-full",
	icon: "h-8 w-8 rounded-lg",
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
	function Button(
		{
			variant = "primary",
			size = "md",
			pressScale = 0.93,
			className,
			children,
			...rest
		},
		ref,
	) {
		const reduce = useReducedMotion()
		const canHover = useHoverCapable()

		return (
			<motion.button
				ref={ref}
				type="button"
				whileTap={reduce ? undefined : { scale: pressScale }}
				whileHover={reduce || !canHover ? undefined : { scale: 1.02 }}
				transition={SPRING_PRESS}
				className={cn(
					"inline-flex items-center justify-center font-medium select-none",
					"disabled:pointer-events-none disabled:opacity-50",
					VARIANT_CLASS[variant],
					SIZE_CLASS[size],
					className,
				)}
				{...rest}
			>
				{children}
			</motion.button>
		)
	},
)

export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(
	function ButtonLink(
		{
			variant = "primary",
			size = "md",
			pressScale = 0.93,
			className,
			children,
			...rest
		},
		ref,
	) {
		const reduce = useReducedMotion()
		const canHover = useHoverCapable()

		return (
			<motion.a
				ref={ref}
				whileTap={reduce ? undefined : { scale: pressScale }}
				whileHover={reduce || !canHover ? undefined : { scale: 1.02 }}
				transition={SPRING_PRESS}
				className={cn(
					"inline-flex items-center justify-center font-medium select-none",
					VARIANT_CLASS[variant],
					SIZE_CLASS[size],
					className,
				)}
				{...rest}
			>
				{children}
			</motion.a>
		)
	},
)
