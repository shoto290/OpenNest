import { describe, expect, it } from "vitest"

import { toSkillDraft, toSkillItem } from "./skill-draft"

import type { BotSkill } from "../conversations/store-contract"

const A_SKILL: BotSkill = {
	id: "release-notes",
	name: "release-notes",
	description: "How this project words a changelog entry",
	body: "One line per change.",
	isPreloaded: true,
	isSystem: false,
	files: [],
	whenToUse: "A release is being cut",
	argumentHint: "[version]",
	arguments: ["version", "draft"],
	disableModelInvocation: false,
	userInvocable: true,
	paths: ["CHANGELOG.md", "docs/**/*.md"],
	model: "sonnet",
	effort: "medium",
	context: "fork",
	agent: "release-writer",
	background: true,
	allowedTools: ["Read", "Grep"],
	disallowedTools: null,
	hooks: { PreToolUse: [] },
	shell: "/bin/zsh",
	metadata: { author: "Ada Martin" },
	license: "MIT",
	compatibility: ">=1.4",
}

describe("toSkillItem", () => {
	it("lays a list out a line each", () => {
		const item = toSkillItem(A_SKILL)

		expect(item.arguments).toBe("version\ndraft")
		expect(item.paths).toBe("CHANGELOG.md\ndocs/**/*.md")
	})

	it("reads a key the file never answered as an empty field", () => {
		expect(toSkillItem(A_SKILL).disallowedTools).toBe("")
	})

	it("renames the marks the editor states in the positive", () => {
		const item = toSkillItem(A_SKILL)

		expect(item.isUserInvocable).toBe(true)
		expect(item.isBackground).toBe(true)
		expect(item.isModelInvocationDisabled).toBe(false)
	})

	it("stands a mark the file says nothing about on what it means unsaid", () => {
		const item = toSkillItem({
			...A_SKILL,
			disableModelInvocation: null,
			userInvocable: null,
			background: null,
		})

		expect(item.isUserInvocable).toBe(true)
		expect(item.isBackground).toBe(true)
		expect(item.isModelInvocationDisabled).toBe(false)
	})

	it("keeps an effort or a context the editor has no name for out of it", () => {
		const item = toSkillItem({ ...A_SKILL, effort: "extreme", context: null })

		expect(item.effort).toBeUndefined()
		expect(item.context).toBeUndefined()
	})

	it("lays a shape out as JSON and leaves plain words alone", () => {
		const item = toSkillItem(A_SKILL)

		expect(item.hooks).toBe('{\n  "PreToolUse": []\n}')
		expect(item.compatibility).toBe(">=1.4")
	})
})

describe("toSkillDraft", () => {
	it("comes back to what it was read from", () => {
		const draft = toSkillDraft(toSkillItem(A_SKILL), A_SKILL)

		expect(draft).toMatchObject({
			whenToUse: A_SKILL.whenToUse,
			arguments: A_SKILL.arguments,
			paths: A_SKILL.paths,
			allowedTools: A_SKILL.allowedTools,
			hooks: A_SKILL.hooks,
			metadata: A_SKILL.metadata,
			compatibility: A_SKILL.compatibility,
			userInvocable: true,
			background: true,
		})
	})

	it("asks for a key to go once its box is left empty", () => {
		const draft = toSkillDraft(
			{ ...toSkillItem(A_SKILL), whenToUse: "", paths: "" },
			A_SKILL,
		)

		expect(draft.whenToUse).toBeNull()
		expect(draft.paths).toBeNull()
	})

	it("drops the blank lines a reader leaves in a list", () => {
		const draft = toSkillDraft({
			...toSkillItem(A_SKILL),
			allowedTools: "Read\n\n  Grep  \n",
		})

		expect(draft.allowedTools).toEqual(["Read", "Grep"])
	})

	it("leaves a mark out of a file that never carried it", () => {
		const unmarked: BotSkill = {
			...A_SKILL,
			disableModelInvocation: null,
			userInvocable: null,
			background: null,
		}

		const draft = toSkillDraft(toSkillItem(unmarked), unmarked)

		expect(draft.userInvocable).toBeNull()
		expect(draft.background).toBeNull()
		expect(draft.disableModelInvocation).toBeNull()
	})

	it("writes a mark the file carries, whatever it says", () => {
		const marked: BotSkill = { ...A_SKILL, userInvocable: false }

		const draft = toSkillDraft(toSkillItem(marked), marked)

		expect(draft.userInvocable).toBe(false)
	})

	it("writes a mark a reader moved off what it means unsaid", () => {
		const unmarked: BotSkill = {
			...A_SKILL,
			userInvocable: null,
			background: null,
		}

		const draft = toSkillDraft(
			{ ...toSkillItem(unmarked), isUserInvocable: false },
			unmarked,
		)

		expect(draft.userInvocable).toBe(false)
		expect(draft.background).toBeNull()
	})

	it("writes nothing but what a creation was marked with", () => {
		const draft = toSkillDraft({
			name: "release-notes",
			description: "How this project words a changelog entry",
			body: "One line per change.",
			isModelInvocationDisabled: true,
		})

		expect(draft.disableModelInvocation).toBe(true)
		expect(draft.userInvocable).toBeNull()
		expect(draft.background).toBeNull()
	})
})
