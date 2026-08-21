"use client"

import {
	AnimatePresence,
	type HTMLMotionProps,
	motion,
	useReducedMotion,
	type Variants,
} from "motion/react"
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
	EASE_OUT,
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
const SIDEBAR_KEYBOARD_SHORTCUT = "b"
const SIDEBAR_KEYBOARD_SHORTCUT_UPPER = "B"

const PANEL_TRANSITION = {
	duration: 0.36,
	ease: EASE_DRAWER,
} as const

// The desktop rail settles at a hard zero-width boundary. Keep the spring
// critically damped so it cannot overshoot, pause against that boundary, and
// then snap back during the final frame.
const SIDEBAR_MORPH_TRANSITION = {
	type: "spring",
	stiffness: 380,
	damping: 35,
	mass: 0.75,
} as const

const SUBMENU_VARIANTS: Variants = {
	closed: {
		clipPath: "inset(0 0 100% 0 round 8px)",
		transition: {
			duration: 0.14,
			ease: EASE_OUT,
			staggerChildren: 0.025,
			staggerDirection: -1,
		},
	},
	open: {
		clipPath: "inset(0 0 0% 0 round 8px)",
		transition: {
			duration: 0.2,
			delayChildren: 0.035,
			ease: EASE_OUT,
			staggerChildren: 0.045,
		},
	},
}

const SUBMENU_ITEM_VARIANTS: Variants = {
	closed: {
		y: -6,
	},
	open: {
		y: 0,
		transition: { duration: 0.18, ease: EASE_OUT },
	},
}

const FOCUSABLE_SELECTOR = [
	"a[href]",
	"button:not([disabled])",
	"input:not([disabled])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"[tabindex]:not([tabindex='-1'])",
].join(",")

const useIsMobile = () => useMediaQuery(MOBILE_QUERY)

interface AnimatedSidebarContextValue {
	isMobile: boolean
	open: boolean
	openMobile: boolean
	reduce: boolean
	setOpen: (open: boolean) => void
	setOpenMobile: (open: boolean) => void
	state: AnimatedSidebarState
	toggleSidebar: () => void
	triggerRef: RefObject<HTMLButtonElement | null>
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

/** Reads the sidebar state — open, collapsed, mobile — from the nearest provider. */
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
	/** Controlled desktop open state. */
	open?: boolean
	/** Uncontrolled initial desktop open state. */
	defaultOpen?: boolean
	onOpenChange?: (open: boolean) => void
	/** Controlled mobile drawer state. */
	openMobile?: boolean
	/** Uncontrolled initial mobile drawer state. */
	defaultOpenMobile?: boolean
	onOpenMobileChange?: (open: boolean) => void
	/** Override `--sidebar-width`, `--sidebar-width-icon` or `--sidebar-width-mobile`. */
	style?: SidebarProviderStyle
}

/**
 * Owns the open state shared by the sidebar, its trigger and its inset, and
 * lays the shell row out. Binds Cmd/Ctrl+B to the toggle.
 */
