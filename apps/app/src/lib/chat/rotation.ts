import type { TransportError } from "../claude/contract"

/** Why a run was left behind, in the words the durable lineage keeps. Every
 * rotation records one: a replaced row with no reason is a handover nobody can
 * account for afterwards, and the only row that legitimately has none is the first
 * of a lineage, which replaces nothing. */
export type RotationReason =
	| "asked for by hand"
	| "the provider session was refused"
	| "the provider stopped answering in it"
	| "the context was nearing its bound"

export const ASKED_FOR: RotationReason = "asked for by hand"
export const REFUSED: RotationReason = "the provider session was refused"
export const STOPPED: RotationReason = "the provider stopped answering in it"
export const NEARING_THE_BOUND: RotationReason =
	"the context was nearing its bound"

/** How many prompts one provider session carries before it is replaced on
 * purpose. The threshold is preventive: a session is rotated while it still
 * answers, so the conversation never has to be recovered from a refusal.
 *
 * Counted in prompts rather than in tokens because prompts are what this side can
 * count honestly — a provider's own accounting is not on the wire, and a number
 * derived from characters would be a guess dressed as a measurement. */
export const PROMPTS_PER_RUN = 24

/** What this launch knows about the run it is holding. Not durable and not on the
 * screen: the row is the host's, and what is here is only what decides whether the
 * next prompt may be given to this process as it stands. */
export type LiveRun = {
	/** Whether the process behind this run has already been told the conversation.
	 * A resumed session was never told and does not need to be — it is the same
	 * process, still holding what it was told before. */
	carried: boolean
	/** How many prompts this run has carried, which is what the preventive
	 * threshold is measured against. */
	prompts: number
	/** Why this run has to be replaced before it is given another prompt, once
	 * something has said so. */
	spent: RotationReason | null
}

export function openedRun(carried: boolean): LiveRun {
	return { carried, prompts: 0, spent: null }
}

/** Whether a failure means the provider session behind a run is gone.
 *
 * Only two of them do. A refused resume says the id was not one the provider would
 * take, and a child that exited says the provider stopped answering in that session
 * — which is what a hard limit looks like from here, since the CLI ends the process
 * rather than the turn. Everything else describes the install or a single call: a
 * missing binary is not a session to rotate, and rotating on it would open a run
 * per attempt and start none of them. */
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

/** Whether the next prompt has to be given to a new run, and why. A run already
 * known to be spent is replaced for the reason it was spent for; one that is still
 * answering is replaced only once it has carried its share. */
export function rotationFor(
	run: LiveRun,
	promptsPerRun: number,
): RotationReason | null {
	if (run.spent) {
		return run.spent
	}
	return run.prompts >= promptsPerRun ? NEARING_THE_BOUND : null
}
