"use client"

import { type HTMLMotionProps, motion, useReducedMotion } from "motion/react"
import {
	type AriaAttributes,
	type ButtonHTMLAttributes,
	type CSSProperties,
	createContext,
	forwardRef,
	type HTMLAttributes,
	type MouseEvent,
	type KeyboardEvent as ReactKeyboardEvent,
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
	type Ref,
	type RefObject,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { useMediaQuery } from "@workspace/ui/hooks/use-media-query"
import {
	EASE_DRAWER,
	SPRING_LAYOUT,
	TRANSITION_NONE,
	TWEEN_REDUCED,
} from "@workspace/ui/lib/ease"
import { cn, mergeRefs } from "@workspace/ui/lib/utils"

export type AnimatedSidebarState = "expanded" | "collapsed"
export type AnimatedSidebarSide = "left" | "right"
export type AnimatedSidebarVariant = "sidebar" | "floating" | "inset"
export type AnimatedSidebarCollapsible = "offcanvas" | "icon" | "none"

const MOBILE_QUERY = "(max-width: 767px)"
export const SIDEBAR_DEFAULT_WIDTH = 304
export const SIDEBAR_MIN_WIDTH = 192
export const SIDEBAR_MAX_WIDTH = 416
export const SIDEBAR_WIDTH_STEP = 16
const SIDEBAR_KEYBOARD_SHORTCUT = "b"
const SIDEBAR_KEYBOARD_SHORTCUT_UPPER = "B"

const PANEL_TRANSITION = {
	duration: 0.36,
	ease: EASE_DRAWER,
} as const

const SIDEBAR_MORPH_TRANSITION = {
	type: "spring",
	stiffness: 380,
	damping: 35,
	mass: 0.75,
} as const

const FOCUSABLE_SELECTOR = [
	"a[href]",
	"button:not([disabled])",
	"input:not([disabled])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"[tabindex]:not([tabindex='-1'])",
].join(",")

const useIsMobile = () => useMediaQuery(MOBILE_QUERY)

const clampSidebarWidth = (width: number) =>
	Math.round(Math.min(Math.max(width, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH))

interface AnimatedSidebarContextValue {
	commitWidth: (width: number) => void
	defaultWidth: number
	isMobile: boolean
	isResizable: boolean
	open: boolean
	openMobile: boolean
	reduce: boolean
	resizeTo: (width: number) => void
	resizing: boolean
	setOpen: (open: boolean) => void
	setOpenMobile: (open: boolean) => void
	state: AnimatedSidebarState
	toggleSidebar: () => void
	triggerRef: RefObject<HTMLButtonElement | null>
	width: number
}

const AnimatedSidebarContext =
	createContext<AnimatedSidebarContextValue | null>(null)

interface AnimatedSidebarPanelContextValue {
	collapsed: boolean
	collapsible: AnimatedSidebarCollapsible
	side: AnimatedSidebarSide
}

const AnimatedSidebarPanelContext =
	createContext<AnimatedSidebarPanelContextValue | null>(null)

export function useAnimatedSidebar() {
	const context = useContext(AnimatedSidebarContext)
	if (!context) {
		throw new Error(
			"useAnimatedSidebar must be used inside AnimatedSidebarProvider.",
		)
	}
	return context
}

function useAnimatedSidebarPanel() {
	const context = useContext(AnimatedSidebarPanelContext)
	if (!context) {
		throw new Error(
			"Animated Sidebar parts must be used inside AnimatedSidebar.",
		)
	}
	return context
}

type SidebarProviderStyle = CSSProperties & {
	"--sidebar-width"?: string
	"--sidebar-width-icon"?: string
	"--sidebar-width-mobile"?: string
}

export interface AnimatedSidebarProviderProps
	extends HTMLAttributes<HTMLDivElement> {
	open?: boolean
	defaultOpen?: boolean
	onOpenChange?: (open: boolean) => void
	openMobile?: boolean
	defaultOpenMobile?: boolean
	onOpenMobileChange?: (open: boolean) => void
	width?: number
	defaultWidth?: number
	onWidthChange?: (width: number) => void
	isResizable?: boolean
	style?: SidebarProviderStyle
}

export function AnimatedSidebarProvider({
	children,
	open,
	defaultOpen = true,
	onOpenChange,
	openMobile,
	defaultOpenMobile = false,
	onOpenMobileChange,
	width,
	defaultWidth = SIDEBAR_DEFAULT_WIDTH,
	onWidthChange,
	isResizable = true,
	className,
	style,
	...props
}: AnimatedSidebarProviderProps) {
	const [internalOpen, setInternalOpen] = useState(defaultOpen)
	const [internalOpenMobile, setInternalOpenMobile] =
		useState(defaultOpenMobile)
	const boundedDefaultWidth = clampSidebarWidth(defaultWidth)
	const [internalWidth, setInternalWidth] = useState(boundedDefaultWidth)
	const [draftWidth, setDraftWidth] = useState<number | null>(null)
	const isMobile = useIsMobile()
	const reduce = useReducedMotion() ?? false
	const triggerRef = useRef<HTMLButtonElement>(null)
	const desktopOpen = open ?? internalOpen
	const mobileOpen = openMobile ?? internalOpenMobile
	const resizing = draftWidth !== null
	const widthInForce = draftWidth ?? clampSidebarWidth(width ?? internalWidth)

	const resizeTo = useCallback((nextWidth: number) => {
		setDraftWidth(clampSidebarWidth(nextWidth))
	}, [])

	const commitWidth = useCallback(
		(nextWidth: number) => {
			const bounded = clampSidebarWidth(nextWidth)
			setDraftWidth(null)
			if (width === undefined) setInternalWidth(bounded)
			onWidthChange?.(bounded)
		},
		[onWidthChange, width],
	)

	const setOpen = useCallback(
		(nextOpen: boolean) => {
			if (open === undefined) setInternalOpen(nextOpen)
			onOpenChange?.(nextOpen)
		},
		[onOpenChange, open],
	)

	const setOpenMobile = useCallback(
		(nextOpen: boolean) => {
			if (openMobile === undefined) setInternalOpenMobile(nextOpen)
			onOpenMobileChange?.(nextOpen)
		},
		[onOpenMobileChange, openMobile],
	)

	const toggleSidebar = useCallback(() => {
		if (isMobile) setOpenMobile(!mobileOpen)
		else setOpen(!desktopOpen)
	}, [desktopOpen, isMobile, mobileOpen, setOpen, setOpenMobile])

	const toggleSidebarRef = useRef(toggleSidebar)
	toggleSidebarRef.current = toggleSidebar

	useEffect(() => {
		const handleShortcut = (event: KeyboardEvent) => {
			if (!event.metaKey && !event.ctrlKey) return
			if (
				event.key !== SIDEBAR_KEYBOARD_SHORTCUT &&
				event.key !== SIDEBAR_KEYBOARD_SHORTCUT_UPPER
			) {
				return
			}
			event.preventDefault()
			toggleSidebarRef.current()
		}

		window.addEventListener("keydown", handleShortcut)
		return () => window.removeEventListener("keydown", handleShortcut)
	}, [])

	const widthStyle: SidebarProviderStyle = {
		...style,
		"--sidebar-width": `${widthInForce}px`,
	}

	const contextValue = useMemo<AnimatedSidebarContextValue>(
		() => ({
			commitWidth,
			defaultWidth: boundedDefaultWidth,
			isMobile,
			isResizable,
			open: desktopOpen,
			openMobile: mobileOpen,
			reduce,
			resizeTo,
			resizing,
			setOpen,
			setOpenMobile,
			state: desktopOpen ? "expanded" : "collapsed",
			toggleSidebar,
			triggerRef,
			width: widthInForce,
		}),
		[
			boundedDefaultWidth,
			commitWidth,
			desktopOpen,
			isMobile,
			isResizable,
			mobileOpen,
			reduce,
			resizeTo,
			resizing,
			setOpen,
			setOpenMobile,
			toggleSidebar,
			widthInForce,
		],
	)

	return (
		<AnimatedSidebarContext.Provider value={contextValue}>
			<div
				data-slot="sidebar-wrapper"
				{...props}
				data-state={desktopOpen ? "expanded" : "collapsed"}
				data-resizing={resizing}
				style={widthStyle}
				className={cn(
					"group/sidebar-wrapper flex h-svh w-full min-w-0 overflow-hidden",
					"data-[resizing=true]:cursor-col-resize data-[resizing=true]:select-none",
					className,
				)}
			>
				{children}
			</div>
		</AnimatedSidebarContext.Provider>
	)
}

interface MobileSidebarProps extends SidebarAsideAttributes {
	ariaLabel: string
	children: ReactNode
	forwardedRef?: Ref<HTMLElement>
	panelClassName?: string
	side: AnimatedSidebarSide
}

interface DrawerOffsetParams {
	open: boolean
	reduce: boolean
	side: AnimatedSidebarSide
}

const drawerOffset = ({ open, reduce, side }: DrawerOffsetParams) => {
	if (reduce) return 0
	if (open) return "0%"
	return side === "left" ? "-100%" : "100%"
}

function MobileSidebar({
	ariaLabel,
	children,
	className,
	forwardedRef,
	panelClassName,
	side,
	...props
}: MobileSidebarProps) {
	const { t } = useTranslation("common")
	const context = useAnimatedSidebar()
	const panelRef = useRef<HTMLDivElement>(null)
	const drawerTransition = context.reduce ? TWEEN_REDUCED : PANEL_TRANSITION

	useEffect(() => {
		if (!context.openMobile) return

		const body = document.body
		const scrollY = window.scrollY
		const previousBodyStyles = {
			left: body.style.left,
			overflow: body.style.overflow,
			position: body.style.position,
			right: body.style.right,
			top: body.style.top,
		}

		body.style.position = "fixed"
		body.style.top = `-${scrollY}px`
		body.style.left = "0"
		body.style.right = "0"
		body.style.overflow = "hidden"

		const focusFrame = requestAnimationFrame(() => {
			const firstFocusable =
				panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
			;(firstFocusable ?? panelRef.current)?.focus({ preventScroll: true })
		})

		return () => {
			cancelAnimationFrame(focusFrame)
			body.style.position = previousBodyStyles.position
			body.style.top = previousBodyStyles.top
			body.style.left = previousBodyStyles.left
			body.style.right = previousBodyStyles.right
			body.style.overflow = previousBodyStyles.overflow
			window.scrollTo(0, scrollY)
			context.triggerRef.current?.focus({ preventScroll: true })
		}
	}, [context.openMobile, context.triggerRef])

	const panelContextValue = useMemo<AnimatedSidebarPanelContextValue>(
		() => ({ collapsed: false, collapsible: "none", side }),
		[side],
	)

	const handlePanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		if (event.key === "Escape") {
			event.preventDefault()
			context.setOpenMobile(false)
			return
		}

		if (event.key !== "Tab") return
		const focusable = panelRef.current
			? Array.from(
					panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
				)
			: []

		if (focusable.length === 0) {
			event.preventDefault()
			panelRef.current?.focus()
			return
		}

		const first = focusable[0]
		const last = focusable[focusable.length - 1]
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault()
			last.focus()
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault()
			first.focus()
		}
	}

	return createPortal(
		<div
			data-slot="sidebar-mobile-layer"
			style={{
				transitionDuration: context.openMobile
					? "0s"
					: `${drawerTransition.duration}s`,
			}}
			className={cn(
				"pointer-events-none fixed inset-0 z-50 transition-[visibility] md:hidden",
				context.openMobile ? "visible" : "invisible",
			)}
		>
			<button
				type="button"
				aria-label={t("sidebar.close")}
				tabIndex={context.openMobile ? 0 : -1}
				onClick={() => context.setOpenMobile(false)}
				data-slot="sidebar-mobile-overlay"
				className={cn(
					"absolute inset-0 bg-black/50",
					context.openMobile ? "pointer-events-auto" : "pointer-events-none",
				)}
			/>

			<motion.div
				{...props}
				ref={mergeRefs<HTMLElement>(panelRef, forwardedRef)}
				role="dialog"
				aria-modal="true"
				aria-label={ariaLabel}
				aria-hidden={!context.openMobile}
				inert={!context.openMobile}
				tabIndex={-1}
				data-slot="sidebar-mobile-panel"
				data-mobile="true"
				data-state={context.openMobile ? "expanded" : "collapsed"}
				data-side={side}
				initial={false}
				animate={{
					x: drawerOffset({
						open: context.openMobile,
						reduce: context.reduce,
						side,
					}),
				}}
				transition={drawerTransition}
				onKeyDown={handlePanelKeyDown}
				className={cn(
					"pointer-events-auto absolute inset-y-0 flex h-dvh w-(--sidebar-width-mobile) max-w-[88vw] flex-col overflow-hidden",
					"border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl will-change-transform",
					side === "left" ? "left-0 border-r" : "right-0 border-l",
					!context.openMobile && "pointer-events-none",
					className,
					panelClassName,
				)}
			>
				<AnimatedSidebarPanelContext.Provider value={panelContextValue}>
					{children}
				</AnimatedSidebarPanelContext.Provider>
			</motion.div>
		</div>,
		document.body,
	)
}

