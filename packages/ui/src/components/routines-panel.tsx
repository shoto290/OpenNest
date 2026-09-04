"use client"

import { type ReactNode, useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { EmptyStateShell } from "@workspace/ui/components/empty-state-shell"
import { Icons } from "@workspace/ui/components/icons"
import {
	MissionRow,
	type MissionRowModel,
} from "@workspace/ui/components/mission-row"
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
	ROUTINE_DETAIL_EDIT_OPENER,
	RoutineDetail,
	type RoutineDetailModel,
} from "@workspace/ui/components/routine-detail"
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
const NEW_ROUTINE_OPENER = "new-routine-opener"
const CLOSED_MISSIONS_OPENER = "closed-missions-opener"

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

type RoutinesPanelDetail = {
	open: RoutineDetailModel | null
	onOpen: (routineId: string) => void
	onClose: () => void
	onRetryRuns: () => void
	onRunNow: () => void
}

type RoutinesPanelMissions = {
	running: MissionRowModel[]
	closed: MissionRowModel[]
	now: number
	onOpen?: (missionId: string) => void
}

type RoutinesPanelListProps = {
	missions: RoutinesPanelMissions
	routines: RoutineRowModel[]
	failure: RoutinesFailure | null
	onRetry: () => void
	onEnabledChange: (id: string, isEnabled: boolean) => void
	onDelete: (id: string) => void | Promise<void>
	form?: RoutinesPanelForm
	detail?: RoutinesPanelDetail
}

type RoutinesPanelProps = RoutinesPanelListProps & {
	isOpen: boolean
	onOpenChange: (isOpen: boolean) => void
	children: ReactNode
}

type PanelSectionProps = {
	slot: string
	title: string
	action?: ReactNode
	children: ReactNode
}

const PanelSection = ({ slot, title, action, children }: PanelSectionProps) => {
	const titleId = useId()

	return (
		<section
			aria-labelledby={titleId}
			className="flex min-w-0 flex-col gap-2"
			data-slot={slot}
		>
			<div className="flex h-7 items-center gap-2">
				<h3
					className="flex-1 font-medium text-muted-foreground text-xs"
					id={titleId}
				>
					{title}
				</h3>
				{action}
			</div>
			{children}
		</section>
	)
}

type MissionListProps = {
	missions: MissionRowModel[]
	now: number
	slot: string
	onOpen?: (missionId: string) => void
}

const MissionList = ({ missions, now, slot, onOpen }: MissionListProps) => (
	<ul className="flex flex-col gap-2" data-slot={slot}>
		{missions.map((mission) => (
			<MissionRow
				{...mission}
				key={mission.id}
				now={now}
				onOpen={onOpen ? () => onOpen(mission.id) : undefined}
			/>
		))}
	</ul>
)

type RoutinesPanelBodyProps = RoutinesPanelListProps & {
	isShowingClosedMissions: boolean
	onShowClosedMissions: () => void
	onNewRoutine: () => void
	onOpenRoutine?: (routineId: string) => void
	onEditRoutine: () => void
}

