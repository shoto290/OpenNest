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

/** The two sides of a skill say the same things in different words, and this is
 * where they are translated.
 *
 * The store speaks the file: a list is a list, a key nobody answered is `null`, and
 * `hooks`, `metadata` and `compatibility` are whatever YAML held. The editor speaks
 * the field a reader types in: a list is a line each, an unanswered key is an empty
 * box, and an object is the text of it. Neither shape is wrong for its side, so the
 * mapping lives here rather than bending one of them to the other. */

const toLines = (values: string[] | null | undefined) =>
	values ? values.join("\n") : ""

/** A field read back as a list: one entry a line, blank lines dropped. Nothing left
 * is `null` rather than an empty list — the store reads that as a key asked to go. */
const toList = (text: string | undefined) => {
	const values = (text ?? "")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)

	return values.length > 0 ? values : null
}

/** A value the file held, as text a reader can edit: a string stays itself, anything
 * with a shape is laid out as JSON. */
const toText = (value: BotSkillValue | undefined) => {
	if (value === undefined || value === null) return ""

	return typeof value === "string" ? value : JSON.stringify(value, null, 2)
}

/** Text read back as a value the file can hold: JSON when it parses as JSON, the
 * words themselves when it does not — `>=1.4` is a compatibility, not broken JSON. */
const toValue = (text: string | undefined): BotSkillValue => {
	const trimmed = (text ?? "").trim()

	if (trimmed.length === 0) return null

	try {
		return JSON.parse(trimmed) as BotSkillValue
	} catch {
		return trimmed
	}
}

/** A mark read back as the file holds it. A default is a resting state rather than
 * an answer, so a switch left where a file that never carried the key put it keeps
 * the key out of the file — a `user-invocable: false` nobody asked for would take
 * the skill out of the command menu. A file that already carries the key is written
 * every time, and so is a switch a reader moved: from that save on the key is the
 * file's, and every save after carries it. */
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

/** A skill of the store's, as the editor asks for it. */
export const toSkillItem = (skill: BotSkill): BotSkillItem => ({
	id: skill.id,
	name: skill.name,
	description: skill.description,
	body: skill.body,
	isPreloaded: skill.isPreloaded,
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

/** What the editor wrote, as the store takes it. Every box is answered, because the
 * editor showed every one of them: a box the reader left empty is a key asked to go,
 * not a key left alone. The marks are the exception, and `kept` — the skill as the
 * bundle holds it, absent for a creation — is what tells a default apart from an
 * answer. */
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
