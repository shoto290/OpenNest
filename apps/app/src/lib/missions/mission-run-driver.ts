import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import {
	GITHUB_SOURCE,
	type MissionChanged,
	type MissionDetail,
	type MissionEvent,
	type MissionState,
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

export type MissionRunUnsubscribe = () => void

export type MissionRunPort = {
	onChanged: (
		listener: (changed: MissionChanged) => void,
	) => Promise<MissionRunUnsubscribe>
	detail: (missionId: string) => Promise<MissionDetail>
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
}

const CAUSE_OF_STATE: Partial<Record<MissionState, MissionRunCause>> = {
	waiting_bot: "answer",
	done: "merge",
}

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

const isMergedOnGitHub = (events: MissionEvent[]) =>
	[...events].reverse().find((event) => event.kind === "closed")?.source ===
	GITHUB_SOURCE

const callFor = ({ mission, events }: MissionDetail): MissionRunCall | null => {
	const cause = CAUSE_OF_STATE[mission.state]

	if (!cause) {
		return null
	}

	if (cause === "merge" && !isMergedOnGitHub(events)) {
		return null
	}

	return { cause, mission, events }
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
	const starting = new Set<string>()
	const states = createMissionStates()

	const raiseFailure = (reason: unknown) => {
		console.error("mission run driver: the run was refused", reason)
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

	const end = (held: LiveMissionRun) => {
		live.delete(held.call.mission.id)
		shutdownSession(held.scope)
	}

	const refuse = async (held: LiveMissionRun, reason: string) => {
		const { scope } = held
		end(held)
		await driver.cancelTurn(scope).catch(reporting("agent_cancel_turn"))
		raiseFailure(reason)
	}

	const openScope = async ({ mission }: MissionRunCall) => {
		const opened = await store.openRuntimeSession(
			mission.threadConversationId,
			mission.botId,
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
			live.set(id, { call, scope })
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
		if (!states.entered(changed) || !CAUSE_OF_STATE[changed.state]) {
			return
		}

		if (isBusy(changed.missionId)) {
			return
		}

		starting.add(changed.missionId)
		try {
			const call = callFor(await missions.detail(changed.missionId))
			if (call) {
				await begin(call)
			}
		} catch (thrown) {
			raiseFailure(`the mission could not be read: ${detailOf(thrown)}`)
		} finally {
			starting.delete(changed.missionId)
		}
	}

	const writeReport = ({ call, scope }: LiveMissionRun, text: string) => {
		const { mission } = call

		return runtimes.runtimeFor(mission.threadConversationId).reportRun({
			conversationId: mission.threadConversationId,
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

	const changes = listening(
		missions.onChanged((changed) => void consider(changed)),
		"mission run driver: mission changes could not be listened to",
	)
	const events = listening(
		driver.subscribe(route),
		"mission run driver: agent events could not be listened to",
	)

	return () => {
		for (const held of [...live.values()]) {
			end(held)
		}
		void changes.then((stop) => stop())
		void events.then((stop) => stop())
	}
}
