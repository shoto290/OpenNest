import { describe, expect, it } from "vitest"

import {
	BLANK_SKILL_DRAFT,
	type BotSkillDraft,
	isSameSkillDraft,
	toSkillDescriptionLength,
} from "@workspace/ui/components/bot-settings"

const SKILL: BotSkillDraft = {
	name: "release-notes",
	description: "How this project words a changelog entry",
	body: "One line per change.",
}

describe("isSameSkillDraft", () => {
	it("reads a draft as untouched while every answer holds", () => {
		expect(isSameSkillDraft(SKILL, { ...SKILL })).toBe(true)
	})

	it("reads a changed answer as something to save", () => {
		expect(isSameSkillDraft(SKILL, { ...SKILL, body: "Two lines." })).toBe(
			false,
		)
	})

	it("reads a field answered for the first time as something to save", () => {
		expect(isSameSkillDraft(SKILL, { ...SKILL, isPreloaded: true })).toBe(false)
	})

	it("reads a field cleared back to nothing as unanswered rather than changed", () => {
		expect(
			isSameSkillDraft(SKILL, {
				...SKILL,
				whenToUse: "",
				isPreloaded: false,
				effort: undefined,
			}),
		).toBe(true)
	})

	it("tells a written skill from one nobody has written", () => {
		expect(isSameSkillDraft(SKILL, BLANK_SKILL_DRAFT)).toBe(false)
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
