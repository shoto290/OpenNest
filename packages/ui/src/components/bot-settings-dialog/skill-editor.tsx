"use client"

import { Tabs } from "@base-ui/react/tabs"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
	type BotSkillDraft,
	isSkillDraftUnsaved,
	SKILL_CONTEXTS,
	SKILL_DESCRIPTION_LIMIT,
	SKILL_EFFORTS,
	SKILL_FLAG_DEFAULTS,
	toBundleName,
	toSkillDescriptionLength,
} from "@workspace/ui/components/bot-settings"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { Icons } from "@workspace/ui/components/icons"
import { SettingsField } from "@workspace/ui/components/settings-field"
import {
	RAIL_LABELS_MIN_WIDTH,
	SETTINGS_PANEL_CLASS,
	SETTINGS_SCROLLING_PANEL_CLASS,
	SettingsRail,
	SettingsRailBack,
	SettingsRailItem,
	SettingsRailSeparator,
} from "@workspace/ui/components/settings-rail"
import { SettingsSelect } from "@workspace/ui/components/settings-select"
import { SETTINGS_TAG_CLASS } from "@workspace/ui/components/settings-styles"
import { SettingsSwitch } from "@workspace/ui/components/settings-switch"
import { useIsNarrowerThan } from "@workspace/ui/hooks/use-is-narrower-than"
import { cn } from "@workspace/ui/lib/utils"

/** The section a skill opens on: what it tells the bot to do is the reason it
 * exists, and every other section answers a question about that one. */
const FIRST_SECTION = "instructions"

/** The agent and the background run leave with the fork they belong to: kept on a
 * skill that no longer forks, they would be saved from behind a section that no
 * longer shows them. */
const toContextPatch = (value: string) => {
	const context = SKILL_CONTEXTS.find((it) => it === value)

	if (context === "fork") return { context }

	return { context, agent: undefined, isBackground: undefined }
}

type SkillEditorProps = {
	draft: BotSkillDraft
	/** Fired on every keystroke. The editor keeps no draft of its own — and writes
	 * nothing either: the save is its own press. */
	onDraftChange: (draft: BotSkillDraft) => void
	/** The skill as it stands where it is kept, which is what the draft is weighed
	 * against to know there is something to save. Left out for a skill that does not
	 * exist yet: the save then reads as a creation and the delete stands down. */
	saved?: BotSkillDraft
	/** Back to the list the editor was opened from. Reached through a question while
	 * anything is unsaved. */
	onBack: () => void
	/** Fired with nothing: the surface already holds the draft it asked for. Only
	 * reachable while the skill is named, something has changed, and the description
	 * is inside its budget. */
	onSave: () => void
	/** Fired only once the confirmation is accepted. Left out for a skill that does
	 * not exist yet — there is nothing kept to take away. */
	onDelete?: () => void
	/** Whether the host wrote this skill. It is then read rather than edited: what it
	 * says, what it is for and what it tells the bot, and nothing to save, delete or
	 * carry into the prompt — every one of those is decided where it is generated. */
	isSystem?: boolean
	/** Which section the editor mounts on. Read once, as it mounts. */
	defaultSection?: string
	/** Whether the delete mounts with its question already up. Read once. */
	defaultConfirming?: boolean
	/** Whether the way out mounts with its question already up. Read once. */
	defaultLeaving?: boolean
	className?: string
}

/**
 * One skill, whole, on the whole surface: a rail of sections down the left and one
 * section at a time on the right. The rail is the summary — a reader who opens a
 * skill sees at once everything a skill can carry, rather than three fields and a
 * format they have to know about.
 *
 * Nothing is written as it is typed. Every keystroke reports the draft, and the save
 * is a press: a skill is a file with a frontmatter, and half a paragraph typed into
 * `when_to_use` is not a state worth keeping. So the draft can differ from what is
 * kept, the editor says so, and the way out asks before it drops it.
 *
 * The description and `when_to_use` are read as one paragraph by the bot deciding
 * whether to reach for the skill, so they are budgeted as one and counted against
 * that budget under the field. An agent and a background run only stand under a
 * forked context — they mean nothing in the conversation the skill was reached from.
 *
 * A skill the host wrote drops all of that: what it says, what it is for and what it
 * tells the bot, read-only on one surface, with a sentence saying who keeps it. There
 * is nothing to save, nothing to delete and no prompt to carry it into, so none of
 * those controls stand.
 */