const RoutinesPanelBody = ({
	missions,
	routines,
	failure,
	onRetry,
	onEnabledChange,
	onDelete,
	form,
	detail,
	isShowingClosedMissions,
	onShowClosedMissions,
	onNewRoutine,
	onOpenRoutine,
	onEditRoutine,
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

	if (detail?.open) {
		return (
			<>
				{notice}
				<RoutineDetail
					{...detail.open}
					key={detail.open.id}
					onEdit={onEditRoutine}
					onRetryRuns={detail.onRetryRuns}
					onRunNow={detail.onRunNow}
				/>
			</>
		)
	}

	if (isShowingClosedMissions) {
		return (
			<>
				{notice}
				<MissionList
					missions={missions.closed}
					now={missions.now}
					onOpen={missions.onOpen}
					slot="closed-missions-list"
				/>
			</>
		)
	}

	const newRoutine = form?.canCreate ? (
		<Button
			aria-label={t("routines.form.new")}
			data-opens={NEW_ROUTINE_OPENER}
			onClick={onNewRoutine}
			size="icon-sm"
			variant="ghost"
		>
			<Icons.Add aria-hidden="true" />
		</Button>
	) : undefined

	const routinesSection = (children: ReactNode) => (
		<PanelSection
			action={newRoutine}
			slot="routines-section"
			title={t("activity.routines.title")}
		>
			{children}
		</PanelSection>
	)

	const isBare =
		missions.running.length === 0 &&
		missions.closed.length === 0 &&
		routines.length === 0

	if (isBare) {
		return (
			notice ??
			routinesSection(
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
				/>,
			)
		)
	}

	return (
		<>
			{notice}
			<PanelSection
				action={
					missions.closed.length > 0 ? (
						<Button
							aria-label={t("activity.missions.closed.open")}
							data-opens={CLOSED_MISSIONS_OPENER}
							onClick={onShowClosedMissions}
							size="icon-sm"
							variant="ghost"
						>
							<Icons.History aria-hidden="true" />
						</Button>
					) : undefined
				}
				slot="missions-section"
				title={t("activity.missions.title")}
			>
				{missions.running.length > 0 ? (
					<MissionList
						missions={missions.running}
						now={missions.now}
						onOpen={missions.onOpen}
						slot="missions-list"
					/>
				) : (
					<p
						className="rounded-xl border border-border border-dashed px-2.5 py-2 text-muted-foreground text-xs"
						data-slot="missions-none"
					>
						{t("activity.missions.none")}
					</p>
				)}
			</PanelSection>
			{routinesSection(
				<ul className="flex flex-col gap-2" data-slot="routines-list">
					{routines.map((routine) => (
						<RoutineRow
							{...routine}
							key={routine.id}
							onDelete={() => onDelete(routine.id)}
							onEnabledChange={(isEnabled) =>
								onEnabledChange(routine.id, isEnabled)
							}
							onOpen={
								onOpenRoutine ? () => onOpenRoutine(routine.id) : undefined
							}
						/>
					))}
				</ul>,
			)}
		</>
	)
}

type PanelHeading = {
	back:
		| "activity.missions.closed.back"
		| "routines.detail.back"
		| "routines.form.back"
	onBack: () => void
	title:
		| "activity.missions.closed.title"
		| "routines.detail.title"
		| "routines.form.edit"
		| "routines.form.new"
}

type HeadingSources = {
	form: RoutinesPanelForm | undefined
	detail: RoutinesPanelDetail | undefined
	isShowingClosedMissions: boolean
	onHideClosedMissions: () => void
}

const headingOf = ({
	form,
	detail,
	isShowingClosedMissions,
	onHideClosedMissions,
}: HeadingSources): PanelHeading | null => {
	if (form?.open) {
		return {
			back: detail?.open ? "routines.detail.back" : "routines.form.back",
			onBack: form.onClose,
			title: form.open.id ? "routines.form.edit" : "routines.form.new",
		}
	}

	if (detail?.open) {
		return {
			back: "routines.form.back",
			onBack: detail.onClose,
			title: "routines.detail.title",
		}
	}

	if (isShowingClosedMissions) {
		return {
			back: "activity.missions.closed.back",
			onBack: onHideClosedMissions,
			title: "activity.missions.closed.title",
		}
	}

	return null
}

const RoutinesPanelSurface = (props: RoutinesPanelListProps) => {
	const { t } = useTranslation("chat")
	const { open, triggerRef } = useAnimatedSidebar()
	const [isShowingClosedMissions, setShowingClosedMissions] = useState(false)
	const wasOpen = useRef(open)
	const surface = useRef<HTMLElement>(null)
	const openers = useRef<string[]>([])
	const { form, detail } = props
	const heading = headingOf({
		form,
		detail,
		isShowingClosedMissions,
		onHideClosedMissions: () => setShowingClosedMissions(false),
	})
	const depth =
		(detail?.open ? 1 : 0) +
		(form?.open ? 1 : 0) +
		(isShowingClosedMissions ? 1 : 0)
	const shownDepth = useRef(depth)

	useEffect(() => {
		if (wasOpen.current && !open) {
			triggerRef.current?.focus({ preventScroll: true })
		}
		wasOpen.current = open
	}, [open, triggerRef])

	useEffect(() => {
		const hasPopped = depth < shownDepth.current
		shownDepth.current = depth
		const opener = hasPopped ? openers.current.pop() : undefined
		if (!opener) {
			return
		}

		surface.current
			?.querySelector<HTMLElement>(`[data-opens="${opener}"]`)
			?.focus({ preventScroll: true })
	}, [depth])

	const remember = (picked: string, act: () => void) => {
		openers.current.push(picked)
		act()
	}

	const editOpenRoutine = () => {
		const openId = detail?.open?.id
		if (openId) {
			remember(ROUTINE_DETAIL_EDIT_OPENER, () => form?.onOpen(openId))
		}
	}

	return (
		<AnimatedSidebar
			ariaLabel={t("activity.panel.label")}
			collapsible="offcanvas"
			id={ROUTINES_PANEL_ID}
			inert={!open}
			panelClassName="h-full"
			ref={surface}
			side="right"
		>
			<AnimatedSidebarHeader>
				<div className="flex h-7 items-center gap-2">
					{heading ? (
						<>
							<Button
								aria-label={t(heading.back)}
								onClick={heading.onBack}
								size="icon-sm"
								variant="ghost"
							>
								<Icons.Previous aria-hidden="true" />
							</Button>
							<h2 className="font-medium text-sm">{t(heading.title)}</h2>
						</>
					) : (
						<h2 className="flex-1 font-medium text-sm">
							{t("activity.panel.title")}
						</h2>
					)}
				</div>
			</AnimatedSidebarHeader>
			<AnimatedSidebarContent className="gap-4">
				<RoutinesPanelBody
					{...props}
					isShowingClosedMissions={isShowingClosedMissions}
					onEditRoutine={editOpenRoutine}
					onNewRoutine={() => remember(NEW_ROUTINE_OPENER, () => form?.onNew())}
					onOpenRoutine={
						detail &&
						((routineId) => remember(routineId, () => detail.onOpen(routineId)))
					}
					onShowClosedMissions={() =>
						remember(CLOSED_MISSIONS_OPENER, () =>
							setShowingClosedMissions(true),
						)
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
			aria-label={t("activity.panel.toggle")}
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
	type RoutinesPanelDetail,
	type RoutinesPanelForm,
	type RoutinesPanelMissions,
	type RoutinesPanelProps,
	RoutinesPanelTrigger,
}
