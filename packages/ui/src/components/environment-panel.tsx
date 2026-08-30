"use client"

import { type FormEvent, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import {
	Content,
	Description,
	Root,
	Title,
} from "@workspace/ui/components/dialog"
import { Icons } from "@workspace/ui/components/icons"
import { Notice } from "@workspace/ui/components/notice"
import { SettingsField } from "@workspace/ui/components/settings-field"
import {
	SETTINGS_EMPTY_CLASS,
	SETTINGS_TAG_CLASS,
} from "@workspace/ui/components/settings-styles"
import { cn } from "@workspace/ui/lib/utils"

const ENVIRONMENT_SCOPES = ["space", "bot", "server"] as const

type EnvironmentScope = (typeof ENVIRONMENT_SCOPES)[number]

type EnvironmentEntry = {
	name: string
	definedIn: EnvironmentScope
	servedFrom: EnvironmentScope
	overrides?: EnvironmentScope
}

const ENVIRONMENT_NAME = /^[A-Z_][A-Z0-9_]*$/

const isEnvironmentName = (name: string) => ENVIRONMENT_NAME.test(name)

type EnvironmentWrite = {
	name: string
	value: string
}

type EnvironmentSection = {
	entries: EnvironmentEntry[]
	hasFailedToRead?: boolean
	onSet: (write: EnvironmentWrite) => void | Promise<void>
	onDelete: (name: string) => void | Promise<void>
}

type EnvironmentPanelProps = EnvironmentSection & {
	scope: EnvironmentScope
}

type EnvironmentWriteDialogProps = {
	written: string
	onSet: (write: EnvironmentWrite) => void | Promise<void>
	onClose: () => void
}

const NEW_NAME = ""

const EnvironmentWriteDialog = ({
	written,
	onSet,
	onClose,
}: EnvironmentWriteDialogProps) => {
	const { t } = useTranslation("bots")
	const [name, setName] = useState(written)
	const [value, setValue] = useState("")
	const [isRefused, setRefused] = useState(false)
	const [hasFailed, setFailed] = useState(false)
	const [isWriting, setWriting] = useState(false)
	const isReplacing = written !== NEW_NAME

	const submit = async (event: FormEvent) => {
		event.preventDefault()
		const typed = name.trim()

		if (!isEnvironmentName(typed)) {
			setRefused(true)
			return
		}

		setRefused(false)
		setFailed(false)
		setWriting(true)

		try {
			await onSet({ name: typed, value })
			onClose()
		} catch {
			setFailed(true)
		} finally {
			setWriting(false)
		}
	}

	return (
		<Root onOpenChange={(open) => (open ? undefined : onClose())} open>
			<Content className="w-100">
				<Title>
					{isReplacing
						? t("environment.set.replace.title")
						: t("environment.set.add.title")}
				</Title>
				<Description>
					{isReplacing
						? t("environment.set.replace.description", { name: written })
						: t("environment.set.add.description")}
				</Description>

				<form className="flex flex-col gap-4" onSubmit={submit}>
					<SettingsField
						error={isRefused ? t("environment.set.name.invalid") : undefined}
						hint={t("environment.set.name.hint")}
						label={t("environment.set.name.label")}
						onValueChange={(next) => {
							setName(next)
							setRefused(false)
						}}
						placeholder={t("environment.set.name.placeholder")}
						readOnly={isReplacing}
						value={name}
					/>
					<SettingsField
						hint={t("environment.set.value.hint")}
						label={t("environment.set.value.label")}
						masked
						onValueChange={setValue}
						value={value}
					/>

					{hasFailed ? (
						<p className="text-destructive text-xs" role="alert">
							{t("environment.set.failed")}
						</p>
					) : null}

					<div className="flex justify-end">
						<Button disabled={isWriting} size="sm" type="submit">
							<Icons.Check aria-hidden="true" className="size-3.5" />
							{t("environment.set.submit")}
						</Button>
					</div>
				</form>
			</Content>
		</Root>
	)
}

type EnvironmentRowProps = {
	entry: EnvironmentEntry
	scope: EnvironmentScope
	onReplace: () => void
	onRemove: () => void
}

const EnvironmentRow = ({
	entry,
	scope,
	onReplace,
	onRemove,
}: EnvironmentRowProps) => {
	const { t } = useTranslation("bots")
	const isOwned = entry.definedIn === scope
	const overriddenBy = isOwned && entry.servedFrom !== scope
	const overriding = entry.servedFrom === scope ? entry.overrides : undefined

	return (
		<li className="flex items-center gap-3 rounded-xl border border-border py-2 pr-2 pl-3">
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="truncate font-medium font-mono text-foreground text-sm">
					{entry.name}
				</span>
				<span className="truncate text-muted-foreground text-xs">
					{t("environment.row.scopes", {
						defined: t(`environment.scope.${entry.definedIn}`),
						served: t(`environment.scope.${entry.servedFrom}`),
					})}
				</span>
			</span>

			{overriddenBy ? (
				<span className={cn(SETTINGS_TAG_CLASS, "text-muted-foreground")}>
					{t("environment.row.overridden", {
						scope: t(`environment.scope.${entry.servedFrom}`),
					})}
				</span>
			) : null}
			{overriding ? (
				<span className={cn(SETTINGS_TAG_CLASS, "text-muted-foreground")}>
					{t("environment.row.overriding", {
						scope: t(`environment.scope.${overriding}`),
					})}
				</span>
			) : null}

			{isOwned ? (
				<span className="flex shrink-0 items-center gap-1">
					<Button
						aria-label={t("environment.row.replace", { name: entry.name })}
						onClick={onReplace}
						size="icon-xs"
						variant="ghost"
					>
						<Icons.Edit aria-hidden="true" className="size-3.5" />
					</Button>
					<Button
						aria-label={t("environment.row.remove", { name: entry.name })}
						onClick={onRemove}
						size="icon-xs"
						variant="ghost"
					>
						<Icons.Delete aria-hidden="true" className="size-3.5" />
					</Button>
				</span>
			) : null}
		</li>
	)
}

const EnvironmentPanel = ({
	scope,
	entries,
	hasFailedToRead,
	onSet,
	onDelete,
}: EnvironmentPanelProps) => {
	const { t } = useTranslation("bots")
	const [written, setWritten] = useState<string | null>(null)
	const [removed, setRemoved] = useState<string | null>(null)

	const writeDialog =
		written === null ? null : (
			<EnvironmentWriteDialog
				onClose={() => setWritten(null)}
				onSet={onSet}
				written={written}
			/>
		)

	const removeDialog =
		removed === null ? null : (
			<ConfirmDialog
				confirmLabel={t("environment.remove.action")}
				description={t("environment.remove.description")}
				failureLabel={t("environment.remove.failed")}
				onConfirm={() => onDelete(removed)}
				onOpenChange={() => setRemoved(null)}
				open
				title={t("environment.remove.title", { name: removed })}
			/>
		)

	const failureNotice = hasFailedToRead ? (
		<Notice
			description={t("environment.unreadable.description")}
			title={t("environment.unreadable.title")}
		/>
	) : null

	if (entries.length === 0 && hasFailedToRead) {
		return failureNotice
	}

	if (entries.length === 0) {
		return (
			<>
				<div className={SETTINGS_EMPTY_CLASS}>
					<Icons.Shield
						aria-hidden="true"
						className="size-8 text-muted-foreground"
					/>
					<div className="flex flex-col gap-1">
						<span className="font-medium text-foreground text-sm">
							{t("environment.empty.title")}
						</span>
						<p className="max-w-xs text-muted-foreground text-sm">
							{t("environment.empty.description")}
						</p>
					</div>
					<Button onClick={() => setWritten(NEW_NAME)} size="sm">
						<Icons.Add aria-hidden="true" className="size-3.5" />
						{t("environment.add")}
					</Button>
				</div>
				{writeDialog}
			</>
		)
	}

	return (
		<>
			{failureNotice}

			<div className="flex shrink-0 items-start justify-between gap-3">
				<p className="max-w-sm text-muted-foreground text-xs leading-relaxed">
					{t("environment.notice")}
				</p>
				<Button
					onClick={() => setWritten(NEW_NAME)}
					size="sm"
					variant="outline"
				>
					<Icons.Add aria-hidden="true" className="size-3.5" />
					{t("environment.add")}
				</Button>
			</div>

			<ul className="flex min-h-0 flex-1 list-none flex-col gap-2 overflow-y-auto p-0">
				{entries.map((entry) => (
					<EnvironmentRow
						entry={entry}
						key={entry.name}
						onRemove={() => setRemoved(entry.name)}
						onReplace={() => setWritten(entry.name)}
						scope={scope}
					/>
				))}
			</ul>

			{writeDialog}
			{removeDialog}
		</>
	)
}

export {
	ENVIRONMENT_SCOPES,
	type EnvironmentEntry,
	EnvironmentPanel,
	type EnvironmentPanelProps,
	type EnvironmentScope,
	type EnvironmentSection,
	type EnvironmentWrite,
	isEnvironmentName,
}
