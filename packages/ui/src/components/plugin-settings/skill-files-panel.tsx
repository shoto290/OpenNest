"use client"

import { type ReactNode, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button, buttonVariants } from "@workspace/ui/components/button"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { Icons } from "@workspace/ui/components/icons"
import { Notice } from "@workspace/ui/components/notice"
import { SettingsField } from "@workspace/ui/components/settings-field"
import { SETTINGS_TAG_CLASS } from "@workspace/ui/components/settings-styles"
import { cn } from "@workspace/ui/lib/utils"

type SkillFileFailure = "read" | "write" | "delete"

type OpenedSkillFile = {
	skillId: string
	path: string
	text?: string
	failure?: SkillFileFailure
}

type PluginSkillFiles = {
	paths: Record<string, string[]>
	opened: OpenedSkillFile | null
	onOpen: (skillId: string, path: string) => void
	onClose: () => void
	onAdd: (skillId: string, path: string) => void
	onSave: (skillId: string, path: string, text: string) => void
	onDelete: (skillId: string, path: string) => void
}

type SkillFile = {
	path: string
	text?: string
	failure?: SkillFileFailure
}

type SkillFilesPanelProps = {
	paths: string[]
	opened: SkillFile | null
	onOpen: (path: string) => void
	onClose: () => void
	onAdd: (path: string) => void
	onSave: (path: string, text: string) => void
	onDelete: (path: string) => void
}

type SkillFileEditorProps = {
	path: string
	saved: string
	failure?: SkillFileFailure
	onSave: (text: string) => void
	onDelete: () => void
	onBack: () => void
}

type SkillFileHeaderProps = {
	path: string
	onBack: () => void
	children?: ReactNode
}

const SkillFileHeader = ({ path, onBack, children }: SkillFileHeaderProps) => {
	const { t } = useTranslation("bots")

	return (
		<div className="flex shrink-0 items-center gap-2">
			<Button onClick={onBack} size="sm" variant="ghost">
				<Icons.Previous aria-hidden="true" className="size-3.5" />
				{t("skills.files.back")}
			</Button>
			<span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm">
				{path}
			</span>
			{children}
		</div>
	)
}

const SkillFileEditor = ({
	path,
	saved,
	failure,
	onSave,
	onDelete,
	onBack,
}: SkillFileEditorProps) => {
	const { t } = useTranslation("bots")
	const [text, setText] = useState(saved)
	const isUnsaved = text !== saved

	return (
		<>
			<SkillFileHeader onBack={onBack} path={path}>
				{isUnsaved ? (
					<span className={cn(SETTINGS_TAG_CLASS, "text-muted-foreground")}>
						{t("skills.unsaved")}
					</span>
				) : null}
				<ConfirmDialog
					confirmLabel={t("skills.files.delete.action")}
					description={t("skills.files.delete.description")}
					onConfirm={onDelete}
					title={t("skills.files.delete.confirm.title", { path })}
					trigger={
						<>
							<Icons.Delete aria-hidden="true" className="size-3.5" />
							{t("skills.files.delete.action")}
						</>
					}
					triggerClassName={buttonVariants({
						variant: "destructive",
						size: "sm",
					})}
				/>
				<Button disabled={!isUnsaved} onClick={() => onSave(text)} size="sm">
					<Icons.Check aria-hidden="true" className="size-3.5" />
					{t("skills.files.save")}
				</Button>
			</SkillFileHeader>
			{failure ? <Notice title={t(`skills.files.failure.${failure}`)} /> : null}
			<SettingsField
				fill
				label={t("skills.files.text.label")}
				onValueChange={setText}
				placeholder={t("skills.files.text.placeholder")}
				value={text}
			/>
		</>
	)
}

const SkillFilesPanel = ({
	paths,
	opened,
	onOpen,
	onClose,
	onAdd,
	onSave,
	onDelete,
}: SkillFilesPanelProps) => {
	const { t } = useTranslation("bots")
	const [added, setAdded] = useState("")

	const path = added.trim()
	const isAddable = path.length > 0 && !paths.includes(path)

	const add = () => {
		onAdd(path)
		setAdded("")
	}

	if (opened && opened.text === undefined) {
		return (
			<>
				<SkillFileHeader onBack={onClose} path={opened.path} />
				{opened.failure ? (
					<Notice
						retry={{
							label: t("skills.files.retry"),
							onRetry: () => onOpen(opened.path),
						}}
						title={t(`skills.files.failure.${opened.failure}`)}
					/>
				) : (
					<span className="flex items-center gap-2 text-muted-foreground text-xs">
						<Icons.Loading
							aria-hidden="true"
							className="size-3.5 animate-spin motion-reduce:animate-none"
						/>
						{t("skills.files.loading")}
					</span>
				)}
			</>
		)
	}

	if (opened) {
		return (
			<SkillFileEditor
				failure={opened.failure}
				key={opened.path}
				onBack={onClose}
				onDelete={() => onDelete(opened.path)}
				onSave={(text) => onSave(opened.path, text)}
				path={opened.path}
				saved={opened.text ?? ""}
			/>
		)
	}

	return (
		<>
			<div className="flex shrink-0 flex-col gap-2">
				<SettingsField
					hint={t("skills.files.add.hint")}
					label={t("skills.files.add.label")}
					onValueChange={setAdded}
					placeholder={t("skills.files.add.placeholder")}
					value={added}
				/>
				<div className="flex justify-end">
					<Button
						disabled={!isAddable}
						onClick={add}
						size="sm"
						variant="outline"
					>
						<Icons.Add aria-hidden="true" className="size-3.5" />
						{t("skills.files.add.action")}
					</Button>
				</div>
			</div>
			{paths.length > 0 ? (
				<ul className="flex min-h-0 flex-1 list-none flex-col gap-2 overflow-y-auto p-0">
					{paths.map((held) => (
						<li key={held}>
							<button
								className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
								onClick={() => onOpen(held)}
								type="button"
							>
								<Icons.File
									aria-hidden="true"
									className="size-4 shrink-0 text-muted-foreground"
								/>
								<span className="min-w-0 flex-1 truncate text-foreground text-sm">
									{held}
								</span>
								<Icons.Next
									aria-hidden="true"
									className="size-4 shrink-0 text-muted-foreground"
								/>
							</button>
						</li>
					))}
				</ul>
			) : null}
		</>
	)
}

export {
	type OpenedSkillFile,
	type PluginSkillFiles,
	type SkillFile,
	type SkillFileFailure,
	SkillFilesPanel,
	type SkillFilesPanelProps,
}
