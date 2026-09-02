"use client"

import { type ReactNode, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"

import { EmptyStateShell } from "@workspace/ui/components/empty-state-shell"
import { Icons } from "@workspace/ui/components/icons"
import {
	AnimatedSidebar,
	AnimatedSidebarContent,
	AnimatedSidebarHeader,
	AnimatedSidebarInset,
	AnimatedSidebarProvider,
	AnimatedSidebarTrigger,
	type AnimatedSidebarTriggerProps,
	useAnimatedSidebar,
} from "@workspace/ui/components/motion/animated-sidebar"
import { Notice } from "@workspace/ui/components/notice"
import {
	RoutineRow,
	type RoutineRowModel,
} from "@workspace/ui/components/routine-row"

const ROUTINES_PANEL_ID = "routines-panel"
const ROUTINES_PANEL_WIDTH = 320

type RoutinesPanelListProps = {
	routines: RoutineRowModel[]
	hasFailed: boolean
	onRetry: () => void
	onEnabledChange: (id: string, isEnabled: boolean) => void
	onDelete: (id: string) => void | Promise<void>
}

type RoutinesPanelProps = RoutinesPanelListProps & {
	isOpen: boolean
	onOpenChange: (isOpen: boolean) => void
	children: ReactNode
}

const RoutinesPanelBody = ({
	routines,
	hasFailed,
	onRetry,
	onEnabledChange,
	onDelete,
}: RoutinesPanelListProps) => {
	const { t } = useTranslation("chat")

	const failure = hasFailed ? (
		<Notice
			description={t("routines.failure.description")}
			retry={{ onRetry }}
			title={t("routines.failure.title")}
		/>
	) : null

	if (routines.length === 0) {
		return (
			failure ?? (
				<EmptyStateShell
					data-slot="routines-empty"
					description={t("routines.empty.description")}
					mark={
						<Icons.Routine
							aria-hidden="true"
							className="size-8 text-muted-foreground"
						/>
					}
					title={t("routines.empty.title")}
				/>
			)
		)
	}

	return (
		<>
			{failure}
			<ul className="flex flex-col gap-2" data-slot="routines-list">
				{routines.map((routine) => (
					<RoutineRow
						{...routine}
						key={routine.id}
						onDelete={() => onDelete(routine.id)}
						onEnabledChange={(isEnabled) =>
							onEnabledChange(routine.id, isEnabled)
						}
					/>
				))}
			</ul>
		</>
	)
}

const RoutinesPanelSurface = (props: RoutinesPanelListProps) => {
	const { t } = useTranslation("chat")
	const { open, triggerRef } = useAnimatedSidebar()
	const wasOpen = useRef(open)

	useEffect(() => {
		if (wasOpen.current && !open) {
			triggerRef.current?.focus({ preventScroll: true })
		}
		wasOpen.current = open
	}, [open, triggerRef])

	return (
		<AnimatedSidebar
			ariaLabel={t("routines.panel.label")}
			collapsible="offcanvas"
			id={ROUTINES_PANEL_ID}
			inert={!open}
			panelClassName="h-full"
			side="right"
		>
			<AnimatedSidebarHeader>
				<h2 className="font-medium text-sm">{t("routines.panel.title")}</h2>
			</AnimatedSidebarHeader>
			<AnimatedSidebarContent>
				<RoutinesPanelBody {...props} />
			</AnimatedSidebarContent>
		</AnimatedSidebar>
	)
}

const RoutinesPanel = ({
	isOpen,
	onOpenChange,
	children,
	...list
}: RoutinesPanelProps) => (
	<AnimatedSidebarProvider
		className="h-full"
		data-slot="routines-panel"
		defaultWidth={ROUTINES_PANEL_WIDTH}
		hasKeyboardShortcut={false}
		onOpenChange={onOpenChange}
		open={isOpen}
	>
		<AnimatedSidebarInset isLandmark={false}>{children}</AnimatedSidebarInset>
		<RoutinesPanelSurface {...list} />
	</AnimatedSidebarProvider>
)

const RoutinesPanelTrigger = (props: AnimatedSidebarTriggerProps) => {
	const { t } = useTranslation("chat")

	return (
		<AnimatedSidebarTrigger
			{...props}
			aria-controls={ROUTINES_PANEL_ID}
			aria-label={t("routines.panel.toggle")}
			className="size-8"
		>
			<Icons.Routine aria-hidden="true" className="size-4" />
		</AnimatedSidebarTrigger>
	)
}

export {
	ROUTINES_PANEL_ID,
	ROUTINES_PANEL_WIDTH,
	RoutinesPanel,
	type RoutinesPanelProps,
	RoutinesPanelTrigger,
}