type SidebarAsideAttributes = Omit<
	HTMLAttributes<HTMLElement>,
	"children" | "onAnimationStart" | "onDrag" | "onDragStart" | "onDragEnd"
>

export interface AnimatedSidebarProps extends SidebarAsideAttributes {
	children?: ReactNode
	side?: AnimatedSidebarSide
	variant?: AnimatedSidebarVariant
	collapsible?: AnimatedSidebarCollapsible
	ariaLabel?: string
	panelClassName?: string
}

interface SidebarResizeHandleProps {
	side: AnimatedSidebarSide
}

const SidebarResizeHandle = ({ side }: SidebarResizeHandleProps) => {
	const { t } = useTranslation("common")
	const context = useAnimatedSidebar()
	const towardsWider = side === "left" ? 1 : -1

	const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return
		const originX = event.clientX
		const originWidth = context.width
		const widthAt = (clientX: number) =>
			originWidth + towardsWider * (clientX - originX)

		let followedWidth: number | null = null

		const stream = new AbortController()
		const { signal } = stream

		const follow = (move: PointerEvent) => {
			followedWidth = widthAt(move.clientX)
			context.resizeTo(followedWidth)
		}
		const endAt = (width: number | null) => {
			stream.abort()
			if (width !== null) context.commitWidth(width)
		}

		window.addEventListener("pointermove", follow, { signal })
		window.addEventListener(
			"pointerup",
			(up: PointerEvent) =>
				endAt(followedWidth === null ? null : widthAt(up.clientX)),
			{ signal },
		)
		window.addEventListener("pointercancel", () => endAt(followedWidth), {
			signal,
		})
	}

	const stepWidth = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
		event.preventDefault()
		const step = event.key === "ArrowRight" ? towardsWider : -towardsWider
		context.commitWidth(context.width + step * SIDEBAR_WIDTH_STEP)
	}

	return (
		<div
			role="separator"
			aria-orientation="vertical"
			aria-label={t("sidebar.resize")}
			aria-valuenow={context.width}
			aria-valuemin={SIDEBAR_MIN_WIDTH}
			aria-valuemax={SIDEBAR_MAX_WIDTH}
			tabIndex={0}
			data-slot="sidebar-resize-handle"
			data-side={side}
			data-tauri-drag-region="false"
			onPointerDown={startResize}
			onDoubleClick={() => context.commitWidth(context.defaultWidth)}
			onKeyDown={stepWidth}
			className={cn(
				"absolute inset-y-0 z-30 hidden w-2 cursor-col-resize touch-none outline-none md:block",
				"data-[side=left]:-end-1 data-[side=right]:-start-1",
				"after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent",
				"hover:after:bg-sidebar-ring focus-visible:after:w-0.5 focus-visible:after:bg-sidebar-ring",
			)}
		/>
	)
}

