import type { CSSProperties, ElementType, ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

export const WORKING_SHIMMER_DURATION = 1.8

export interface TextShimmerProps {
	children: ReactNode
	as?: ElementType
	duration?: number
	className?: string
}

export function TextShimmer({
	children,
	as: Comp = "span",
	duration = 2.5,
	className,
}: TextShimmerProps) {
	return (
		<Comp
			className={cn("inline-block text-shimmer", className)}
			data-slot="text-shimmer"
			style={{ "--text-shimmer-duration": `${duration}s` } as CSSProperties}
		>
			{children}
		</Comp>
	)
}