const SkillEditor = ({
	draft,
	onDraftChange,
	saved,
	onBack,
	onSave,
	onDelete,
	isSystem = false,
	defaultSection,
	defaultConfirming,
	defaultLeaving,
	className,
}: SkillEditorProps) => {
	const { t } = useTranslation("bots")
	const [root, setRoot] = useState<HTMLDivElement | null>(null)
	const [isLeaving, setLeaving] = useState(Boolean(defaultLeaving))
	const iconsOnly = useIsNarrowerThan(root, RAIL_LABELS_MIN_WIDTH)

	const name = draft.name.trim() || t("skills.untitled")

	if (isSystem)
		return (
			<div className={cn("flex min-h-0 flex-1 flex-col", className)}>
				<div className="flex shrink-0 items-center gap-2 border-border border-b py-2 pr-5 pl-2">
					<Button onClick={onBack} size="sm" variant="ghost">
						<Icons.Previous aria-hidden="true" className="size-3.5" />
						{t("skills.back")}
					</Button>
					<span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm">
						{name}
					</span>
					<span className={cn(SETTINGS_TAG_CLASS, "text-muted-foreground")}>
						{t("skills.system.tag")}
					</span>
				</div>

				<div className={SETTINGS_PANEL_CLASS}>
					<p className="text-muted-foreground text-xs">
						{t("skills.system.notice")}
					</p>
					<SettingsField
						label={t("skills.name.label")}
						readOnly
						value={draft.name}
					/>
					<SettingsField
						label={t("skills.description.label")}
						readOnly
						rows={2}
						value={draft.description}
					/>
					<SettingsField
						fill
						label={t("skills.body.label")}
						readOnly
						value={draft.body}
					/>
				</div>
			</div>
		)

	const isWritten = Boolean(saved)
	const isUnsaved = isSkillDraftUnsaved(draft, saved)
	const used = toSkillDescriptionLength(draft)
	const isOverBudget = used > SKILL_DESCRIPTION_LIMIT
	const isSavable = isUnsaved && !isOverBudget && draft.name.trim().length > 0

	const patch = (fields: Partial<BotSkillDraft>) =>
		onDraftChange({ ...draft, ...fields })

	const leave = () => (isUnsaved ? setLeaving(true) : onBack())

	const effortOptions = [
		{ label: t("skills.effort.default"), value: "" },
		...SKILL_EFFORTS.map((effort) => ({
			label: t(`skills.effort.option.${effort}`),
			value: effort,
		})),
	]

	const contextOptions = [
		{ label: t("skills.context.default"), value: "" },
		...SKILL_CONTEXTS.map((context) => ({
			label: t(`skills.context.option.${context}`),
			value: context,
		})),
	]

	return (
		<Tabs.Root
			className={cn("flex min-h-0 flex-1", className)}
			defaultValue={defaultSection ?? FIRST_SECTION}
			orientation="vertical"
			ref={setRoot}
		>
			<SettingsRail
				iconsOnly={iconsOnly}
				leading={
					<>
						<SettingsRailBack
							iconsOnly={iconsOnly}
							label={t("skills.back")}
							onClick={leave}
						/>
						<SettingsRailSeparator />
					</>
				}
			>
				<SettingsRailItem
					icon={Icons.Docs}
					iconsOnly={iconsOnly}
					label={t("skills.section.instructions")}
					value={FIRST_SECTION}
				/>
				<SettingsRailItem
					icon={Icons.Skill}
					iconsOnly={iconsOnly}
					label={t("skills.section.triggering")}
					value="triggering"
				/>
				<SettingsRailItem
					icon={Icons.Terminal}
					iconsOnly={iconsOnly}
					label={t("skills.section.execution")}
					value="execution"
				/>
				<SettingsRailItem
					icon={Icons.Tool}
					iconsOnly={iconsOnly}
					label={t("skills.section.tools")}
					value="tools"
				/>
				<SettingsRailItem
					icon={Icons.Settings}
					iconsOnly={iconsOnly}
					label={t("skills.section.advanced")}
					value="advanced"
				/>
			</SettingsRail>

			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				<div className="flex shrink-0 items-center justify-between gap-2 border-border border-b px-5 py-3">
					<div className="flex min-w-0 items-center gap-2">
						<span className="truncate font-medium text-foreground text-sm">
							{name}
						</span>
						{isUnsaved ? (
							<span className={cn(SETTINGS_TAG_CLASS, "text-muted-foreground")}>
								{t("skills.unsaved")}
							</span>
						) : null}
					</div>
					<div className="flex shrink-0 items-center gap-2">
						{isWritten && onDelete ? (
							<ConfirmDialog
								confirmLabel={t("skills.delete.action")}
								defaultOpen={defaultConfirming}
								description={t("skills.delete.description")}
								onConfirm={onDelete}
								title={t("skills.delete.confirm.title", { name })}
								trigger={
									<>
										<Icons.Delete aria-hidden="true" className="size-3.5" />
										{t("skills.delete.action")}
									</>
								}
								triggerClassName={buttonVariants({
									variant: "destructive",
									size: "sm",
								})}
							/>
						) : null}
						<Button disabled={!isSavable} onClick={onSave} size="sm">
							{isWritten ? (
								<Icons.Check aria-hidden="true" className="size-3.5" />
							) : (
								<Icons.Add aria-hidden="true" className="size-3.5" />
							)}
							{isWritten ? t("skills.save") : t("skills.create")}
						</Button>
					</div>
				</div>

				<Tabs.Panel className={SETTINGS_PANEL_CLASS} value={FIRST_SECTION}>
					<SettingsField
						fill
						label={t("skills.body.label")}
						onValueChange={(value) => patch({ body: value })}
						placeholder={t("skills.body.placeholder")}
						value={draft.body}
					/>
					<SettingsField
						hint={t("skills.argumentHint.hint")}
						label={t("skills.argumentHint.label")}
						onValueChange={(value) => patch({ argumentHint: value })}
						placeholder={t("skills.argumentHint.placeholder")}
						value={draft.argumentHint ?? ""}
					/>
					<SettingsField
						label={t("skills.arguments.label")}
						onValueChange={(value) => patch({ arguments: value })}
						placeholder={t("skills.arguments.placeholder")}
						rows={2}
						value={draft.arguments ?? ""}
					/>
				</Tabs.Panel>

				<Tabs.Panel
					className={SETTINGS_SCROLLING_PANEL_CLASS}
					value="triggering"
				>
					<SettingsField
						hint={t("skills.name.hint")}
						label={t("skills.name.label")}
						onValueChange={(value) => patch({ name: toBundleName(value) })}
						placeholder={t("skills.name.placeholder")}
						value={draft.name}
					/>
					<SettingsField
						label={t("skills.description.label")}
						onValueChange={(value) => patch({ description: value })}
						placeholder={t("skills.description.placeholder")}
						rows={2}
						value={draft.description}
					/>
					<SettingsField
						error={
							isOverBudget
								? t("skills.budget.over", {
										over: used - SKILL_DESCRIPTION_LIMIT,
									})
								: undefined
						}
						hint={t("skills.budget.label", {
							max: SKILL_DESCRIPTION_LIMIT,
							used,
						})}
						label={t("skills.whenToUse.label")}
						onValueChange={(value) => patch({ whenToUse: value })}
						placeholder={t("skills.whenToUse.placeholder")}
						rows={3}
						value={draft.whenToUse ?? ""}
					/>
					<SettingsSwitch
						checked={
							draft.isModelInvocationDisabled ??
							SKILL_FLAG_DEFAULTS.isModelInvocationDisabled
						}
						description={t("skills.modelInvocation.description")}
						label={t("skills.modelInvocation.label")}
						onCheckedChange={(next) =>
							patch({ isModelInvocationDisabled: next })
						}
					/>
					<SettingsSwitch
						checked={
							draft.isUserInvocable ?? SKILL_FLAG_DEFAULTS.isUserInvocable
						}
						description={t("skills.userInvocable.description")}
						label={t("skills.userInvocable.label")}
						onCheckedChange={(next) => patch({ isUserInvocable: next })}
					/>
					<SettingsField
						hint={t("skills.paths.hint")}
						label={t("skills.paths.label")}
						onValueChange={(value) => patch({ paths: value })}
						placeholder={t("skills.paths.placeholder")}
						rows={3}
						value={draft.paths ?? ""}
					/>
					<SettingsSwitch
						checked={draft.isPreloaded ?? false}
						description={t("skills.preloaded.description")}
						label={t("skills.preloaded.label")}
						onCheckedChange={(next) => patch({ isPreloaded: next })}
					/>
				</Tabs.Panel>

				<Tabs.Panel
					className={SETTINGS_SCROLLING_PANEL_CLASS}
					value="execution"
				>
					<SettingsField
						hint={t("skills.model.hint")}
						label={t("skills.model.label")}
						onValueChange={(value) => patch({ model: value })}
						placeholder={t("skills.model.placeholder")}
						value={draft.model ?? ""}
					/>
					<SettingsSelect
						label={t("skills.effort.label")}
						onValueChange={(value) =>
							patch({ effort: SKILL_EFFORTS.find((it) => it === value) })
						}
						options={effortOptions}
						value={draft.effort ?? ""}
					/>
					<SettingsSelect
						hint={t("skills.context.hint")}
						label={t("skills.context.label")}
						onValueChange={(value) => patch(toContextPatch(value))}
						options={contextOptions}
						value={draft.context ?? ""}
					/>
					<SettingsField
						hint={t("skills.shell.hint")}
						label={t("skills.shell.label")}
						onValueChange={(value) => patch({ shell: value })}
						placeholder={t("skills.shell.placeholder")}
						value={draft.shell ?? ""}
					/>
					{draft.context === "fork" ? (
						<>
							<SettingsField
								hint={t("skills.agent.hint")}
								label={t("skills.agent.label")}
								onValueChange={(value) => patch({ agent: value })}
								placeholder={t("skills.agent.placeholder")}
								value={draft.agent ?? ""}
							/>
							<SettingsSwitch
								checked={draft.isBackground ?? SKILL_FLAG_DEFAULTS.isBackground}
								description={t("skills.background.description")}
								label={t("skills.background.label")}
								onCheckedChange={(next) => patch({ isBackground: next })}
							/>
						</>
					) : null}
				</Tabs.Panel>

				<Tabs.Panel className={SETTINGS_SCROLLING_PANEL_CLASS} value="tools">
					<SettingsField
						hint={t("skills.allowedTools.hint")}
						label={t("skills.allowedTools.label")}
						onValueChange={(value) => patch({ allowedTools: value })}
						placeholder={t("skills.allowedTools.placeholder")}
						rows={3}
						value={draft.allowedTools ?? ""}
					/>
					<SettingsField
						label={t("skills.disallowedTools.label")}
						onValueChange={(value) => patch({ disallowedTools: value })}
						placeholder={t("skills.disallowedTools.placeholder")}
						rows={3}
						value={draft.disallowedTools ?? ""}
					/>
					<SettingsField
						hint={t("skills.hooks.hint")}
						label={t("skills.hooks.label")}
						onValueChange={(value) => patch({ hooks: value })}
						placeholder={t("skills.hooks.placeholder")}
						rows={5}
						value={draft.hooks ?? ""}
					/>
				</Tabs.Panel>

				<Tabs.Panel className={SETTINGS_SCROLLING_PANEL_CLASS} value="advanced">
					<SettingsField
						label={t("skills.license.label")}
						onValueChange={(value) => patch({ license: value })}
						placeholder={t("skills.license.placeholder")}
						value={draft.license ?? ""}
					/>
					<SettingsField
						hint={t("skills.compatibility.hint")}
						label={t("skills.compatibility.label")}
						onValueChange={(value) => patch({ compatibility: value })}
						placeholder={t("skills.compatibility.placeholder")}
						value={draft.compatibility ?? ""}
					/>
					<SettingsField
						hint={t("skills.metadata.hint")}
						label={t("skills.metadata.label")}
						onValueChange={(value) => patch({ metadata: value })}
						placeholder={t("skills.metadata.placeholder")}
						rows={5}
						value={draft.metadata ?? ""}
					/>
				</Tabs.Panel>
			</div>

			<ConfirmDialog
				confirmLabel={t("skills.leave.action")}
				description={t("skills.leave.description")}
				onConfirm={onBack}
				onOpenChange={setLeaving}
				open={isLeaving}
				title={t("skills.leave.title")}
			/>
		</Tabs.Root>
	)
}

export { SkillEditor, type SkillEditorProps }