export const AnimatedSidebar = forwardRef<HTMLElement, AnimatedSidebarProps>(
	function AnimatedSidebar(
		{
			side = "left",
			variant = "sidebar",
			collapsible = "icon",
			ariaLabel,
			children,
			className,
			panelClassName,
			style,
			...props
		},
		forwardedRef,
	) {
		const { t } = useTranslation("common")
		const context = useAnimatedSidebar()
		const label = ariaLabel ?? t("sidebar.label")
		const collapsed = collapsible !== "none" && !context.open
		const offcanvas = collapsed && collapsible === "offcanvas"
		const width = offcanvas
			? "0px"
			: collapsed
				? "var(--sidebar-width-icon)"
				: "var(--sidebar-width)"

		const panelContextValue = useMemo<AnimatedSidebarPanelContextValue>(
			() => ({ collapsed, collapsible, side }),
			[collapsed, collapsible, side],
		)

		if (context.isMobile) {
			return (
				<MobileSidebar
					{...props}
					ariaLabel={label}
					className={className}
					forwardedRef={forwardedRef}
					panelClassName={panelClassName}
					side={side}
					style={style}
				>
					{children}
				</MobileSidebar>
			)
		}

		return (
			<motion.aside
				{...props}
				ref={forwardedRef}
				initial={false}
				aria-label={label}
				data-slot="sidebar"
				data-state={collapsed ? "collapsed" : "expanded"}
				data-collapsible={collapsible}
				data-variant={variant}
				data-side={side}
				animate={{ width }}
				transition={
					context.resizing || context.reduce
						? TRANSITION_NONE
						: SIDEBAR_MORPH_TRANSITION
				}
				style={style}
				className={cn(
					"group/sidebar relative hidden h-auto shrink-0 will-change-[width] md:block",
					"peer",
					side === "right" && "order-last",
					className,
				)}
			>
				<motion.div
					initial={false}
					animate={{
						x: offcanvas ? (side === "left" ? "-100%" : "100%") : "0%",
					}}
					transition={context.reduce ? TRANSITION_NONE : PANEL_TRANSITION}
					data-slot="sidebar-panel"
					className={cn(
						"sticky top-0 flex h-svh w-full flex-col overflow-hidden bg-sidebar text-sidebar-foreground",
						collapsible === "offcanvas" && "w-(--sidebar-width)",
						variant === "sidebar" &&
							(side === "left"
								? "border-sidebar-border border-r"
								: "border-sidebar-border border-l"),
						variant === "floating" &&
							"m-2 h-[calc(100svh-1rem)] rounded-2xl border border-sidebar-border shadow-sm",
						variant === "inset" && "m-2 h-[calc(100svh-1rem)] rounded-2xl",
						panelClassName,
					)}
				>
					<AnimatedSidebarPanelContext.Provider value={panelContextValue}>
						{children}
					</AnimatedSidebarPanelContext.Provider>
				</motion.div>
				{collapsed || !context.isResizable ? null : (
					<SidebarResizeHandle side={side} />
				)}
			</motion.aside>
		)
	},
)

