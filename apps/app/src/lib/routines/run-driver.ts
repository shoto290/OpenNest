import type { RunClosing, RunRequested } from "./routine-contract"
import { RUN_OUTPUT_SCHEMA, readRunReport } from "./run-output"
import type { RunPort, RunUnsubscribe } from "./run-port"
import { runPromptFor } from "./run-prompt"

import type {
	RuntimeScope,
	ScopedEvent,
	TurnEnded,
	TurnOutcome,
} from "../agent/contract"
import { isSameRuntimeScope } from "../chat/chat-state"
import type { ChatDriver } from "../chat/driver"
import type { ConversationRuntimes } from "../conversations/conversation-runtimes"
import type { TranscriptStore } from "../conversations/store-port"

export const LEASE_INTERVAL_MS = 60_000

export type RunDriverOptions = {
	driver: Pick<
		ChatDriver,
		"startOrResumeSession" | "submitPrompt" | "shutdown" | "subscribe"
	>
	store: Pick<TranscriptStore, "openRuntimeSession">
	runtimes: Pick<ConversationRuntimes, "runtimeFor">
	runs: RunPort
	now?: () => number
}

type LiveRun = {
	requested: RunRequested
	scope: RuntimeScope
	lease: ReturnType<typeof setInterval>
}

const REASON_FOR_OUTCOME: Record<Exclude<TurnOutcome, "completed">, string> = {
	cancelled: "the run's turn was cancelled",
	failed: "the run's turn failed",
}

const MISSING_OUTPUT_REASON = "the run's turn ended with no structured output"

const detailOf = (thrown: unknown) =>
	thrown instanceof Error ? thrown.message : JSON.stringify(thrown)

const listening = (
	opening: Promise<RunUnsubscribe>,
	label: string,
): Promise<RunUnsubscribe> =>
	opening.catch((reason) => {
		console.error(label, reason)
		return () => undefined
	})

export const startRunDriver = ({
	driver,
	store,
	runtimes,
	runs,
	now = () => Date.now(),
}: RunDriverOptions): (() => void) => {
	const live = new Map<string, LiveRun>()

	const close = (runId: string, closing: RunClosing) =>
		runs.closeRun(runId, closing).catch((reason) => {
			console.error("run driver: routine_close_run failed", reason)
		})

	const renew = (runId: string) =>
		runs.renewLease(runId).catch((reason) => {
			console.error("run driver: routine_renew_lease failed", reason)
		})

	const end = (held: LiveRun) => {
		clearInterval(held.lease)
		live.delete(held.requested.runId)
		void driver.shutdown(held.scope).catch((reason) => {
			console.error("run driver: agent_shutdown failed", reason)
		})
	}

	const openScope = async ({ conversationId, botId }: RunRequested) => {
		const opened = await store.openRuntimeSession(
			conversationId,
			botId,
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

	const begin = async (requested: RunRequested) => {
		const { runId } = requested
		try {
			const scope = await openScope(requested)
			live.set(runId, {
				requested,
				scope,
				lease: setInterval(() => void renew(runId), LEASE_INTERVAL_MS),
			})
			await driver.startOrResumeSession(
				scope,
				undefined,
				undefined,
				RUN_OUTPUT_SCHEMA,
			)
			await driver.submitPrompt(scope, runPromptFor(requested))
		} catch (thrown) {
			const held = live.get(runId)
			if (held) {
				end(held)
			}
			await close(runId, {
				outcome: "failed",
				reason: `the run could not start: ${detailOf(thrown)}`,
			})
		}
	}

	const writeReport = ({ requested, scope }: LiveRun, text: string) =>
		runtimes.runtimeFor(requested.conversationId).reportRun({
			conversationId: requested.conversationId,
			botId: requested.botId,
			runtimeSessionId: scope.runtimeSessionId,
			text,
		})

	const closingFor = async (
		held: LiveRun,
		ended: TurnEnded,
	): Promise<RunClosing> => {
		if (ended.outcome !== "completed") {
			return { outcome: "failed", reason: REASON_FOR_OUTCOME[ended.outcome] }
		}
		const report = readRunReport(ended.structuredOutput)
		if (!report) {
			return { outcome: "failed", reason: MISSING_OUTPUT_REASON }
		}
		if (report.outcome === "nothing") {
			return { outcome: "nothing" }
		}
		try {
			await writeReport(held, report.text)
		} catch (thrown) {
			return {
				outcome: "failed",
				reason: `the report could not be written: ${detailOf(thrown)}`,
			}
		}
		return { outcome: "ok" }
	}

	const settle = async (held: LiveRun, ended: TurnEnded) => {
		end(held)
		const closing = await closingFor(held, ended)
		await close(held.requested.runId, {
			...closing,
			costUsd: ended.totalCostUsd,
			modelUsage: ended.modelUsage,
		})
	}

	const runAt = (scope: RuntimeScope | null) =>
		[...live.values()].find((held) => isSameRuntimeScope(scope, held.scope))

	const route = ({ scope, event }: ScopedEvent) => {
		if (event.type !== "turnEnded") {
			return
		}
		const held = runAt(scope)
		if (!held) {
			return
		}
		void settle(held, event.ended)
	}

	const requests = listening(
		runs.onRunRequested((requested) => void begin(requested)),
		"run driver: run requests could not be listened to",
	)
	const events = listening(
		driver.subscribe(route),
		"run driver: agent events could not be listened to",
	)

	return () => {
		for (const held of [...live.values()]) {
			end(held)
		}
		void requests.then((stop) => stop())
		void events.then((stop) => stop())
	}
}
