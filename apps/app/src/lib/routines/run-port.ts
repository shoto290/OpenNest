import type { RunClosing, RunRequested } from "./routine-contract"

export type RunRequestListener = (requested: RunRequested) => void

export type RunUnsubscribe = () => void

export type RunPort = {
	onRunRequested: (listener: RunRequestListener) => Promise<RunUnsubscribe>
	renewLease: (runId: string) => Promise<void>
	closeRun: (runId: string, closing: RunClosing) => Promise<unknown>
}