export type AnimatedSidebarTriggerProps =
	ButtonHTMLAttributes<HTMLButtonElement>

export const AnimatedSidebarTrigger = forwardRef<
	HTMLButtonElement,
	AnimatedSidebarTriggerProps
>(function AnimatedSidebarTrigger(
	{ className, onClick, type = "button", ...props },
	forwardedRef,
) {
	const { t } = useTranslation("common")
	const context = useAnimatedSidebar()
	const expanded = context.isMobile ? context.openMobile : context.open

	return (
		<button
			{...props}
			ref={mergeRefs<HTMLButtonElement>(forwardedRef, (node) => {
				context.triggerRef.current = node
			})}
			type={type}
			aria-label={props["aria-label"] ?? t("sidebar.toggle")}
			aria-expanded={expanded}
			data-slot="sidebar-trigger"
			data-state={expanded ? "expanded" : "collapsed"}
			onClick={(event) => {
				onClick?.(event)
				if (!event.defaultPrevented) context.toggleSidebar()
			}}
			className={cn(
				"inline-flex size-10 shrink-0 items-center justify-center rounded-xl outline-none",
				"focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
				className,
			)}
		/>
	)
})

export type AnimatedSidebarInsetProps = HTMLMotionProps<"main">

export const AnimatedSidebarInset = forwardRef<
	HTMLElement,
	AnimatedSidebarInsetProps
