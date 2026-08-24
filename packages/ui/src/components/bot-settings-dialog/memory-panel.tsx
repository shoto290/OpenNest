"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { Icons } from "@workspace/ui/components/icons"
import { SettingsField } from "@workspace/ui/components/settings-field"
import {
	FIELD_CONTROL_CLASS,
	FIELD_CONTROL_READONLY_CLASS,
	FIELD_LABEL_CLASS,
} from "@workspace/ui/components/settings-styles"
import { cn } from "@workspace/ui/lib/utils"

type MemoryPanelProps = {
	memory: string
	onSave: (memory: string) => void
}

const EMPTY_CLASS = cn(
	FIELD_CONTROL_CLASS,
	FIELD_CONTROL_READONLY_CLASS,
	"text-muted-foreground",
)

const MemoryPanel = ({ memory, onSave }: MemoryPanelProps) => {
	const { t } = useTranslation("bots")
	const [edit, setEdit] = useState({ base: memory, draft: memory })
	const [isClearing, setIsClearing] = useState(false)

	const draft = edit.base === memory ? edit.draft : memory
	const isSaved = draft === memory

	if (memory === "") {
		return (
			<div className="flex shrink-0 flex-col gap-1.5">
				<span className={FIELD_LABEL_CLASS}>{t("dialog.memory.label")}</span>
				<p className={EMPTY_CLASS}>{t("dialog.memory.empty")}</p>
			</div>
		)
	}

	return (
		<div className="flex shrink-0 flex-col gap-2">
			<SettingsField
				hint={t("dialog.memory.hint")}
				label={t("dialog.memory.label")}
				onValueChange={(next) => setEdit({ base: memory, draft: next })}
				rows={6}
				value={draft}
			/>

			<div className="flex items-center justify-end gap-2">
				<Button onClick={() => setIsClearing(true)} size="sm" variant="outline">
					<Icons.Delete aria-hidden="true" className="size-3.5" />
					{t("dialog.memory.clear.action")}
				</Button>
				<Button disabled={isSaved} onClick={() => onSave(draft)} size="sm">
					<Icons.Check aria-hidden="true" className="size-3.5" />
					{t("dialog.memory.save")}
				</Button>
			</div>

			<ConfirmDialog
				confirmLabel={t("dialog.memory.clear.confirm")}
				description={t("dialog.memory.clear.description")}
				onConfirm={() => onSave("")}
				onOpenChange={setIsClearing}
				open={isClearing}
				title={t("dialog.memory.clear.title")}
			/>
		</div>
	)
}

export { MemoryPanel, type MemoryPanelProps }
