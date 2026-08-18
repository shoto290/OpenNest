import type { TransportError } from "../claude/contract"

/** The words a rotation goes on the record under. They are written to the
 * lineage and read by whoever asks it later why a run was left behind, so each
 * is spelled once, here. */
export const ASKED_FOR = "asked for by hand"
export const REFUSED = "the provider session was refused"
export const STOPPED = "the provider stopped answering in it"
/** The row was opened and the process behind it never came up. It is its own word
 * because it is its own state: the run has a place in the lineage and has never
 * held anything, which is not a session that stopped and not one that was refused. */
export const NEVER_STARTED = "the provider never came up in it"
export const NEARING_THE_BOUND = "the context was nearing its bound"
/** The bot was described again. A process is started as the bot reads at that
 * moment — its instructions are the system prompt it was given, its directory is
 * where it was put — and neither can be said to a child that is already running. */
export const REDESCRIBED = "the bot was described again"

/** Why a run was left behind. Every rotation records one: a replaced row with no
 * reason is a handover nobody can account for afterwards, and the only row that
 * legitimately has none is the first of a lineage, which replaces nothing. */
export type RotationReason =
	| typeof ASKED_FOR
	| typeof REFUSED
	| typeof STOPPED
	| typeof NEVER_STARTED
	| typeof NEARING_THE_BOUND
	| typeof REDESCRIBED

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
	/** Whether the process behind this run holds the conversation already. A
	 * resumed session does, without ever having been told it here: it is the same
	 * process, still holding what it heard the first time. */
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

/** Why a run whose start failed has to be replaced. It always has to be: the row
 * is on the record and nothing is answering in it, so the only question the error
 * settles is which word the row is left behind under. */
export function rotationReasonForStartFailure(
	error: TransportError,
): RotationReason {
	return rotationReasonForFailure(error) ?? NEVER_STARTED
}

/** Whether the next prompt has to be given to a new run, and why. A run already
 * known to be spent is replaced for the reason it was spent for; one that is still
 * answering is replaced only once it has carried its share. */
export function rotationFor(
	run: LiveRun,
	promptsPerRun: number,
): RotationReason | null {
	return run.spent ?? (run.prompts >= promptsPerRun ? NEARING_THE_BOUND : null)
}