export function AnimatedSidebarProvider({
	children,
	open,
	defaultOpen = true,
	onOpenChange,
	openMobile,
	defaultOpenMobile = false,
	onOpenMobileChange,
	className,
	style,
	...props
}: AnimatedSidebarProviderProps) {
	const [internalOpen, setInternalOpen] = useState(defaultOpen)
	const [internalOpenMobile, setInternalOpenMobile] =
		useState(defaultOpenMobile)
	const isMobile = useIsMobile()
	const reduce = useReducedMotion() ?? false
	const triggerRef = useRef<HTMLButtonElement>(null)
	const desktopOpen = open ?? internalOpen
	const mobileOpen = openMobile ?? internalOpenMobile

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

	const contextValue = useMemo<AnimatedSidebarContextValue>(
		() => ({
			isMobile,
			open: desktopOpen,
			openMobile: mobileOpen,
			reduce,
			setOpen,
			setOpenMobile,
			state: desktopOpen ? "expanded" : "collapsed",
			toggleSidebar,
			triggerRef,
		}),
		[
			desktopOpen,
			isMobile,
			mobileOpen,
			reduce,
			setOpen,
			setOpenMobile,
			toggleSidebar,
		],
	)

	return (
		<AnimatedSidebarContext.Provider value={contextValue}>
			<div
				data-slot="sidebar-wrapper"
				{...props}
				data-state={desktopOpen ? "expanded" : "collapsed"}
				style={style}
				className={cn(
					"group/sidebar-wrapper flex min-h-svh w-full min-w-0",
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
		// A `visibility` transition holds `visible` for its whole duration, so the
		// layer only leaves the accessibility tree once the drawer has finished
		// animating out. Opening zeroes it to show it at once.
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

// The panel owns its own animation, so consumers get plain aside attributes
// rather than motion props they would only fight with.
type SidebarAsideAttributes = Omit<
	HTMLAttributes<HTMLElement>,
	"children" | "onAnimationStart" | "onDrag" | "onDragStart" | "onDragEnd"
>

export interface AnimatedSidebarProps extends SidebarAsideAttributes {
	children?: ReactNode
	/** Edge the panel is docked to. */
	side?: AnimatedSidebarSide
	/** `sidebar` sits flush against the inset, `floating` and `inset` detach it. */
	variant?: AnimatedSidebarVariant
	/** `icon` keeps a rail of icons, `offcanvas` slides the panel away, `none` pins it open. */
	collapsible?: AnimatedSidebarCollapsible
	/** Accessible name of the panel landmark and of the mobile dialog. */
	ariaLabel?: string
	/** Class applied to the scrolling panel inside the animated width track. */
	panelClassName?: string
}

/**
 * The panel itself: animates its width between the full and icon rails on
 * desktop, and becomes a focus-trapped drawer below the `md` breakpoint.
 */
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
				transition={context.reduce ? { duration: 0 } : SIDEBAR_MORPH_TRANSITION}
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
			</motion.aside>
		)
	},
)

export type AnimatedSidebarTriggerProps =
	ButtonHTMLAttributes<HTMLButtonElement>

/** Toggles the sidebar and reports the current state through `aria-expanded`. */
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

export type AnimatedSidebarCloseProps = ButtonHTMLAttributes<HTMLButtonElement>

/** Closes the sidebar without reopening it — the drawer's dismiss affordance. */
export const AnimatedSidebarClose = forwardRef<
	HTMLButtonElement,
	AnimatedSidebarCloseProps
>(function AnimatedSidebarClose(
	{ className, onClick, type = "button", ...props },
	forwardedRef,
) {
	const { t } = useTranslation("common")
	const context = useAnimatedSidebar()

	return (
		<button
			{...props}
			ref={forwardedRef}
			type={type}
			aria-label={props["aria-label"] ?? t("sidebar.close")}
			data-slot="sidebar-close"
			onClick={(event) => {
				onClick?.(event)
				if (event.defaultPrevented) return
				if (context.isMobile) context.setOpenMobile(false)
				else context.setOpen(false)
			}}
			className={cn(
				"inline-flex size-10 shrink-0 items-center justify-center rounded-xl outline-none",
				"focus-visible:ring-2 focus-visible:ring-sidebar-ring",
				className,
			)}
		/>
	)
})

export type AnimatedSidebarRailProps = ButtonHTMLAttributes<HTMLButtonElement>

/**
 * The hairline seam along the panel edge, dragged or clicked to toggle. Kept
 * out of the tab order on purpose — the trigger is the keyboard path.
 */
export const AnimatedSidebarRail = forwardRef<
	HTMLButtonElement,
	AnimatedSidebarRailProps
>(function AnimatedSidebarRail(
	{ className, onClick, type = "button", ...props },
	forwardedRef,
) {
	const { t } = useTranslation("common")
	const context = useAnimatedSidebar()
	const panel = useAnimatedSidebarPanel()

	return (
		<button
			{...props}
			ref={forwardedRef}
			type={type}
			data-slot="sidebar-rail"
			data-side={panel.side}
			aria-label={props["aria-label"] ?? t("sidebar.toggle")}
			title={t("sidebar.toggle")}
			tabIndex={-1}
			onClick={(event) => {
				onClick?.(event)
				if (!event.defaultPrevented) context.toggleSidebar()
			}}
			className={cn(
				"absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 outline-none md:block",
				"after:absolute after:inset-y-0 after:left-1/2 after:w-px after:bg-transparent hover:after:bg-sidebar-border",
				"data-[side=right]:right-0 data-[side=right]:translate-x-1/2 data-[side=left]:left-full",
				className,
			)}
		/>
	)
})

export type AnimatedSidebarInsetProps = HTMLMotionProps<"main">

/** The page area beside the sidebar. Reacts to `variant="inset"` through the peer selector. */
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
				"relative flex min-h-svh min-w-0 flex-1 flex-col bg-background",
				"md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-2xl md:peer-data-[variant=inset]:shadow-sm",
				className,
			)}
		/>
	)
})

