import { type ReactNode, useState } from "react"

import { ActivityIndicator } from "@workspace/ui/components/activity-indicator"
import { AppHeader } from "@workspace/ui/components/app-header"
import {
	AppSidebar,
	type AppSidebarConversation,
} from "@workspace/ui/components/app-sidebar"
import { HeaderConversationButton } from "@workspace/ui/components/header-conversation-button"
import { HeaderIdentityButton } from "@workspace/ui/components/header-identity-button"
import { Markdown } from "@workspace/ui/components/markdown"
import { MissionTurn } from "@workspace/ui/components/mission-turn"
import {
	type PinnedMessage,
	PinnedMessages,
} from "@workspace/ui/components/pinned-messages"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import { type RosterBot, RosterProvider } from "@workspace/ui/components/roster"
import {
	type EarlierTodayRow,
	RoutinesPanel,
	RoutinesPanelTrigger,
} from "@workspace/ui/components/routines-panel"
import { ThreadLayout } from "@workspace/ui/components/thread-layout"
import type { TranscriptItem } from "@workspace/ui/components/transcript"
import { AssistantTurn, UserTurn } from "@workspace/ui/components/turn"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"

import { SCENE_COPY } from "./copy"
import {
	CONVERSATIONS_BY_SPACE,
	PERSONAL,
	READER,
	ROSTER_BY_SPACE,
	type SceneLoop,
	SPACES,
	spaceOf,
} from "./scene-cast"
import { exchangeOf, type SceneTurn } from "./scene-threads"
import { useReaderAvatar } from "./use-reader-avatar"
import { type SceneFrame, useSceneTimeline } from "./use-scene-timeline"
import { WindowControls } from "./window-controls"

const ROW_ENTER =
	"animate-in slide-in-from-bottom-1 duration-200 ease-out motion-reduce:animate-none"

// The fold at 1440x900 reveals 359px of the shell: the scene reclaims one
// spacing step of the thread layout's top padding to keep its newest row inside.
const TRANSCRIPT_INSET = "pt-4"

const NO_PINS: PinnedMessage[] = []

const NO_ACTIVITY: EarlierTodayRow[] = []

const doNothing = () => {}

const sceneRow = (key: string, body: ReactNode): TranscriptItem => ({
	key,
	render: () => <div className={ROW_ENTER}>{body}</div>,
})

const loopRows = (loop: SceneLoop, frame: SceneFrame): TranscriptItem[] => {
	const [first, second] = loop.speakers
	const rows: TranscriptItem[] = [
		sceneRow(
			"request",
			<UserTurn>
				<Markdown>{loop.request}</Markdown>
			</UserTurn>,
		),
	]

	if (frame.hasFirstAnswer) {
		rows.push(
			sceneRow(
				"first-answer",
				<AssistantTurn author={first}>
					<Markdown>{loop.answers[0].slice(0, frame.firstTyped)}</Markdown>
				</AssistantTurn>,
			),
		)
	}

	if (frame.hasSecondAnswer) {
		rows.push(
			sceneRow(
				"second-answer",
				<AssistantTurn author={second}>
					<Markdown>{loop.answers[1].slice(0, frame.secondTyped)}</Markdown>
				</AssistantTurn>,
			),
		)
	}

	if (frame.hasMission) {
		rows.push(
			sceneRow(
				"mission",
				<MissionTurn mission={loop.mission} onOpen={doNothing} />,
			),
		)
	}

	return rows
}

const turnRow = (turn: SceneTurn, rank: number): TranscriptItem => {
	const key = `turn-${rank}`

	if (turn.kind === "reader") {
		return sceneRow(
			key,
			<UserTurn>
				<Markdown>{turn.text}</Markdown>
			</UserTurn>,
		)
	}

	if (turn.kind === "mission") {
		return sceneRow(
			key,
			<MissionTurn mission={turn.mission} onOpen={doNothing} />,
		)
	}

	return sceneRow(
		key,
		<AssistantTurn author={turn.bot} cause={turn.cause} footer={turn.note}>
			<Markdown>{turn.text}</Markdown>
		</AssistantTurn>,
	)
}

type ThreadTitleProps = {
	bot?: RosterBot
	conversation: AppSidebarConversation
	onOpen: () => void
}

const ThreadTitle = ({ bot, conversation, onOpen }: ThreadTitleProps) =>
	bot ? (
		<HeaderIdentityButton
			animal={bot.animal}
			blot={bot.blot}
			connection="ready"
			name={bot.name}
			onOpenSettings={onOpen}
			seed={bot.id}
		/>
	) : (
		<HeaderConversationButton
			bots={conversation.participants}
			name={conversation.name}
			onOpenSettings={onOpen}
		/>
	)

