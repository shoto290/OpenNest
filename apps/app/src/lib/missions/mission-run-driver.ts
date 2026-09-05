import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import type {
	MissionChanged,
	MissionDetail,
	MissionOnBoard,
	MissionState,
} from "./mission-contract"
import {
	type MissionRunCall,
	type MissionRunCause,
	missionRunPromptFor,
} from "./mission-run-prompt"
import { createMissionStates } from "./mission-states"

import type {
	RuntimeScope,
	ScopedEvent,
	TransportError,
	TurnEnded,
} from "../agent/contract"
import { isSameRuntimeScope } from "../chat/chat-state"
import type { ChatDriver } from "../chat/driver"
import { needsFreshSession } from "../chat/screen-model"
import type { ConversationRuntimes } from "../conversations/conversation-runtimes"
import type { TranscriptStore } from "../conversations/store-port"
import { RUN_OUTPUT_SCHEMA, readRunReport } from "../routines/run-output"

export const MISSION_TRIGGER_SOURCE = "mission"

export const RUN_DEADLINE_MS = 30 * 60_000

export type MissionRunUnsubscribe = () => void

export type MissionRunPort = {
	board: () => Promise<Pick<MissionOnBoard, "mission">[]>
	onChanged: (
		listener: (changed: MissionChanged) => void,
	) => Promise<MissionRunUnsubscribe>
	detail: (missionId: string) => Promise<MissionDetail>
	rosterBlock: (conversationId: string, botId: string) => Promise<string | null>
}

export type MissionRunDriverOptions = {
	driver: Pick<
		ChatDriver,
		| "startOrResumeSession"
		| "submitPrompt"
		| "cancelTurn"
		| "shutdown"
		| "subscribe"
	>
	store: Pick<TranscriptStore, "openRuntimeSession">
	runtimes: Pick<ConversationRuntimes, "runtimeFor">
	missions: MissionRunPort
	reportFailure: (notice: NoticeMessage) => void
	now?: () => number
}

type LiveMissionRun = {
	call: MissionRunCall
	scope: RuntimeScope
	deadline: ReturnType<typeof setTimeout>
}

const CAUSE_OF_STATE: Partial<Record<MissionState, MissionRunCause>> = {
	waiting_bot: "answer",
	done: "done",
	failed: "failed",
}

const ORIGIN_CAUSES: MissionRunCause[] = ["done", "failed"]

const isOnOrigin = (cause: MissionRunCause) => ORIGIN_CAUSES.includes(cause)

const conversationOf = ({ cause, mission }: MissionRunCall) =>
	isOnOrigin(cause)
		? mission.originConversationId
		: mission.threadConversationId

const CAUGHT_UP_STATES: MissionState[] = ["waiting_bot"]

const isCaughtUpOn = ({ mission }: Pick<MissionOnBoard, "mission">) =>
	CAUGHT_UP_STATES.includes(mission.state)

const detailOf = (thrown: unknown) =>
	thrown instanceof Error ? thrown.message : String(thrown)

const reporting = (command: string) => (reason: unknown) => {
	console.error(`mission run driver: ${command} failed`, reason)
}

const listening = (
	opening: Promise<MissionRunUnsubscribe>,
	label: string,
): Promise<MissionRunUnsubscribe> =>
	opening.catch((reason) => {
		console.error(label, reason)
		return () => undefined
	})

const callFor = ({ mission, events }: MissionDetail): MissionRunCall | null => {
	const cause = CAUSE_OF_STATE[mission.state]

	return cause ? { cause, mission, events } : null
}

