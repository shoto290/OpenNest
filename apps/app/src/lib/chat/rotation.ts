import type { TransportError } from "../agent/contract"

export const ASKED_FOR = "asked for by hand"
export const REFUSED = "the provider session was refused"
export const STOPPED = "the provider stopped answering in it"
export const NEVER_STARTED = "the provider never came up in it"
export const NEARING_THE_BOUND = "the context was nearing its bound"
export const REDESCRIBED = "the bot was described again"
export const EVOLVED = "the bot learned something"

export type RotationReason =
	| typeof ASKED_FOR
	| typeof REFUSED
	| typeof STOPPED
	| typeof NEVER_STARTED
	| typeof NEARING_THE_BOUND
	| typeof REDESCRIBED
	| typeof EVOLVED

export const PROMPTS_PER_RUN = 24

export type LiveRun = {
	carried: boolean
	prompts: number
	spent: RotationReason | null
}

export function openedRun(carried: boolean): LiveRun {
	return { carried, prompts: 0, spent: null }
}

export function rotationReasonForFailure(
	error: TransportError,
): RotationReason | null {
	if (error.kind === "resumeFailed") {
		return REFUSED
	}
	if (error.kind === "crashed") {
		return STOPPED
	}
	return null
}

export function rotationReasonForStartFailure(
	error: TransportError,
): RotationReason {
	return rotationReasonForFailure(error) ?? NEVER_STARTED
}

export function rotationFor(
	run: LiveRun,
	promptsPerRun: number,
): RotationReason | null {
	return run.spent ?? (run.prompts >= promptsPerRun ? NEARING_THE_BOUND : null)
}