type WorkingRowsProps = {
	loop: SceneLoop
	frame: SceneFrame
}

const WorkingRows = ({ loop, frame }: WorkingRowsProps) => {
	const [first, second] = loop.speakers

	return (
		<>
			{frame.hasFirstAnswer ? null : (
				<ActivityIndicator
					animal={first.animal}
					blot={first.blot}
					botId={first.id}
					className={ROW_ENTER}
					elapsedSeconds={frame.elapsedSeconds}
					kind="thinking"
					name={first.name}
					seed={first.id}
				/>
			)}
			{frame.hasSecondAnswer ? null : (
				<ActivityIndicator
					animal={second.animal}
					blot={second.blot}
					botId={second.id}
					className={ROW_ENTER}
					elapsedSeconds={frame.elapsedSeconds}
					kind={frame.hasFirstAnswer ? "writing" : "thinking"}
					name={second.name}
					seed={second.id}
				/>
			)}
		</>
	)
}

export const AppScene = () => {
	const [spaceId, setSpaceId] = useState(PERSONAL.id)
	const [selectedId, setSelectedId] = useState(PERSONAL.defaultConversation.id)
	const [isPanelOpen, setPanelOpen] = useState(false)
	const [draft, setDraft] = useState("")
	const readerAvatar = useReaderAvatar()
	const space = spaceOf(spaceId)
	const exchange = exchangeOf(selectedId)
	const { frame, engage, cancelIdle } = useSceneTimeline({
		answers: space.loop.answers,
		onIdle: () => {
			setSelectedId(space.defaultConversation.id)
			setPanelOpen(false)
			setDraft("")
		},
		runId: exchange ? null : selectedId,
	})
	const select = (id: string) => {
		engage()
		setSelectedId(id)
	}
	const selectSpace = (id: string) => {
		cancelIdle()
		setSpaceId(id)
		setSelectedId(spaceOf(id).defaultConversation.id)
	}
	const openPanel = (isOpen: boolean) => {
		engage()
		setPanelOpen(isOpen)
	}

	return (
		<section
			aria-label={SCENE_COPY.sceneLabel}
			className="relative size-full"
			onFocus={engage}
			onKeyDown={engage}
			onPointerDown={engage}
		>
			<WindowControls />
			<RosterProvider bots={space.bots}>
				<WorkspaceShell
					defaultOpen
					isLandmark={false}
					sidebar={
						<AppSidebar
							bots={space.rows}
							botsBySpaceId={ROSTER_BY_SPACE}
							conversationsBySpaceId={CONVERSATIONS_BY_SPACE}
							insetWindowControls
							onCreateBot={engage}
							onCreateConversation={engage}
							onOpenSearch={engage}
							onSelectBot={select}
							onSelectConversation={select}
							onSelectSpace={selectSpace}
							selectedBotId={exchange?.bot ? selectedId : undefined}
							selectedConversationId={exchange?.bot ? undefined : selectedId}
							selectedSpaceId={space.id}
							spaces={SPACES}
							user={{ ...READER, image: readerAvatar }}
						/>
					}
					spaceTint={space.colour}
				>
					<RoutinesPanel
						failure={null}
						isOpen={isPanelOpen}
						missions={{
							earlierToday: NO_ACTIVITY,
							onOpen: doNothing,
							open: space.missions,
						}}
						onDelete={doNothing}
						onEnabledChange={doNothing}
						onOpenChange={openPanel}
						onRetry={doNothing}
						routines={space.routines}
					>
						<ThreadLayout
							autoScroll={false}
							className="h-full"
							composer={
								<PromptInput
									onValueChange={setDraft}
									placeholder={SCENE_COPY.composerPlaceholder}
									value={draft}
								/>
							}
							contentClassName={TRANSCRIPT_INSET}
							header={
								<AppHeader
									leading={
										<ThreadTitle
											bot={exchange?.bot}
											conversation={
												exchange?.conversation ?? space.defaultConversation
											}
											onOpen={engage}
										/>
									}
									trailing={
										<>
											<PinnedMessages
												messages={NO_PINS}
												onJump={doNothing}
												onUnpin={doNothing}
											/>
											<RoutinesPanelTrigger />
										</>
									}
								/>
							}
							rows={
								exchange
									? exchange.turns.map(turnRow)
									: loopRows(space.loop, frame)
							}
						>
							{exchange ? null : (
								<WorkingRows frame={frame} loop={space.loop} />
							)}
						</ThreadLayout>
					</RoutinesPanel>
				</WorkspaceShell>
			</RosterProvider>
		</section>
	)
}