>(function AnimatedSidebarInset({ className, ...props }, forwardedRef) {
	return (
		<motion.main
			{...props}
			ref={forwardedRef}
			data-slot="sidebar-inset"
			className={cn(
				"relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background",
				"md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-2xl md:peer-data-[variant=inset]:shadow-sm",
				className,
			)}
		/>
	)
})

export const AnimatedSidebarHeader = forwardRef<
	HTMLDivElement,
	HTMLAttributes<HTMLDivElement>
>(function AnimatedSidebarHeader({ className, ...props }, forwardedRef) {
	return (
		<div
			{...props}
			ref={forwardedRef}
			data-slot="sidebar-header"
			className={cn("flex shrink-0 flex-col gap-2 p-3", className)}
		/>
	)
})

export const AnimatedSidebarContent = forwardRef<
	HTMLDivElement,
	HTMLAttributes<HTMLDivElement>
>(function AnimatedSidebarContent({ className, ...props }, forwardedRef) {
	return (
		<div
			{...props}
			ref={forwardedRef}
			data-slot="sidebar-content"
			className={cn(
				"flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden overscroll-contain px-2 py-2",
				className,
			)}
		/>
	)
})

export const AnimatedSidebarFooter = forwardRef<
	HTMLDivElement,
	HTMLAttributes<HTMLDivElement>
