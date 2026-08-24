"use client"

import { motion, useReducedMotion } from "motion/react"
import type { ComponentPropsWithRef } from "react"

import { SPRING_LAYOUT, TRANSITION_NONE } from "@workspace/ui/lib/ease"
import { cn } from "@workspace/ui/lib/utils"

type MotionOwnedProps =
	| "onDrag"
	| "onDragStart"
	| "onDragEnd"
	| "onAnimationStart"
	| "onAnimationEnd"
	| "onAnimationIteration"

export interface SharedMarkProps
	extends Omit<ComponentPropsWithRef<"span">, MotionOwnedProps> {
	markId?: string
}

export function SharedMark({ markId, className, ...props }: SharedMarkProps) {
	const reduce = useReducedMotion() ?? false
	const classes = cn("flex w-fit", className)

	if (!markId) {
		return (
			<span
				data-slot="shared-mark"
				data-state="plain"
				className={classes}
				{...props}
			/>
		)
	}

	return (
		<motion.span
			data-slot="shared-mark"
			data-state="marked"
			layoutId={markId}
			transition={reduce ? TRANSITION_NONE : SPRING_LAYOUT}
			className={classes}
			{...props}
		/>
	)
}
