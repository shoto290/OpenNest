"use client"

import { type ReactNode, useState } from "react"

import {
	BLANK_SKILL_DRAFT,
	type BotSkillDraft,
	type BotSkillItem,
	isSkillDraftUnsaved,
} from "@workspace/ui/components/bot-settings"
import { SkillEditor } from "@workspace/ui/components/plugin-settings/skill-editor"
import { SkillsPanel } from "@workspace/ui/components/plugin-settings/skills-panel"

type SkillSessionProps = {
	skills: BotSkillItem[]
	onSkillCreate: (draft: BotSkillDraft, isPreloaded: boolean) => void
	onSkillChange: (id: string, draft: BotSkillDraft) => void
	onSkillPreloadedChange: (id: string, isPreloaded: boolean) => void
	onSkillDelete: (id: string) => void
}

type SkillSession = {
	panel: ReactNode
	editor: ReactNode
	isUnsaved: boolean
	discard: () => void
}

type OpenedSkill = {
	draft: BotSkillDraft
	saved?: BotSkillItem
}

const useSkillSession = ({
	skills,
	onSkillCreate,
	onSkillChange,
	onSkillPreloadedChange,
	onSkillDelete,
}: SkillSessionProps): SkillSession => {
	const [session, setSession] = useState<OpenedSkill | null>(null)

	const save = ({ draft, saved }: OpenedSkill) => {
		const isPreloaded = draft.isPreloaded ?? false

		if (!saved) {
			onSkillCreate(draft, isPreloaded)
		} else {
			onSkillChange(saved.id, draft)
			if (isPreloaded !== saved.isPreloaded) {
				onSkillPreloadedChange(saved.id, isPreloaded)
			}
		}

		setSession(null)
	}

	const remove = (saved: BotSkillItem) => {
		onSkillDelete(saved.id)
		setSession(null)
	}

	const editorFor = ({ draft, saved }: OpenedSkill) => (
		<SkillEditor
			draft={draft}
			isSystem={saved?.isSystem}
			onBack={() => setSession(null)}
			onDelete={saved ? () => remove(saved) : undefined}
			onDraftChange={(next) => setSession({ draft: next, saved })}
			onSave={() => save({ draft, saved })}
			saved={saved}
		/>
	)

	return {
		panel: (
			<SkillsPanel
				onAdd={() => setSession({ draft: BLANK_SKILL_DRAFT })}
				onOpen={(saved) => setSession({ draft: saved, saved })}
				skills={skills}
			/>
		),
		editor: session ? editorFor(session) : null,
		isUnsaved: Boolean(
			session && isSkillDraftUnsaved(session.draft, session.saved),
		),
		discard: () => setSession(null),
	}
}

export { type SkillSession, type SkillSessionProps, useSkillSession }