export const startMissionRunDriver = ({
	driver,
	store,
	runtimes,
	missions,
	reportFailure,
	now = () => Date.now(),
}: MissionRunDriverOptions): (() => void) => {
	const live = new Map<string, LiveMissionRun>()
	const kept = new Map<string, MissionChanged>()
	const starting = new Set<string>()
	const states = createMissionStates()
	let isStopped = false

	const raiseFailure = (reason: unknown) => {
		console.error("mission run driver: the run failed", reason)
		reportFailure({
			title: i18n.t("chat:missions.failure.run.title"),
			description: i18n.t("chat:missions.failure.run.description"),
		})
	}

	const isBusy = (missionId: string) =>
		starting.has(missionId) || live.has(missionId)

	const shutdownSession = (scope: RuntimeScope) => {
		void driver.shutdown(scope).catch(reporting("agent_shutdown"))
	}

	const takeAgain = (missionId: string) => {
		if (live.has(missionId)) {
			return
		}

		const changed = kept.get(missionId)
		kept.delete(missionId)

		if (changed && !isStopped) {
			void consider(changed)
		}
	}

	const forget = (held: LiveMissionRun) => {
		const { id } = held.call.mission
		clearTimeout(held.deadline)
		live.delete(id)
		takeAgain(id)
	}

	const end = (held: LiveMissionRun) => {
		forget(held)
		shutdownSession(held.scope)
	}

	const refuse = async (held: LiveMissionRun, reason: string) => {
		const { scope } = held
		forget(held)
		await driver.cancelTurn(scope).catch(reporting("agent_cancel_turn"))
		shutdownSession(scope)
		raiseFailure(reason)
	}

	const expire = async (missionId: string) => {
		const held = live.get(missionId)

		if (!held) {
			return
		}

		await refuse(held, "the mission run outlived its deadline")
	}

	const rosterBlockOf = async ({ cause, mission }: MissionRunCall) => {
		if (!isOnOrigin(cause)) {
			return null
		}

		try {
			return await missions.rosterBlock(
				mission.originConversationId,
				mission.botId,
			)
		} catch (thrown) {
			reporting("conversation_roster_block")(thrown)
			return null
		}
	}

	const openScope = async (call: MissionRunCall) => {
		const opened = await store.openRuntimeSession(
			conversationOf(call),
			call.mission.botId,
			now(),
			null,
			null,
		)
		return {
			conversationId: opened.conversationId,
			botId: opened.botId,
			runtimeSessionId: opened.id,
			epoch: opened.seq,
		}
	}

	const begin = async (call: MissionRunCall) => {
		const { id } = call.mission
		try {
			const scope = await openScope(call)
			live.set(id, {
				call,
				scope,
				deadline: setTimeout(() => void expire(id), RUN_DEADLINE_MS),
			})
			await driver.startOrResumeSession(
				scope,
				undefined,
				undefined,
				RUN_OUTPUT_SCHEMA,
			)
			await driver.submitPrompt(scope, missionRunPromptFor(call))
		} catch (thrown) {
			const held = live.get(id)
			if (held) {
				end(held)
			}
			raiseFailure(`the mission run could not start: ${detailOf(thrown)}`)
		}
	}

	const consider = async (changed: MissionChanged) => {
		if (isBusy(changed.missionId)) {
			kept.set(changed.missionId, changed)
			return
		}

		if (!states.entered(changed) || !CAUSE_OF_STATE[changed.state]) {
			return
		}

		starting.add(changed.missionId)
		try {
			const call = callFor(await missions.detail(changed.missionId))
			if (call) {
				states.remember({
					missionId: changed.missionId,
					state: call.mission.state,
				})
				await begin({ ...call, rosterBlock: await rosterBlockOf(call) })
			}
		} catch (thrown) {
			raiseFailure(`the mission could not be read: ${detailOf(thrown)}`)
		} finally {
			starting.delete(changed.missionId)
			takeAgain(changed.missionId)
		}
	}

	const writeReport = ({ call, scope }: LiveMissionRun, text: string) => {
		const { mission } = call
		const conversationId = conversationOf(call)

		return runtimes.runtimeFor(conversationId).reportRun({
			conversationId,
			botId: mission.botId,
			runtimeSessionId: scope.runtimeSessionId,
			text,
			routineTitle: mission.ticket.externalId,
			triggerSourceId: MISSION_TRIGGER_SOURCE,
		})
	}

	const settle = async (held: LiveMissionRun, ended: TurnEnded) => {
		end(held)

		if (ended.outcome !== "completed") {
			return raiseFailure(`the mission run's turn was ${ended.outcome}`)
		}

		const report = readRunReport(ended.structuredOutput)

		if (!report) {
			return raiseFailure("the mission run ended with no structured output")
		}

		if (report.outcome === "nothing") {
			return
		}

		try {
			await writeReport(held, report.text)
		} catch (thrown) {
			raiseFailure(`the report could not be written: ${detailOf(thrown)}`)
		}
	}

	const fail = (held: LiveMissionRun, error: TransportError) => {
		if (!needsFreshSession(error)) {
			return
		}
		end(held)
		raiseFailure(`the mission run's session failed with ${error.kind}`)
	}

	const runAt = (scope: RuntimeScope | null) =>
		[...live.values()].find((held) => isSameRuntimeScope(scope, held.scope))

	const route = ({ scope, event }: ScopedEvent) => {
		const held = runAt(scope)

		if (!held) {
			return
		}

		switch (event.type) {
			case "turnEnded":
				return void settle(held, event.ended)
			case "failed":
				return fail(held, event.error)
			case "questionRequested":
				return void refuse(held, "a mission run cannot be asked a question")
			case "permissionRequested":
				return void refuse(held, "a mission run cannot be asked a permission")
			default:
				return
		}
	}

	const catchUpOnOpenMissions = async () => {
		const onBoard = await missions.board()

		if (isStopped) {
			return
		}

		for (const { mission } of onBoard.filter(isCaughtUpOn)) {
			void consider({ missionId: mission.id, state: mission.state })
		}
	}

	const changes = listening(
		missions.onChanged((changed) => void consider(changed)),
		"mission run driver: mission changes could not be listened to",
	)
	const events = listening(
		driver.subscribe(route),
		"mission run driver: agent events could not be listened to",
	)

	void catchUpOnOpenMissions().catch((reason) => {
		console.error(
			"mission run driver: the open missions could not be read",
			reason,
		)
	})

	return () => {
		isStopped = true

		for (const held of [...live.values()]) {
			end(held)
		}
		void changes.then((stop) => stop())
		void events.then((stop) => stop())
	}
}
