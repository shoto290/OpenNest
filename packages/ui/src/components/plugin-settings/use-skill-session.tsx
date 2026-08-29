"use client"

import { type ReactNode, useState } from "react"

import {
	BLANK_SKILL_DRAFT,
	type BotSkillDraft,
	type BotSkillItem,
	isSkillDraftUnsaved,
} from "@workspace/ui/components/bot-settings"
import { SkillEditor } from "@workspace/ui/components/plugin-settings/skill-editor"
import type {
	PluginSkillFiles,
	SkillFilesPanelProps,
} from "@workspace/ui/components/plugin-settings/skill-files-panel"
import { SkillsPanel } from "@workspace/ui/components/plugin-settings/skills-panel"

type SkillSessionProps = {
	skills: BotSkillItem[]
	files?: PluginSkillFiles
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
	files,
	onSkillCreate,
	onSkillChange,
	onSkillPreloadedChange,
	onSkillDelete,
}: SkillSessionProps): SkillSession => {
	const [session, setSession] = useState<OpenedSkill | null>(null)

	const close = () => {
		files?.onClose()
		setSession(null)
	}

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

		close()
	}

	const remove = (saved: BotSkillItem) => {
		onSkillDelete(saved.id)
		close()
	}

	const filesOf = (saved?: BotSkillItem): SkillFilesPanelProps | undefined => {
		if (!files || !saved || saved.isSystem) return undefined

		const opened = files.opened
		const skillId = saved.id

		return {
			paths: files.paths[skillId] ?? [],
			opened: opened?.skillId === skillId ? opened : null,
			onOpen: (path) => files.onOpen(skillId, path),
			onClose: files.onClose,
			onAdd: (path) => files.onAdd(skillId, path),
			onSave: (path, text) => files.onSave(skillId, path, text),
			onDelete: (path) => files.onDelete(skillId, path),
		}
	}

	const editorFor = ({ draft, saved }: OpenedSkill) => (
		<SkillEditor
			draft={draft}
			files={filesOf(saved)}
			isSystem={saved?.isSystem}
			onBack={close}
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
		discard: close,
	}
}

export { type SkillSession, type SkillSessionProps, useSkillSession }
