import { describe, expect, it } from "vitest"

import {
	type BotSkillDraft,
	isSkillDraftUnsaved,
	toSkillDescriptionLength,
} from "@workspace/ui/components/bot-settings"

const SKILL: BotSkillDraft = {
	name: "release-notes",
	description: "How this project words a changelog entry",
	body: "One line per change.",
}

describe("isSkillDraftUnsaved", () => {
	it("reads a draft as untouched while every answer holds", () => {
		expect(isSkillDraftUnsaved({ ...SKILL }, SKILL)).toBe(false)
	})

	it("reads a changed answer as something to save", () => {
		expect(isSkillDraftUnsaved({ ...SKILL, body: "Two lines." }, SKILL)).toBe(
			true,
		)
	})

	it("reads a field answered for the first time as something to save", () => {
		expect(isSkillDraftUnsaved({ ...SKILL, isPreloaded: true }, SKILL)).toBe(
			true,
		)
	})

	it("reads a mark taken down as something to save", () => {
		expect(
			isSkillDraftUnsaved(
				{ ...SKILL, isUserInvocable: false },
				{ ...SKILL, isUserInvocable: true },
			),
		).toBe(true)
	})

	it("reads a field cleared back to nothing as unanswered rather than changed", () => {
		expect(
			isSkillDraftUnsaved(
				{ ...SKILL, whenToUse: "", effort: undefined },
				SKILL,
			),
		).toBe(false)
	})

	it("reads a skill nobody has written yet as something to save", () => {
		expect(isSkillDraftUnsaved(SKILL)).toBe(true)
	})
})

describe("toSkillDescriptionLength", () => {
	it("budgets the description and the sentence beside it as one", () => {
		expect(
			toSkillDescriptionLength({ ...SKILL, whenToUse: "Every Friday." }),
		).toBe(SKILL.description.length + "Every Friday.".length)
	})

	it("counts a skill that says only what it is for", () => {
		expect(toSkillDescriptionLength(SKILL)).toBe(SKILL.description.length)
	})
})
