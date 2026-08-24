import {
	type BotSkillContext,
	type BotSkillEffort,
	type BotSkillItem,
	type BotSkillDraft as EditedSkill,
	SKILL_CONTEXTS,
	SKILL_EFFORTS,
	SKILL_FLAG_DEFAULTS,
} from "@workspace/ui/components/bot-settings"

import type {
	BotSkill,
	BotSkillDraft,
	BotSkillValue,
} from "../conversations/store-contract"

const toLines = (values: string[] | null | undefined) =>
	values ? values.join("\n") : ""

const toList = (text: string | undefined) => {
	const values = (text ?? "")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)

	return values.length > 0 ? values : null
}

const toText = (value: BotSkillValue | undefined) => {
	if (value === undefined || value === null) return ""

	return typeof value === "string" ? value : JSON.stringify(value, null, 2)
}

const toValue = (text: string | undefined): BotSkillValue => {
	const trimmed = (text ?? "").trim()

	if (trimmed.length === 0) return null

	try {
		return JSON.parse(trimmed) as BotSkillValue
	} catch {
		return trimmed
	}
}

const toFlag = (
	moved: boolean | undefined,
	kept: boolean | null | undefined,
	fallback: boolean,
) => {
	if (kept === null || kept === undefined) {
		return moved === undefined || moved === fallback ? null : moved
	}

	return moved ?? kept
}

const toOption = <Option extends string>(
	options: readonly Option[],
	value: string | null | undefined,
) => options.find((option) => option === value)

export const toSkillItem = (skill: BotSkill): BotSkillItem => ({
	id: skill.id,
	name: skill.name,
	description: skill.description,
	body: skill.body,
	isPreloaded: skill.isPreloaded,
	isSystem: skill.isSystem,
	whenToUse: skill.whenToUse ?? "",
	argumentHint: skill.argumentHint ?? "",
	arguments: toLines(skill.arguments),
	isModelInvocationDisabled:
		skill.disableModelInvocation ??
		SKILL_FLAG_DEFAULTS.isModelInvocationDisabled,
	isUserInvocable: skill.userInvocable ?? SKILL_FLAG_DEFAULTS.isUserInvocable,
	paths: toLines(skill.paths),
	model: skill.model ?? "",
	effort: toOption<BotSkillEffort>(SKILL_EFFORTS, skill.effort),
	context: toOption<BotSkillContext>(SKILL_CONTEXTS, skill.context),
	shell: skill.shell ?? "",
	agent: skill.agent ?? "",
	isBackground: skill.background ?? SKILL_FLAG_DEFAULTS.isBackground,
	allowedTools: toLines(skill.allowedTools),
	disallowedTools: toLines(skill.disallowedTools),
	hooks: toText(skill.hooks),
	license: skill.license ?? "",
	compatibility: toText(skill.compatibility),
	metadata: toText(skill.metadata),
})

export const toSkillDraft = (
	edited: EditedSkill,
	kept?: BotSkill,
): BotSkillDraft => ({
	name: edited.name,
	description: edited.description,
	body: edited.body,
	whenToUse: edited.whenToUse || null,
	argumentHint: edited.argumentHint || null,
	arguments: toList(edited.arguments),
	disableModelInvocation: toFlag(
		edited.isModelInvocationDisabled,
		kept?.disableModelInvocation,
		SKILL_FLAG_DEFAULTS.isModelInvocationDisabled,
	),
	userInvocable: toFlag(
		edited.isUserInvocable,
		kept?.userInvocable,
		SKILL_FLAG_DEFAULTS.isUserInvocable,
	),
	paths: toList(edited.paths),
	model: edited.model || null,
	effort: edited.effort ?? null,
	context: edited.context ?? null,
	shell: edited.shell || null,
	agent: edited.agent || null,
	background: toFlag(
		edited.isBackground,
		kept?.background,
		SKILL_FLAG_DEFAULTS.isBackground,
	),
	allowedTools: toList(edited.allowedTools),
	disallowedTools: toList(edited.disallowedTools),
	hooks: toValue(edited.hooks),
	license: edited.license || null,
	compatibility: toValue(edited.compatibility),
	metadata: toValue(edited.metadata),
})
