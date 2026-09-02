import { invoke } from "@tauri-apps/api/core"

import type {
	Routine,
	RoutineDraft,
	RoutineEdit,
	RoutineKey,
	RoutineRun,
	RunClosing,
	TriggerDecision,
} from "./routine-contract"

export const RUN_REQUESTED_EVENT = "routine://run-requested"

export const DEFAULT_RUN_PAGE = 50

export const routinesTransport = {
	create: (draft: RoutineDraft) => invoke<Routine>("routine_create", { draft }),
	update: (id: string, edit: RoutineEdit) =>
		invoke<Routine>("routine_update", { id, edit }),
	delete: (id: string) => invoke<void>("routine_delete", { id }),
	list: (conversationId: string) =>
		invoke<Routine[]>("routine_list", { conversationId }),
	runs: (routineId: string, limit = DEFAULT_RUN_PAGE) =>
		invoke<RoutineRun[]>("routine_runs", { routineId, limit }),
	runNow: (id: string) => invoke<TriggerDecision>("routine_run_now", { id }),
	renewLease: (runId: string) => invoke<void>("routine_renew_lease", { runId }),
	closeRun: (runId: string, closing: RunClosing) =>
		invoke<RoutineRun>("routine_close_run", { runId, closing }),
	key: (id: string) => invoke<RoutineKey>("routine_key", { id }),
}