/** Pinned top region of the panel — brand, trigger, search. */
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

/** The single scrolling region between header and footer. */
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

/** Pinned bottom region of the panel — account, settings, status. */
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
				"flex shrink-0 flex-col gap-2 border-sidebar-border border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
				className,
			)}
		/>
	)
})

/** One labelled section of the content region. */
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

/** Section heading. Fades out, gives up its box and leaves the accessibility tree once collapsed. */
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

/** Body of a group, below its label. */
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

/**
 * The list. `layoutRoot` keeps it the projection parent of the layout
 * animations its rows own — the active pill and the row reflow — so a scrolled
 * ancestor can't smear its offset into their movement.
 */
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

/** One row of the menu, holding a button and optionally its submenu. */
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

export interface AnimatedSidebarMenuSubProps
	extends Omit<HTMLMotionProps<"ul">, "children"> {
	/** Disclosure state driven by the parent menu button. */
	open: boolean
	children?: ReactNode
}

/** Nested list revealed under a menu button. Stays closed while the panel is collapsed. */
export const AnimatedSidebarMenuSub = forwardRef<
	HTMLUListElement,
	AnimatedSidebarMenuSubProps
>(function AnimatedSidebarMenuSub(
	{ open, children, className, ...props },
	forwardedRef,
) {
	const context = useAnimatedSidebar()
	const panel = useAnimatedSidebarPanel()

	return (
		<AnimatePresence initial={false}>
			{open && !panel.collapsed ? (
				<motion.ul
					{...props}
					ref={forwardedRef}
					key="sidebar-submenu"
					variants={context.reduce ? undefined : SUBMENU_VARIANTS}
					initial="closed"
					animate="open"
					exit="closed"
					data-slot="sidebar-menu-sub"
					className={cn(
						"relative mt-1 ml-5 flex min-w-0 flex-col gap-0.5 border-sidebar-border border-l pl-3",
						className,
					)}
				>
					{children}
				</motion.ul>
			) : null}
		</AnimatePresence>
	)
})

/** One row of a submenu. */
export const AnimatedSidebarMenuSubItem = forwardRef<
	HTMLLIElement,
	HTMLMotionProps<"li">
>(function AnimatedSidebarMenuSubItem({ className, ...props }, forwardedRef) {
	return (
		<motion.li
			{...props}
			ref={forwardedRef}
			variants={SUBMENU_ITEM_VARIANTS}
			data-slot="sidebar-menu-sub-item"
			className={cn("relative min-w-0", className)}
		/>
	)
})

