"use client"

import { type ReactNode, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
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
	RoutineForm,
	type RoutineFormModel,
	type RoutineFormValues,
	type RoutineTriggerSource,
} from "@workspace/ui/components/routine-form"
import {
	RoutineRow,
	type RoutineRowModel,
} from "@workspace/ui/components/routine-row"

const ROUTINES_PANEL_ID = "routines-panel"
const ROUTINES_PANEL_WIDTH = 320

const NEW_ROUTINE_KEY = "new-routine"
const HEADER_OPENER = "header-new-routine"
const EMPTY_OPENER = "empty-new-routine"

type RoutinesFailure = "read" | "write"

type RoutinesPanelForm = {
	open: RoutineFormModel | null
	sources: RoutineTriggerSource[]
	canCreate: boolean
	onNew: () => void
	onOpen: (routineId: string) => void
	onClose: () => void
	onSave: (values: RoutineFormValues) => void
}

type RoutinesPanelListProps = {
	routines: RoutineRowModel[]
	failure: RoutinesFailure | null
	onRetry: () => void
	onEnabledChange: (id: string, isEnabled: boolean) => void
	onDelete: (id: string) => void | Promise<void>
	form?: RoutinesPanelForm
}

type RoutinesPanelProps = RoutinesPanelListProps & {
	isOpen: boolean
	onOpenChange: (isOpen: boolean) => void
	children: ReactNode
}

type RoutinesPanelBodyProps = RoutinesPanelListProps & {
	onNewRoutine: () => void
	onOpenRoutine: (routineId: string) => void
}

const RoutinesPanelBody = ({
	routines,
	failure,
	onRetry,
	onEnabledChange,
	onDelete,
	form,
	onNewRoutine,
	onOpenRoutine,
}: RoutinesPanelBodyProps) => {
	const { t } = useTranslation("chat")

	const notice = failure ? (
		<Notice
			description={t(`routines.failure.${failure}.description`)}
			retry={{ onRetry }}
			title={t(`routines.failure.${failure}.title`)}
		/>
	) : null

	if (form?.open) {
		return (
			<>
				{notice}
				<RoutineForm
					{...form.open}
					key={form.open.id ?? NEW_ROUTINE_KEY}
					onSave={form.onSave}
					sources={form.sources}
				/>
			</>
		)
	}

	if (routines.length === 0) {
		return (
			notice ?? (
				<EmptyStateShell
					action={
						form?.canCreate ? (
							<Button data-opens={EMPTY_OPENER} onClick={onNewRoutine}>
								<Icons.Add aria-hidden="true" />
								{t("routines.form.new")}
							</Button>
						) : undefined
					}
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
			{notice}
			<ul className="flex flex-col gap-2" data-slot="routines-list">
				{routines.map((routine) => (
					<RoutineRow
						{...routine}
						key={routine.id}
						onDelete={() => onDelete(routine.id)}
						onEnabledChange={(isEnabled) =>
							onEnabledChange(routine.id, isEnabled)
						}
						onOpen={form ? () => onOpenRoutine(routine.id) : undefined}
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
	const surface = useRef<HTMLElement>(null)
	const opener = useRef<string | null>(null)
	const { form } = props
	const isFormOpen = Boolean(form?.open)

	useEffect(() => {
		if (wasOpen.current && !open) {
			triggerRef.current?.focus({ preventScroll: true })
		}
		wasOpen.current = open
	}, [open, triggerRef])

	useEffect(() => {
		if (isFormOpen || !opener.current) {
			return
		}

		surface.current
			?.querySelector<HTMLElement>(`[data-opens="${opener.current}"]`)
			?.focus({ preventScroll: true })
		opener.current = null
	}, [isFormOpen])

	const remember = (picked: string, act: () => void) => {
		opener.current = picked
		act()
	}

	return (
		<AnimatedSidebar
			ariaLabel={t("routines.panel.label")}
			collapsible="offcanvas"
			id={ROUTINES_PANEL_ID}
			inert={!open}
			panelClassName="h-full"
			ref={surface}
			side="right"
		>
			<AnimatedSidebarHeader>
				<div className="flex h-7 items-center gap-2">
					{form?.open ? (
						<>
							<Button
								aria-label={t("routines.form.back")}
								onClick={form.onClose}
								size="icon-sm"
								variant="ghost"
							>
								<Icons.Previous aria-hidden="true" />
							</Button>
							<h2 className="font-medium text-sm">
								{t(form.open.id ? "routines.form.edit" : "routines.form.new")}
							</h2>
						</>
					) : (
						<>
							<h2 className="flex-1 font-medium text-sm">
								{t("routines.panel.title")}
							</h2>
							{form?.canCreate ? (
								<Button
									aria-label={t("routines.form.new")}
									data-opens={HEADER_OPENER}
									onClick={() => remember(HEADER_OPENER, form.onNew)}
									size="icon-sm"
									variant="ghost"
								>
									<Icons.Add aria-hidden="true" />
								</Button>
							) : null}
						</>
					)}
				</div>
			</AnimatedSidebarHeader>
			<AnimatedSidebarContent>
				<RoutinesPanelBody
					{...props}
					onNewRoutine={() => remember(EMPTY_OPENER, () => form?.onNew())}
					onOpenRoutine={(routineId) =>
						remember(routineId, () => form?.onOpen(routineId))
					}
				/>
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
	ROUTINES_PANEL_WIDTH,
	type RoutinesFailure,
	RoutinesPanel,
	type RoutinesPanelForm,
	type RoutinesPanelProps,
	RoutinesPanelTrigger,
}
