import type { RunClosing, RunRequested } from "./routine-contract"
import type { RunPort, RunRequestListener } from "./run-port"

export type ClosedRun = {
	runId: string
	closing: RunClosing
}

export type FakeRunPort = RunPort & {
	renewals: string[]
	closings: ClosedRun[]
	request: (requested: RunRequested) => void
}

export const createFakeRunPort = (): FakeRunPort => {
	const renewals: string[] = []
	const closings: ClosedRun[] = []
	const listeners = new Set<RunRequestListener>()

	return {
		renewals,
		closings,

		onRunRequested: async (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},

		renewLease: async (runId) => {
			renewals.push(runId)
		},

		closeRun: async (runId, closing) => {
			closings.push({ runId, closing })
		},

		request: (requested) => {
			for (const listener of [...listeners]) {
				listener(requested)
			}
		},
	}
}
