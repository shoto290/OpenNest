"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"

import type {
	BotSkillDraft,
	BotSkillItem,
} from "@workspace/ui/components/bot-settings"
import { SkillEditor } from "@workspace/ui/components/bot-settings-dialog/skill-editor"
import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"

/** What `defaultOpenSkill` is given to mount on a skill that does not exist yet. */
const NEW_SKILL = "new"

const BLANK_SKILL: BotSkillDraft = { name: "", description: "", body: "" }

type SkillsPanelProps = {
	skills: BotSkillItem[]
	/** Fired once, with everything the reader wrote. The skill only exists after the
	 * surface answers with it, which is why nothing here is written as it is typed. */
	onCreate: (draft: BotSkillDraft) => void
	/** Fired on every keystroke, addressed by the id the editor was opened on — a
	 * renamed skill is still the same directory. */
	onChange: (id: string, draft: BotSkillDraft) => void
	onPreloadedChange: (id: string, isPreloaded: boolean) => void
	/** Fired only once the confirmation is accepted. */
	onDelete: (id: string) => void
	/** Which skill the panel mounts opened on, or `NEW_SKILL` for a blank one. Read
	 * once, as the panel mounts. */
	defaultOpenSkill?: string
}

/**
 * Every skill a bot carries, and the one being written. The list is the resting
 * state — a name, when the bot should reach for it, and whether it travels in the
 * prompt — and opening a row hands the whole panel to that skill, because a skill is
 * markdown somebody writes and it needs the height.
 *
 * The panel keeps no skill of its own: it holds which one is open, and the draft of
 * the one that does not exist yet. Everything else is reported to the surface, which
 * owns the writing.
 */
const SkillsPanel = ({
	skills,
	onCreate,
	onChange,
	onPreloadedChange,
	onDelete,
	defaultOpenSkill,
}: SkillsPanelProps) => {
	const { t } = useTranslation("bots")
	const [openId, setOpenId] = useState(defaultOpenSkill ?? null)
	const [draft, setDraft] = useState(BLANK_SKILL)

	const close = () => setOpenId(null)

	const add = () => {
		setDraft(BLANK_SKILL)
		setOpenId(NEW_SKILL)
	}

	if (openId === NEW_SKILL) {
		return (
			<SkillEditor
				draft={draft}
				onBack={close}
				onCreate={() => {
					onCreate(draft)
					close()
				}}
				onDraftChange={setDraft}
			/>
		)
	}

	const open = skills.find((skill) => skill.id === openId)

	if (open) {
		return (
			<SkillEditor
				draft={open}
				isPreloaded={open.isPreloaded}
				onBack={close}
				onDelete={() => {
					onDelete(open.id)
					close()
				}}
				onDraftChange={(next) => onChange(open.id, next)}
				onPreloadedChange={(next) => onPreloadedChange(open.id, next)}
			/>
		)
	}

	if (skills.length === 0) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
				<Icons.Skill
					aria-hidden="true"
					className="size-8 text-muted-foreground"
				/>
				<div className="flex flex-col gap-1">
					<span className="font-medium text-foreground text-sm">
						{t("skills.empty.title")}
					</span>
					<p className="max-w-xs text-muted-foreground text-sm">
						{t("skills.empty.description")}
					</p>
				</div>
				<Button onClick={add} size="sm">
					<Icons.Add aria-hidden="true" className="size-3.5" />
					{t("skills.add")}
				</Button>
			</div>
		)
	}

	return (
		<>
			<div className="flex shrink-0 justify-end">
				<Button onClick={add} size="sm" variant="outline">
					<Icons.Add aria-hidden="true" className="size-3.5" />
					{t("skills.add")}
				</Button>
			</div>
			<ul className="flex min-h-0 flex-1 list-none flex-col gap-2 overflow-y-auto p-0">
				{skills.map((skill) => (
					<li key={skill.id}>
						<button
							className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
							onClick={() => setOpenId(skill.id)}
							type="button"
						>
							<span className="flex min-w-0 flex-1 flex-col gap-0.5">
								<span className="truncate font-medium text-foreground text-sm">
									{skill.name.trim() || t("skills.untitled")}
								</span>
								{skill.description ? (
									<span className="truncate text-muted-foreground text-xs">
										{skill.description}
									</span>
								) : null}
							</span>
							{skill.isPreloaded ? (
								<span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-medium text-foreground text-xs">
									{t("skills.preloaded.tag")}
								</span>
							) : null}
							<Icons.Next
								aria-hidden="true"
								className="size-4 shrink-0 text-muted-foreground"
							/>
						</button>
					</li>
				))}
			</ul>
		</>
	)
}

export { NEW_SKILL, SkillsPanel, type SkillsPanelProps }
