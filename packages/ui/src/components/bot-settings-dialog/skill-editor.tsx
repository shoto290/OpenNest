"use client"

import { useId } from "react"
import { useTranslation } from "react-i18next"

import type { BotSkillDraft } from "@workspace/ui/components/bot-settings"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { Icons } from "@workspace/ui/components/icons"
import { SettingsField } from "@workspace/ui/components/settings-field"
import { FIELD_LABEL_CLASS } from "@workspace/ui/components/settings-styles"
import { Switch } from "@workspace/ui/components/switch"

type SkillEditorProps = {
	draft: BotSkillDraft
	/** Fired on every keystroke — the editor keeps no draft of its own. */
	onDraftChange: (draft: BotSkillDraft) => void
	/** Back to the list the editor was opened from. */
	onBack: () => void
	/** Whether the body travels in the bot's prompt. Left out for a skill that does
	 * not exist yet: the mark is written on its own, after the skill is there. */
	isPreloaded?: boolean
	onPreloadedChange?: (isPreloaded: boolean) => void
	/** Fired only once the confirmation is accepted. Left out for a skill that does
	 * not exist yet — there is nothing on the disk to take away. */
	onDelete?: () => void
	/** Writes the skill for the first time. Left out for one that already exists,
	 * which is written as it is typed. */
	onCreate?: () => void
	/** Whether the question mounts already up. Read once, as the editor mounts. */
	defaultConfirming?: boolean
}

/**
 * One skill, whole: what it is called, when the bot should reach for it, whether it
 * travels in the prompt, and the markdown it is written in.
 *
 * The mark comes before the body and wears a card of its own, because it is the one
 * field here that costs something on every turn — the sentence beside it is what
 * says so, and the switch is described by it rather than only labelled. The body
 * takes whatever height is left, the way the instructions field does: a skill is
 * markdown somebody writes, and a four-line box is not where that happens.
 *
 * A skill that already exists is written as it is typed. One that does not yet
 * carries a button instead, because a directory is only made once.
 */
const SkillEditor = ({
	draft,
	onDraftChange,
	onBack,
	isPreloaded,
	onPreloadedChange,
	onDelete,
	onCreate,
	defaultConfirming,
}: SkillEditorProps) => {
	const { t } = useTranslation("bots")
	const preloadId = useId()
	const name = draft.name.trim() || t("skills.untitled")

	const patch = (fields: Partial<BotSkillDraft>) =>
		onDraftChange({ ...draft, ...fields })

	return (
		<>
			<div className="flex shrink-0 items-center justify-between gap-2">
				<Button onClick={onBack} size="sm" variant="ghost">
					<Icons.Previous aria-hidden="true" className="size-3.5" />
					{t("skills.back")}
				</Button>
				{onDelete ? (
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
			</div>

			<SettingsField
				label={t("skills.name.label")}
				onValueChange={(value) => patch({ name: value })}
				placeholder={t("skills.name.placeholder")}
				value={draft.name}
			/>
			<SettingsField
				label={t("skills.description.label")}
				onValueChange={(value) => patch({ description: value })}
				placeholder={t("skills.description.placeholder")}
				value={draft.description}
			/>

			{onPreloadedChange ? (
				<div className="flex shrink-0 items-start justify-between gap-4 rounded-xl border border-border bg-muted/40 p-3">
					<div className="flex min-w-0 flex-col gap-1">
						<label className={FIELD_LABEL_CLASS} htmlFor={preloadId}>
							{t("skills.preloaded.label")}
						</label>
						<p
							className="text-muted-foreground text-xs leading-relaxed"
							id={`${preloadId}-hint`}
						>
							{t("skills.preloaded.description")}
						</p>
					</div>
					<Switch
						aria-describedby={`${preloadId}-hint`}
						checked={isPreloaded ?? false}
						id={preloadId}
						onCheckedChange={onPreloadedChange}
					/>
				</div>
			) : null}

			<SettingsField
				fill
				label={t("skills.body.label")}
				onValueChange={(value) => patch({ body: value })}
				placeholder={t("skills.body.placeholder")}
				value={draft.body}
			/>

			{onCreate ? (
				<div className="flex shrink-0 justify-end">
					<Button
						disabled={draft.name.trim().length === 0}
						onClick={onCreate}
						size="sm"
					>
						<Icons.Add aria-hidden="true" className="size-3.5" />
						{t("skills.create")}
					</Button>
				</div>
			) : null}
		</>
	)
}

export { SkillEditor, type SkillEditorProps }
