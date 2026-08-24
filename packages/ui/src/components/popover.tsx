"use client"

import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import {
	createContext,
	type ReactElement,
	type ReactNode,
	useContext,
	useMemo,
} from "react"

import { POPUP_CLASS } from "@workspace/ui/components/settings-styles"
import { cn } from "@workspace/ui/lib/utils"

export type Side = "top" | "bottom"
export type Align = "start" | "center" | "end"
export type TriggerMode = "click" | "hover"

const HOVER_CLOSE_DELAY = 120

const ANCHOR_ONLY = { side: "none", align: "none" } as const

interface PopoverContextValue {
	triggerMode: TriggerMode
	side: Side
	align: Align
	sideOffset: number
	panelRadius: number
}

const PopoverContext = createContext<PopoverContextValue | null>(null)

function usePopoverContext(component: string) {
	const context = useContext(PopoverContext)
	if (!context) throw new Error(`${component} must be used within <Popover>`)
	return context
}

export interface PopoverProps {
	children: ReactNode
	open?: boolean
	defaultOpen?: boolean
	onOpenChange?: (open: boolean) => void
	trigger?: TriggerMode
	side?: Side
	align?: Align
	sideOffset?: number
	panelRadius?: number
	className?: string
}

export function Popover({
	children,
	open,
	defaultOpen,
	onOpenChange,
	trigger = "click",
	side = "bottom",
	align = "center",
	sideOffset = 14,
	panelRadius = 16,
	className,
}: PopoverProps) {
	const context = useMemo<PopoverContextValue>(
		() => ({ triggerMode: trigger, side, align, sideOffset, panelRadius }),
		[trigger, side, align, sideOffset, panelRadius],
	)

	return (
		<PopoverPrimitive.Root
			open={open}
			defaultOpen={defaultOpen}
			modal={false}
			onOpenChange={(next) => onOpenChange?.(next)}
		>
			<PopoverContext.Provider value={context}>
				<div className={cn("relative inline-flex isolate", className)}>
					{children}
				</div>
			</PopoverContext.Provider>
		</PopoverPrimitive.Root>
	)
}

export interface PopoverTriggerProps {
	children: ReactElement
}

export function PopoverTrigger({ children }: PopoverTriggerProps) {
	const { triggerMode } = usePopoverContext("PopoverTrigger")
	const onHover = triggerMode === "hover"

	return (
		<PopoverPrimitive.Trigger
			render={children}
			openOnHover={onHover}
			closeDelay={onHover ? HOVER_CLOSE_DELAY : undefined}
		/>
	)
}

export interface PopoverContentProps {
	children: ReactNode
	className?: string
	"aria-label"?: string
}

export function PopoverContent({
	children,
	className,
	"aria-label": ariaLabel,
}: PopoverContentProps) {
	const { side, align, sideOffset, panelRadius } =
		usePopoverContext("PopoverContent")

	return (
		<PopoverPrimitive.Portal>
			<PopoverPrimitive.Positioner
				side={side}
				align={align}
				sideOffset={sideOffset}
				collisionAvoidance={ANCHOR_ONLY}
				className="z-50 outline-none"
			>
				<PopoverPrimitive.Popup
					aria-label={ariaLabel}
					style={{ borderRadius: panelRadius }}
					className={cn(
						POPUP_CLASS,
						"w-max max-w-[min(92vw,20rem)] p-4",
						className,
					)}
				>
					{children}
				</PopoverPrimitive.Popup>
			</PopoverPrimitive.Positioner>
		</PopoverPrimitive.Portal>
	)
}