>(function AnimatedSidebarFooter({ className, ...props }, forwardedRef) {
	return (
		<div
			{...props}
			ref={forwardedRef}
			data-slot="sidebar-footer"
			className={cn(
				"flex shrink-0 flex-col gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
				className,
			)}
		/>
	)
})

export const AnimatedSidebarGroup = forwardRef<
	HTMLDivElement,
	HTMLAttributes<HTMLDivElement>
>(function AnimatedSidebarGroup({ className, ...props }, forwardedRef) {
	return (
		<div
			{...props}
			ref={forwardedRef}
			data-slot="sidebar-group"
			className={cn("flex w-full min-w-0 flex-col px-1 py-1.5", className)}
		/>
	)
})

export const AnimatedSidebarGroupLabel = forwardRef<
	HTMLDivElement,
	HTMLAttributes<HTMLDivElement>
>(function AnimatedSidebarGroupLabel(
	{ children, className, ...props },
	forwardedRef,
) {
	const { collapsed } = useAnimatedSidebarPanel()

	return (
		<div
			{...props}
			ref={forwardedRef}
			aria-hidden={collapsed}
			data-slot="sidebar-group-label"
			className={cn(
				"mb-1 h-7 overflow-hidden px-2 font-medium text-[10px] text-sidebar-foreground/70 uppercase tracking-[0.14em]",
				collapsed && "mb-0 h-0 w-0 px-0",
				className,
			)}
		>
			{children}
		</div>
	)
})

export const AnimatedSidebarGroupContent = forwardRef<
	HTMLDivElement,
	HTMLAttributes<HTMLDivElement>
>(function AnimatedSidebarGroupContent({ className, ...props }, forwardedRef) {
	return (
		<div
			{...props}
			ref={forwardedRef}
			data-slot="sidebar-group-content"
			className={cn("w-full min-w-0", className)}
		/>
	)
})

export const AnimatedSidebarMenu = forwardRef<
	HTMLUListElement,
	HTMLAttributes<HTMLUListElement>
>(function AnimatedSidebarMenu(
	{ children, className, ...props },
	forwardedRef,
) {
	return (
		<motion.ul
			{...(props as HTMLMotionProps<"ul">)}
			ref={forwardedRef}
			layoutRoot
			data-slot="sidebar-menu"
			className={cn(
				"flex w-full min-w-0 list-none flex-col gap-0.5",
				className,
			)}
		>
			{children}
		</motion.ul>
	)
})

export const AnimatedSidebarMenuItem = forwardRef<
	HTMLLIElement,
	HTMLMotionProps<"li">
>(function AnimatedSidebarMenuItem({ className, ...props }, forwardedRef) {
	const { reduce } = useAnimatedSidebar()

	return (
		<motion.li
			{...props}
			ref={forwardedRef}
			layout="position"
			transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
			data-slot="sidebar-menu-item"
			className={cn("relative", className)}
		/>
	)
})

type MenuButtonElementProps = AriaAttributes &
	Pick<
		HTMLAttributes<HTMLElement>,
		| "onContextMenu"
		| "onKeyDown"
		| "onPointerCancel"
		| "onPointerDown"
		| "onPointerMove"
		| "onPointerUp"
	>

