"use client"

import { motion, useReducedMotion } from "motion/react"
import {
	type DragEvent,
	type KeyboardEvent,
	memo,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@workspace/ui/components/motion/popover"
import { SPRING_LAYOUT, TWEEN_REDUCED } from "@workspace/ui/lib/ease"
import { useHoverCapable } from "@workspace/ui/lib/hooks/use-hover-capable"
import { cn } from "@workspace/ui/lib/utils"

export type SidebarResourceKind = "folder" | "project" | "file" | "bookmark"

export interface SidebarResource {
	id: string
	label: string
	kind: SidebarResourceKind
	children?: SidebarResource[]
	disabled?: boolean
}

export type SidebarResourceDropPosition = "before" | "inside" | "after"

export interface SidebarResourceMove {
	itemId: string
	targetId: string | null
	position: SidebarResourceDropPosition
}

export interface SidebarResourceMenuControls {
	close: () => void
	rename: () => void
}

export interface AISidebarProps {
	items?: SidebarResource[]
	defaultItems?: SidebarResource[]
	onItemsChange?: (items: SidebarResource[]) => void
	/** Reject the promise to roll the optimistic move back. */
	onMove?: (move: SidebarResourceMove) => void | Promise<void>
	onMoveError?: (error: unknown, move: SidebarResourceMove) => void
	onRename?: (item: SidebarResource, label: string) => void | Promise<void>
	activeId?: string | null
	defaultActiveId?: string | null
	onActiveChange?: (id: string) => void
	defaultExpandedIds?: string[]
	renderIcon?: (item: SidebarResource) => ReactNode
	renderMenu?: (
		item: SidebarResource,
		controls: SidebarResourceMenuControls,
	) => ReactNode
	/**
	 * Browse-only tree: selection, expand/collapse and the whole keyboard set stay
	 * live, while every mutation affordance is dropped rather than disabled —
	 * no drag-and-drop, no rename, no overflow menu, no move shortcuts.
	 */
	isReadOnly?: boolean
	ariaLabel?: string
	className?: string
}

interface FlatResource {
	item: SidebarResource
	depth: number
	parentId: string | null
}

interface DropTarget {
	id: string | null
	position: SidebarResourceDropPosition
}

function canContain(item: SidebarResource) {
	return item.kind === "folder" || item.kind === "project"
}

function flattenResources(
	items: SidebarResource[],
	expanded: Set<string>,
	depth = 0,
	parentId: string | null = null,
): FlatResource[] {
	return items.flatMap((item) => {
		const row = { item, depth, parentId }
		if (!item.children?.length || !expanded.has(item.id)) return [row]
		return [
			row,
			...flattenResources(item.children, expanded, depth + 1, item.id),
		]
	})
}

function findResource(
	items: SidebarResource[],
	id: string,
): SidebarResource | undefined {
	for (const item of items) {
		if (item.id === id) return item
		const child = item.children ? findResource(item.children, id) : undefined
		if (child) return child
	}
}

function containsResource(item: SidebarResource, id: string): boolean {
	return (
		item.id === id ||
		item.children?.some((child) => containsResource(child, id)) === true
	)
}

function collectSubtreeIds(
	item: SidebarResource,
	into = new Set<string>(),
): Set<string> {
	into.add(item.id)
	for (const child of item.children ?? []) collectSubtreeIds(child, into)
	return into
}

function dropPositionFor(
	event: DragEvent<HTMLDivElement>,
	target: SidebarResource,
): SidebarResourceDropPosition {
	const rect = event.currentTarget.getBoundingClientRect()
	const ratio = (event.clientY - rect.top) / rect.height
	const acceptsInside = !target.disabled && canContain(target)
	if (acceptsInside && ratio >= 0.25 && ratio <= 0.75) return "inside"
	return ratio < 0.5 ? "before" : "after"
}

function removeResource(
	items: SidebarResource[],
	id: string,
): { items: SidebarResource[]; removed?: SidebarResource } {
	let removed: SidebarResource | undefined
	const next: SidebarResource[] = []

	for (const item of items) {
		if (item.id === id) {
			removed = item
			continue
		}

		if (item.children?.length) {
			const childResult = removeResource(item.children, id)
			if (childResult.removed) {
				removed = childResult.removed
				next.push({ ...item, children: childResult.items })
				continue
			}
		}

		next.push(item)
	}

	return { items: next, removed }
}

function insertResource(
	items: SidebarResource[],
	resource: SidebarResource,
	targetId: string | null,
	position: SidebarResourceDropPosition,
): SidebarResource[] {
	if (targetId === null) return [...items, resource]

	const next: SidebarResource[] = []
	for (const item of items) {
		if (item.id === targetId) {
			if (position === "before") next.push(resource, item)
			else if (position === "after") next.push(item, resource)
			else
				next.push({ ...item, children: [...(item.children ?? []), resource] })
			continue
		}

		if (item.children?.length) {
			next.push({
				...item,
				children: insertResource(item.children, resource, targetId, position),
			})
		} else {
			next.push(item)
		}
	}
	return next
}

function moveResource(
	items: SidebarResource[],
	move: SidebarResourceMove,
): SidebarResource[] | null {
	const source = findResource(items, move.itemId)
	if (!source || source.disabled) return null
	if (move.targetId && containsResource(source, move.targetId)) return null

	const target = move.targetId ? findResource(items, move.targetId) : undefined
	if (
		move.position === "inside" &&
		(!target || target.disabled || !canContain(target))
	)
		return null

	const removed = removeResource(items, move.itemId)
	if (!removed.removed) return null
	return insertResource(
		removed.items,
		removed.removed,
		move.targetId,
		move.position,
	)
}

function renameResource(
	items: SidebarResource[],
	id: string,
	label: string,
): SidebarResource[] {
	return items.map((item) => ({
		...item,
		label: item.id === id ? label : item.label,
		children: item.children
			? renameResource(item.children, id, label)
			: undefined,
	}))
}

function defaultIcon(item: SidebarResource, expanded: boolean) {
	if (canContain(item)) {
		const ContainerIcon = expanded ? Icons.FolderOpen : Icons.Folder
		return <ContainerIcon className="size-4" />
	}
	const LeafIcon = item.kind === "bookmark" ? Icons.Bookmark : Icons.File
	return <LeafIcon className="size-4" />
}

interface MarqueeLabelProps {
	active: boolean
	children: string
}

function MarqueeLabel({ active, children }: MarqueeLabelProps) {
	const reduce = useReducedMotion() ?? false
	const canHover = useHoverCapable()
	const viewportRef = useRef<HTMLSpanElement>(null)
	const labelRef = useRef<HTMLSpanElement>(null)
	const [distance, setDistance] = useState(0)

	useEffect(() => {
		if (!active) return
		const observer = new ResizeObserver(() => {
			const viewport = viewportRef.current
			const label = labelRef.current
			if (!viewport || !label) return
			setDistance(
				label.scrollWidth > viewport.clientWidth ? label.scrollWidth + 24 : 0,
			)
		})
		if (viewportRef.current) observer.observe(viewportRef.current)
		if (labelRef.current) observer.observe(labelRef.current)
		return () => observer.disconnect()
	}, [active])

	const running = active && canHover && distance > 0 && !reduce

	return (
		<span
			ref={viewportRef}
			data-slot="ai-sidebar-row-label"
			className="block min-w-0 flex-1 overflow-hidden"
		>
			<motion.span
				className="flex w-max items-center gap-6 whitespace-nowrap"
				animate={{ x: running ? [0, -distance] : 0 }}
				transition={
					running
						? {
								duration: Math.max(2.4, distance / 34),
								ease: "linear",
								repeat: Number.POSITIVE_INFINITY,
								repeatDelay: 2,
							}
						: TWEEN_REDUCED
				}
			>
				<span ref={labelRef}>{children}</span>
				{running ? <span aria-hidden="true">{children}</span> : null}
			</motion.span>
		</span>
	)
}

interface ResourceRowProps {
	row: FlatResource
	active: boolean
	expanded: boolean
	focused: boolean
	isDragging: boolean
	dropPosition: SidebarResourceDropPosition | null
	menuOpen: boolean
	renaming: boolean
	isReadOnly: boolean
	onDragEnd: () => void
	onDragOver: (event: DragEvent<HTMLDivElement>, row: FlatResource) => void
	onDragStart: (event: DragEvent<HTMLDivElement>, id: string) => void
	onDrop: (event: DragEvent<HTMLDivElement>) => void
	onFocus: (id: string) => void
	onKeyDown: (event: KeyboardEvent<HTMLDivElement>, row: FlatResource) => void
	onMenuOpenChange: (id: string, open: boolean) => void
	onRenameCancel: () => void
	onRenameCommit: (item: SidebarResource, label: string) => void
	onRenameStart: (id: string) => void
	onSelect: (id: string) => void
	onToggle: (id: string) => void
	registerRow: (id: string, node: HTMLDivElement | null) => void
	renderIcon?: (item: SidebarResource) => ReactNode
	renderMenu?: AISidebarProps["renderMenu"]
}

function ResourceRowBase({
	row,
	active,
	expanded,
	focused,
	isDragging,
	dropPosition,
	menuOpen,
	renaming,
	isReadOnly,
	onDragEnd,
	onDragOver,
	onDragStart,
	onDrop,
	onFocus,
	onKeyDown,
	onMenuOpenChange,
	onRenameCancel,
	onRenameCommit,
	onRenameStart,
	onSelect,
	onToggle,
	registerRow,
	renderIcon,
	renderMenu,
}: ResourceRowProps) {
	const reduce = useReducedMotion() ?? false
	const [hovered, setHovered] = useState(false)
	const inputRef = useRef<HTMLInputElement>(null)
	const menuRef = useRef<HTMLDivElement>(null)
	const skipRenameBlurRef = useRef(false)
	const draggedRef = useRef(false)
	const { t } = useTranslation("bots")
	const [draft, setDraft] = useState(row.item.label)
	const [isMenuMounted, setIsMenuMounted] = useState(false)
	const itemId = row.item.id
	const acceptsChildren = canContain(row.item)
	const hasMenu = !isReadOnly && !renaming && !row.item.disabled
	const menuLabel = t("resources.actions", { name: row.item.label })

	if (menuOpen && !isMenuMounted) setIsMenuMounted(true)

	const setRowRef = useCallback(
		(node: HTMLDivElement | null) => registerRow(itemId, node),
		[registerRow, itemId],
	)

	useEffect(() => {
		if (!renaming) return
		skipRenameBlurRef.current = false
		setDraft(row.item.label)
		requestAnimationFrame(() => {
			inputRef.current?.focus()
			inputRef.current?.select()
		})
	}, [renaming, row.item.label])

	useEffect(() => {
		if (!menuOpen) return
		const frame = requestAnimationFrame(() => {
			menuRef.current?.querySelector<HTMLElement>("button, a[href]")?.focus()
		})
		return () => cancelAnimationFrame(frame)
	}, [menuOpen])

	const dragProps = {
		draggable: !row.item.disabled && !renaming,
		onDragStartCapture: (event: DragEvent<HTMLDivElement>) => {
			draggedRef.current = true
			onDragStart(event, itemId)
		},
		onDragEndCapture: () => {
			onDragEnd()
			requestAnimationFrame(() => {
				draggedRef.current = false
			})
		},
		onDragOver: (event: DragEvent<HTMLDivElement>) => onDragOver(event, row),
		onDrop,
	}

	const startRename = () => {
		onMenuOpenChange(itemId, false)
		onRenameStart(itemId)
	}

	const menu = hasMenu
		? (renderMenu?.(row.item, {
				close: () => onMenuOpenChange(itemId, false),
				rename: startRename,
			}) ?? (
				<button
					type="button"
					onClick={startRename}
					className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
				>
					<Icons.Edit aria-hidden="true" className="size-3.5" />
					{t("resources.menu.rename")}
				</button>
			))
		: null

	return (
		<motion.div
			ref={setRowRef}
			data-slot="ai-sidebar-row"
			layout="position"
			transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
			role="treeitem"
			aria-level={row.depth + 1}
			aria-selected={acceptsChildren ? undefined : active}
			aria-expanded={acceptsChildren ? expanded : undefined}
			aria-disabled={row.item.disabled || undefined}
			tabIndex={focused ? 0 : -1}
			data-menu-open={menuOpen || undefined}
			data-drop={dropPosition ?? undefined}
			data-dragging={isDragging || undefined}
			onFocus={() => onFocus(itemId)}
			onKeyDown={(event) => onKeyDown(event, row)}
			onClick={(event) => {
				if (
					event.defaultPrevented ||
					draggedRef.current ||
					renaming ||
					row.item.disabled
				)
					return
				if (acceptsChildren) onToggle(itemId)
				else onSelect(itemId)
			}}
			onDoubleClick={(event) => {
				if (isReadOnly || acceptsChildren || row.item.disabled) return
				event.preventDefault()
				onRenameStart(itemId)
			}}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			{...(isReadOnly ? { draggable: false } : dragProps)}
			className={cn(
				"group/resource relative flex min-h-9 min-w-0 cursor-pointer items-center gap-2.5 rounded-xl pr-1 text-sm outline-none",
				"text-muted-foreground",
				!row.item.disabled &&
					"hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
				"focus-visible:bg-sidebar-accent focus-visible:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset",
				"data-[menu-open=true]:bg-sidebar-accent data-[menu-open=true]:text-sidebar-accent-foreground",
				"data-[dragging=true]:opacity-40",
				"data-[drop=inside]:bg-primary/10 data-[drop=inside]:ring-1 data-[drop=inside]:ring-primary/45",
				"data-[drop=before]:before:absolute data-[drop=before]:before:-top-0.5 data-[drop=before]:before:right-2 data-[drop=before]:before:left-2 data-[drop=before]:before:h-0.5 data-[drop=before]:before:rounded-full data-[drop=before]:before:bg-primary",
				"data-[drop=after]:after:absolute data-[drop=after]:after:-bottom-0.5 data-[drop=after]:after:right-2 data-[drop=after]:after:left-2 data-[drop=after]:after:h-0.5 data-[drop=after]:after:rounded-full data-[drop=after]:after:bg-primary",
				!acceptsChildren &&
					active &&
					"bg-sidebar-accent text-sidebar-accent-foreground",
				row.item.disabled && "cursor-not-allowed opacity-45",
			)}
			style={{ paddingLeft: `${8 + row.depth * 16}px` }}
		>
			<span
				aria-hidden="true"
				data-slot="ai-sidebar-row-icon"
				className="grid size-5 shrink-0 place-items-center"
			>
				{renderIcon?.(row.item) ?? defaultIcon(row.item, expanded)}
			</span>

			{renaming ? (
				<input
					ref={inputRef}
					data-slot="ai-sidebar-rename-input"
					value={draft}
					aria-label={t("resources.rename", { name: row.item.label })}
					onChange={(event) => setDraft(event.target.value)}
					draggable={false}
					onClick={(event) => event.stopPropagation()}
					onDoubleClick={(event) => event.stopPropagation()}
					onBlur={() => {
						if (!skipRenameBlurRef.current) onRenameCommit(row.item, draft)
					}}
					onKeyDown={(event) => {
						event.stopPropagation()
						if (event.key === "Enter") {
							skipRenameBlurRef.current = true
							onRenameCommit(row.item, draft)
						}
						if (event.key === "Escape") {
							skipRenameBlurRef.current = true
							onRenameCancel()
						}
					}}
					className="mx-1 h-7 min-w-0 flex-1 rounded-md border border-sidebar-border bg-background px-2 text-foreground text-sm outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
				/>
			) : (
				<MarqueeLabel active={hovered || menuOpen}>
					{row.item.label}
				</MarqueeLabel>
			)}

			{hasMenu ? (
				<Popover
					open={menuOpen}
					onOpenChange={(open) => onMenuOpenChange(itemId, open)}
					side="bottom"
					align="end"
					sideOffset={8}
					panelRadius={12}
				>
					<PopoverTrigger>
						<button
							type="button"
							draggable={false}
							tabIndex={-1}
							aria-label={menuLabel}
							onClick={(event) => event.stopPropagation()}
							className="grid size-7 shrink-0 place-items-center rounded-lg opacity-0 outline-none hover:bg-foreground/5 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring group-hover/resource:opacity-100 group-data-[menu-open=true]/resource:opacity-100"
						>
							<Icons.More aria-hidden="true" className="size-4" />
						</button>
					</PopoverTrigger>
					{isMenuMounted ? (
						<PopoverContent aria-label={menuLabel} className="w-40 p-1.5">
							<div ref={menuRef}>{menu}</div>
						</PopoverContent>
					) : null}
				</Popover>
			) : null}
		</motion.div>
	)
}

const ResourceRow = memo(ResourceRowBase)

export function AISidebar({
	items,
	defaultItems = [],
	onItemsChange,
	onMove,
	onMoveError,
	onRename,
	activeId,
	defaultActiveId = null,
	onActiveChange,
	defaultExpandedIds = [],
	renderIcon,
	renderMenu,
	isReadOnly = false,
	ariaLabel,
	className,
}: AISidebarProps) {
	const { t } = useTranslation("bots")
	const [internalItems, setInternalItems] = useState(items ?? defaultItems)
	const [internalActiveId, setInternalActiveId] = useState(defaultActiveId)
	const [expandedIds, setExpandedIds] = useState(
		() => new Set(defaultExpandedIds),
	)
	const [focusedId, setFocusedId] = useState<string | null>(
		activeId ?? defaultActiveId,
	)
	const [draggingId, setDraggingId] = useState<string | null>(null)
	const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
	const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
	const [renamingId, setRenamingId] = useState<string | null>(null)
	const [announcement, setAnnouncement] = useState("")
	const rowRefs = useRef(new Map<string, HTMLDivElement>())
	const movePendingRef = useRef(false)
	const dropTargetRef = useRef<DropTarget | null>(null)
	const dragSubtreeRef = useRef<Set<string> | null>(null)
	const renderedItems = internalItems
	const selectedId = activeId ?? internalActiveId

	useEffect(() => {
		if (items && !movePendingRef.current) setInternalItems(items)
	}, [items])

	const flat = useMemo(
		() => flattenResources(renderedItems, expandedIds),
		[expandedIds, renderedItems],
	)

	const focusedRowId = flat.some((row) => row.item.id === focusedId)
		? focusedId
		: (flat[0]?.item.id ?? null)

	const updateItems = useCallback(
		(next: SidebarResource[]) => {
			setInternalItems(next)
			onItemsChange?.(next)
		},
		[onItemsChange],
	)

	const updateDropTarget = useCallback((next: DropTarget | null) => {
		dropTargetRef.current = next
		setDropTarget((current) =>
			current?.id === next?.id && current?.position === next?.position
				? current
				: next,
		)
	}, [])

	const performMove = useCallback(
		async (move: SidebarResourceMove) => {
			if (movePendingRef.current) {
				setAnnouncement(t("resources.move.busy"))
				return
			}
			const before = renderedItems
			const next = moveResource(before, move)
			if (!next || next === before) return

			movePendingRef.current = true
			updateItems(next)
			updateDropTarget(null)
			setDraggingId(null)
			const moved = findResource(before, move.itemId)
			const target = move.targetId ? findResource(before, move.targetId) : null
			const movedLabel = moved?.label ?? t("resources.item")
			setAnnouncement(
				target
					? t("resources.move.done", {
							name: movedLabel,
							position: t(`resources.position.${move.position}`),
							target: target.label,
						})
					: t("resources.move.doneAtTopLevel", { name: movedLabel }),
			)

			try {
				await onMove?.(move)
			} catch (error) {
				updateItems(before)
				setAnnouncement(
					t("resources.move.failed", {
						name: moved?.label ?? t("resources.itemLead"),
					}),
				)
				onMoveError?.(error, move)
			} finally {
				movePendingRef.current = false
			}
		},
		[onMove, onMoveError, renderedItems, t, updateDropTarget, updateItems],
	)

	const focusRow = useCallback((id: string) => {
		setFocusedId(id)
		const mounted = rowRefs.current.get(id)
		if (mounted) {
			mounted.focus()
			return
		}
		requestAnimationFrame(() => rowRefs.current.get(id)?.focus())
	}, [])

	const select = useCallback(
		(id: string) => {
			if (activeId === undefined) setInternalActiveId(id)
			onActiveChange?.(id)
		},
		[activeId, onActiveChange],
	)

	const toggle = useCallback((id: string) => {
		setExpandedIds((current) => {
			const next = new Set(current)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}, [])

	const registerRow = useCallback((id: string, node: HTMLDivElement | null) => {
		if (node) rowRefs.current.set(id, node)
		else rowRefs.current.delete(id)
	}, [])

	const handleRowFocus = useCallback((id: string) => setFocusedId(id), [])

	const handleRenameStart = useCallback((id: string) => setRenamingId(id), [])

	const handleRenameCancel = useCallback(() => setRenamingId(null), [])

	const handleRenameCommit = useCallback(
		(item: SidebarResource, label: string) => {
			const trimmed = label.trim()
			setRenamingId(null)
			if (!trimmed || trimmed === item.label) return
			const before = renderedItems
			updateItems(renameResource(before, item.id, trimmed))
			void Promise.resolve(onRename?.(item, trimmed)).catch(() => {
				updateItems(before)
				setAnnouncement(t("resources.renameFailed", { name: item.label }))
			})
		},
		[onRename, renderedItems, t, updateItems],
	)

	const handleMenuOpenChange = useCallback(
		(id: string, open: boolean) => {
			setMenuOpenId(open ? id : null)
			if (!open) focusRow(id)
		},
		[focusRow],
	)

	const handleRowDragStart = useCallback(
		(event: DragEvent<HTMLDivElement>, id: string) => {
			const source = findResource(renderedItems, id)
			dragSubtreeRef.current = source ? collectSubtreeIds(source) : null
			setDraggingId(id)
			event.dataTransfer.effectAllowed = "move"
			event.dataTransfer.setData("text/plain", id)
		},
		[renderedItems],
	)

	const handleRowDragEnd = useCallback(() => {
		dragSubtreeRef.current = null
		setDraggingId(null)
		updateDropTarget(null)
	}, [updateDropTarget])

	const handleRowDragOver = useCallback(
		(event: DragEvent<HTMLDivElement>, targetRow: FlatResource) => {
			const targetId = targetRow.item.id
			if (!draggingId || draggingId === targetId) return
			if (dragSubtreeRef.current?.has(targetId)) return
			event.preventDefault()
			event.stopPropagation()
			updateDropTarget({
				id: targetId,
				position: dropPositionFor(event, targetRow.item),
			})
		},
		[draggingId, updateDropTarget],
	)

	const handleRowDrop = useCallback(
		(event: DragEvent<HTMLDivElement>) => {
			event.preventDefault()
			event.stopPropagation()
			const target = dropTargetRef.current
			if (!draggingId || !target) return
			void performMove({
				itemId: draggingId,
				targetId: target.id,
				position: target.position,
			})
		},
		[draggingId, performMove],
	)

	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDivElement>, row: FlatResource) => {
			const index = flat.findIndex(({ item }) => item.id === row.item.id)
			const previous = flat[index - 1]
			const next = flat[index + 1]
			const last = flat.at(-1)
			const moveModifier = !isReadOnly && event.altKey && event.shiftKey

			if (event.key === "ArrowDown" && !moveModifier && next) {
				event.preventDefault()
				focusRow(next.item.id)
				return
			}
			if (event.key === "ArrowUp" && !moveModifier && previous) {
				event.preventDefault()
				focusRow(previous.item.id)
				return
			}
			if (event.key === "Home" && flat[0]) {
				event.preventDefault()
				focusRow(flat[0].item.id)
				return
			}
			if (event.key === "End" && last) {
				event.preventDefault()
				focusRow(last.item.id)
				return
			}

			if (row.item.disabled) {
				if (event.key === "ArrowLeft" && row.parentId) {
					event.preventDefault()
					focusRow(row.parentId)
				} else if (
					moveModifier ||
					["ArrowRight", "Enter", " ", "F2", "ContextMenu"].includes(
						event.key,
					) ||
					(event.shiftKey && event.key === "F10")
				) {
					event.preventDefault()
				}
				return
			}

			if (moveModifier && event.key === "ArrowUp" && previous) {
				event.preventDefault()
				void performMove({
					itemId: row.item.id,
					targetId: previous.item.id,
					position: "before",
				})
				return
			}
			if (moveModifier && event.key === "ArrowDown" && next) {
				event.preventDefault()
				void performMove({
					itemId: row.item.id,
					targetId: next.item.id,
					position: "after",
				})
				return
			}
			if (
				moveModifier &&
				event.key === "ArrowRight" &&
				previous &&
				canContain(previous.item)
			) {
				event.preventDefault()
				setExpandedIds((current) => new Set(current).add(previous.item.id))
				void performMove({
					itemId: row.item.id,
					targetId: previous.item.id,
					position: "inside",
				})
				return
			}
			if (moveModifier && event.key === "ArrowLeft" && row.parentId) {
				event.preventDefault()
				void performMove({
					itemId: row.item.id,
					targetId: row.parentId,
					position: "after",
				})
				return
			}

			if (event.key === "ArrowRight" && canContain(row.item)) {
				event.preventDefault()
				if (!expandedIds.has(row.item.id)) toggle(row.item.id)
				else if (next?.parentId === row.item.id) focusRow(next.item.id)
			} else if (event.key === "ArrowLeft") {
				event.preventDefault()
				if (expandedIds.has(row.item.id)) toggle(row.item.id)
				else if (row.parentId) focusRow(row.parentId)
			} else if (event.key === "Enter" || event.key === " ") {
				event.preventDefault()
				if (canContain(row.item)) toggle(row.item.id)
				else select(row.item.id)
			} else if (!isReadOnly && event.key === "F2") {
				event.preventDefault()
				setRenamingId(row.item.id)
			} else if (
				!isReadOnly &&
				(event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))
			) {
				event.preventDefault()
				setMenuOpenId(row.item.id)
			}
		},
		[expandedIds, flat, focusRow, isReadOnly, performMove, select, toggle],
	)

	const treeDragProps = {
		onDragOver: (event: DragEvent<HTMLDivElement>) => {
			if (!draggingId || event.target !== event.currentTarget) return
			event.preventDefault()
			updateDropTarget({ id: null, position: "after" })
		},
		onDrop: (event: DragEvent<HTMLDivElement>) => {
			event.preventDefault()
			if (draggingId && dropTarget) {
				void performMove({
					itemId: draggingId,
					targetId: dropTarget.id,
					position: dropTarget.position,
				})
			}
		},
	}

	return (
		<>
			<div
				data-slot="ai-sidebar"
				role="tree"
				aria-label={ariaLabel ?? t("resources.label")}
				aria-multiselectable="false"
				{...(isReadOnly ? {} : treeDragProps)}
				className={cn(
					"relative flex min-w-0 flex-col gap-0.5 [overflow-anchor:none] group-data-[state=collapsed]/sidebar:hidden",
					draggingId && "select-none pb-9",
					className,
				)}
			>
				{flat.map((row) => (
					<ResourceRow
						key={row.item.id}
						row={row}
						active={selectedId === row.item.id}
						expanded={expandedIds.has(row.item.id)}
						focused={focusedRowId === row.item.id}
						isDragging={draggingId === row.item.id}
						dropPosition={
							dropTarget?.id === row.item.id ? dropTarget.position : null
						}
						menuOpen={menuOpenId === row.item.id}
						renaming={renamingId === row.item.id}
						isReadOnly={isReadOnly}
						onFocus={handleRowFocus}
						onSelect={select}
						onToggle={toggle}
						onKeyDown={handleKeyDown}
						onRenameStart={handleRenameStart}
						onRenameCancel={handleRenameCancel}
						onRenameCommit={handleRenameCommit}
						onMenuOpenChange={handleMenuOpenChange}
						onDragStart={handleRowDragStart}
						onDragEnd={handleRowDragEnd}
						onDragOver={handleRowDragOver}
						onDrop={handleRowDrop}
						registerRow={registerRow}
						renderIcon={renderIcon}
						renderMenu={renderMenu}
					/>
				))}

				{draggingId ? (
					<div
						aria-hidden="true"
						data-slot="ai-sidebar-drop-zone"
						data-active={dropTarget?.id === null || undefined}
						className="absolute inset-x-1 bottom-0 flex h-8 items-center justify-center rounded-lg border border-sidebar-border border-dashed text-[10px] text-muted-foreground data-[active=true]:border-primary/50 data-[active=true]:bg-primary/10 data-[active=true]:text-foreground"
					>
						{t("resources.move.toTopLevel")}
					</div>
				) : null}
			</div>
			<span
				data-slot="ai-sidebar-announcer"
				className="sr-only"
				aria-live="polite"
			>
				{announcement}
			</span>
		</>
	)
}
