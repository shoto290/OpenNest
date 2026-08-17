import { describe, expect, it } from "vitest"

import {
	ASKED_FOR,
	type LiveRun,
	NEARING_THE_BOUND,
	NEVER_STARTED,
	openedRun,
	REFUSED,
	rotationFor,
	rotationReasonForFailure,
	rotationReasonForStartFailure,
	STOPPED,
} from "./rotation"

import type { TransportError } from "../claude/contract"

const PROMPTS_PER_RUN = 3

describe("when a run has to be replaced", () => {
	// The one place these words are pinned. They are written to the durable
	// lineage, so whoever reads a rotated row a month later reads them — a rename
	// leaves the rows already on disk saying something this build no longer says.
	it("records a handover under the words the lineage keeps", () => {
		expect([
			ASKED_FOR,
			REFUSED,
			STOPPED,
			NEVER_STARTED,
			NEARING_THE_BOUND,
		]).toEqual([
			"asked for by hand",
			"the provider session was refused",
			"the provider stopped answering in it",
			"the provider never came up in it",
			"the context was nearing its bound",
		])
	})

	// The threshold is preventive: the run is replaced while it still answers, so
	// the conversation is never recovered from a refusal it could have avoided.
	it("replaces a run once it has carried its share, and not before", () => {
		const run = openedRun(false)

		for (run.prompts = 0; run.prompts < PROMPTS_PER_RUN; run.prompts += 1) {
			expect(rotationFor(run, PROMPTS_PER_RUN)).toBeNull()
		}

		expect(rotationFor(run, PROMPTS_PER_RUN)).toBe(NEARING_THE_BOUND)
	})

	// A run known to be spent is replaced for the reason it was spent for, however
	// little it has carried: the process behind it is gone either way.
	it("replaces a spent run for the reason it was spent for", () => {
		const run: LiveRun = { ...openedRun(false), spent: REFUSED }

		expect(rotationFor(run, PROMPTS_PER_RUN)).toBe(REFUSED)
	})

	// Only two failures say the provider session itself is gone. The rest describe
	// the install or a single call, and rotating on those would open a run per
	// attempt and start none of them.
	it.each([
		[{ kind: "resumeFailed", forgotSessionId: true }, REFUSED],
		[{ kind: "crashed", code: 1, detail: null }, STOPPED],
		[{ kind: "notStarted" }, null],
		[{ kind: "turnAlreadyRunning" }, null],
		[{ kind: "binaryNotFound", searched: [] }, null],
		[{ kind: "notAuthenticated" }, null],
		[{ kind: "writeFailed", detail: "pipe closed" }, null],
	] as [TransportError, string | null][])("reads %o as %s", (error, reason) => {
		expect(rotationReasonForFailure(error)).toBe(reason)
	})

	// A start is the other half: the row was opened before the process was asked
	// for, so a failure there always leaves a run to replace, whatever it says. The
	// two failures that name the session keep their word; everything else says what
	// actually happened — nothing ever came up in that run.
	it.each([
		[{ kind: "resumeFailed", forgotSessionId: false }, REFUSED],
		[{ kind: "crashed", code: 1, detail: null }, STOPPED],
		[{ kind: "spawnFailed", detail: "no child" }, NEVER_STARTED],
		[{ kind: "startupTimeout", timeoutMs: 30_000 }, NEVER_STARTED],
		[{ kind: "transitionInProgress" }, NEVER_STARTED],
	] as [TransportError, string][])(
		"replaces a run whose start failed with %o for %s",
		(error, reason) => {
			expect(rotationReasonForStartFailure(error)).toBe(reason)
		},
	)
})