export interface AnimatedSidebarMenuButtonProps extends MenuButtonElementProps {
	ref?: Ref<HTMLElement>
	children: ReactNode
	icon?: ReactNode
	isIconDecorative?: boolean
	label?: string
	href?: string
	isActive?: boolean
	ariaExpanded?: boolean
	disabled?: boolean
	closeOnSelect?: boolean
	target?: "_blank" | "_self" | "_parent" | "_top"
	rel?: string
	onSelect?: () => void
	className?: string
}

export function AnimatedSidebarMenuButton({
	children,
	icon,
	isIconDecorative = true,
	label,
	href,
	isActive = false,
	ariaExpanded,
	disabled = false,
	closeOnSelect,
	target,
	rel,
	onSelect,
	className,
	ref,
	...elementProps
}: AnimatedSidebarMenuButtonProps) {
	const context = useAnimatedSidebar()
	const panel = useAnimatedSidebarPanel()
	const textLabel =
		label ?? (typeof children === "string" ? children : undefined)

	const select = (event: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
		if (disabled) {
			event.preventDefault()
			return
		}
		onSelect?.()
		const shouldCloseOnSelect = closeOnSelect ?? ariaExpanded === undefined
		if (context.isMobile && shouldCloseOnSelect) {
			context.setOpenMobile(false)
		}
	}

	const content = (
		<>
			{icon ? (
				<span
					aria-hidden={isIconDecorative || undefined}
					className="relative z-10 grid min-h-5 min-w-5 shrink-0 place-items-center"
				>
					{icon}
				</span>
			) : null}
			<span
				aria-hidden={panel.collapsed}
				className={cn(
					"relative z-10 min-w-0 flex-1 truncate",
					panel.collapsed && "w-0 flex-none pointer-events-none",
				)}
			>
				{children}
			</span>
			{ariaExpanded !== undefined ? (
				<motion.span
					aria-hidden="true"
					initial={false}
					animate={{ rotate: ariaExpanded ? 90 : 0 }}
					transition={context.reduce ? { duration: 0 } : SPRING_LAYOUT}
					className={cn(
						"relative z-10 grid shrink-0 place-items-center text-sidebar-foreground/70",
						panel.collapsed ? "h-4 w-0" : "size-4",
					)}
				>
					<Icons.Next className="size-3.5" />
				</motion.span>
			) : null}
		</>
	)

	const interactiveClassName = cn(
		"relative flex min-h-9 w-full min-w-0 select-none items-center gap-2.5 overflow-hidden rounded-xl text-left font-medium text-sm outline-none",
		"px-3",
		icon && "pl-2",
		"text-sidebar-foreground/70",
		panel.collapsed && "justify-center gap-0 px-0",
		!disabled &&
			"hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
		"focus-visible:bg-sidebar-accent/70 focus-visible:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
		isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
		disabled && "cursor-not-allowed opacity-40",
		className,
	)

	return href ? (
		<a
			href={href}
			ref={ref as Ref<HTMLAnchorElement>}
			target={target}
			rel={rel ?? (target === "_blank" ? "noreferrer noopener" : undefined)}
			aria-current={isActive ? "page" : undefined}
			aria-expanded={ariaExpanded}
			aria-disabled={disabled || undefined}
			aria-label={panel.collapsed ? textLabel : undefined}
			title={panel.collapsed ? textLabel : undefined}
			tabIndex={disabled ? -1 : undefined}
			data-slot="sidebar-menu-button"
			onClick={select}
			className={interactiveClassName}
			{...elementProps}
		>
			{content}
		</a>
	) : (
		<button
			type="button"
			ref={ref as Ref<HTMLButtonElement>}
			disabled={disabled}
			aria-current={isActive ? "page" : undefined}
			aria-expanded={ariaExpanded}
			aria-label={panel.collapsed ? textLabel : undefined}
			title={panel.collapsed ? textLabel : undefined}
			data-slot="sidebar-menu-button"
			onClick={select}
			className={interactiveClassName}
			{...elementProps}
		>
			{content}
		</button>
	)
}
