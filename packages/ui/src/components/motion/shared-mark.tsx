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
	/** One layout identity spanning every place this mark can live. Exactly one
	 * node may hold a given id at a time, so the places must be mutually
	 * exclusive; Motion then moves the surviving node from the box it left to
	 * the box it arrives in, rather than letting it blink between the two. */
	markId?: string
}

/** The box a travelling mark occupies. Plain until given an id: an unmarked
 * slot has nothing to travel to, so it pays nothing for the possibility.
 * A block box, never an inline one: both ends of a journey must measure the
 * same, and an inline box takes the height of whatever line it lands on. */
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