export interface AnimatedSidebarMenuSubButtonProps {
	children: ReactNode
	/** Leading glyph. Falls back to a dot so rows stay aligned. */
	icon?: ReactNode
	/** Renders an anchor instead of a button. */
	href?: string
	/** Marks the row as the current page. */
	isActive?: boolean
	disabled?: boolean
	/** Dismiss the mobile drawer on select. Default `true`. */
	closeOnSelect?: boolean
	target?: "_blank" | "_self" | "_parent" | "_top"
	rel?: string
	onSelect?: () => void
	className?: string
}

/** Interactive row of a submenu, rendered as a link when `href` is given. */
export function AnimatedSidebarMenuSubButton({
	children,
	icon,
	href,
	isActive = false,
	disabled = false,
	closeOnSelect = true,
	target,
	rel,
	onSelect,
	className,
}: AnimatedSidebarMenuSubButtonProps) {
	const context = useAnimatedSidebar()

	const select = (event: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
		if (disabled) {
			event.preventDefault()
			return
		}
		onSelect?.()
		if (context.isMobile && closeOnSelect) context.setOpenMobile(false)
	}

	const content = (
		<>
			<span
				aria-hidden="true"
				className="grid size-4 shrink-0 place-items-center"
			>
				{icon ?? <span className="size-1 rounded-full bg-current" />}
			</span>
			<span className="min-w-0 flex-1 truncate">{children}</span>
		</>
	)

	const interactiveClassName = cn(
		"flex min-h-8 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left text-xs outline-none",
		"text-sidebar-foreground/70",
		!disabled &&
			"hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
		"focus-visible:bg-sidebar-accent/70 focus-visible:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
		isActive && "bg-sidebar-accent/70 text-sidebar-accent-foreground",
		disabled && "cursor-not-allowed opacity-40",
		className,
	)

	return href ? (
		<a
			href={href}
			target={target}
			rel={rel ?? (target === "_blank" ? "noreferrer noopener" : undefined)}
			aria-current={isActive ? "page" : undefined}
			aria-disabled={disabled || undefined}
			tabIndex={disabled ? -1 : undefined}
			data-slot="sidebar-menu-sub-button"
			onClick={select}
			className={interactiveClassName}
		>
			{content}
		</a>
	) : (
		<button
			type="button"
			disabled={disabled}
			aria-current={isActive ? "page" : undefined}
			data-slot="sidebar-menu-sub-button"
			onClick={select}
			className={interactiveClassName}
		>
			{content}
		</button>
	)
}

/** What a row can be handed to act as something else's trigger: a context menu
 * clones its child and gives it press and key listeners, a ref, and the
 * `aria-haspopup` state of the popup it opens. They land on the row element
 * itself, after the props the row sets for itself. */
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
	/** Leading visual. The only thing left visible once the panel collapses. */
	icon?: ReactNode
	/** Hides `icon` from the accessibility tree. Turn off for a visual that carries its own name. */
	isIconDecorative?: boolean
	/** Accessible name once the panel collapses. Defaults to string children. */
	label?: string
	/** Renders an anchor instead of a button. */
	href?: string
	/** Marks the row as the current page and gives it the shared active pill. */
	isActive?: boolean
	/** Turns the row into a disclosure: rotates the chevron and sets `aria-expanded`. */
	ariaExpanded?: boolean
	disabled?: boolean
	/** Dismiss the mobile drawer on select. Defaults to `true` unless the row is a disclosure. */
	closeOnSelect?: boolean
	target?: "_blank" | "_self" | "_parent" | "_top"
	rel?: string
	onSelect?: () => void
	className?: string
}

/**
 * A top-level row. The active row carries its own background, so selecting
 * another one swaps the highlight outright rather than gliding it across.
 * String children double as the accessible name once the panel collapses to
 * icons.
 */
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
		"relative flex min-h-9 w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-xl text-left font-medium text-sm outline-none",
		// `(row - glyph) / 2` on the leading edge, as `buttonVariants` explains.
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
