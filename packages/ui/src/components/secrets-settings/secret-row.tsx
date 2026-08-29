"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button, buttonVariants } from "@workspace/ui/components/button"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { Icons } from "@workspace/ui/components/icons"
import type {
	SecretRow as SecretRowValue,
	SecretScope,
	SecretsValue,
} from "@workspace/ui/components/secrets-settings/secrets"
import { SettingsField } from "@workspace/ui/components/settings-field"
import { SETTINGS_TAG_CLASS } from "@workspace/ui/components/settings-styles"
import { cn } from "@workspace/ui/lib/utils"

const ROW_CLASS =
	"flex h-11 items-center gap-2 rounded-xl border border-border px-3"

type SecretRowProps = {
	row: SecretRowValue
	value: SecretsValue
	onSave: (key: string, secret: string) => void
	onDelete: (key: string, scope: SecretScope, server?: string) => void
}

const SecretRow = ({ row, value, onSave, onDelete }: SecretRowProps) => {
	const { t } = useTranslation("settings")
	const [typed, setTyped] = useState<string | null>(null)

	const failure = value.failures[row.key]
	const isSaving = value.saving.includes(row.key)
	const isEditing = typed !== null
	const servedElsewhere = row.servedBy !== null && !row.isServedByOwn

	const status = () => {
		if (failure) return t(`secrets.failure.${failure}`)
		if (value.saved[row.key]) return t("secrets.status.saved")

		return t(`secrets.status.${row.state}`)
	}

	const save = () => {
		onSave(row.key, typed ?? "")
		setTyped(null)
	}

	const name = (
		<span className="min-w-0 flex-1 truncate font-medium font-mono text-foreground text-xs">
			{row.key}
		</span>
	)

	if (isEditing) {
		return (
			<li className={ROW_CLASS}>
				{name}
				<form
					className="flex min-w-0 flex-[2] items-center gap-2"
					onSubmit={(event) => {
						event.preventDefault()
						save()
					}}
				>
					<div className="min-w-0 flex-1">
						<SettingsField
							hideLabel
							label={t("secrets.edit.label", { key: row.key })}
							masked
							onValueChange={setTyped}
							placeholder={t("secrets.value.placeholder")}
							value={typed}
						/>
					</div>
					<Button
						disabled={isSaving || typed.trim().length === 0}
						size="sm"
						type="submit"
					>
						{t("secrets.save")}
					</Button>
					<Button
						onClick={() => setTyped(null)}
						size="sm"
						type="button"
						variant="ghost"
					>
						{t("secrets.cancel")}
					</Button>
				</form>
			</li>
		)
	}

	return (
		<li className={ROW_CLASS}>
			{name}

			<span className={cn(SETTINGS_TAG_CLASS, "text-foreground")}>
				{status()}
			</span>

			{servedElsewhere && row.servedBy ? (
				<span className={cn(SETTINGS_TAG_CLASS, "text-muted-foreground")}>
					{row.servedByServer
						? t("secrets.from.named", { server: row.servedByServer })
						: t(`secrets.from.${row.servedBy}`)}
				</span>
			) : null}

			{row.displaced ? (
				<span className={cn(SETTINGS_TAG_CLASS, "text-muted-foreground")}>
					{t(`secrets.overrides.${row.displaced}`)}
				</span>
			) : null}

			<Button
				aria-label={t("secrets.edit.action", { key: row.key })}
				disabled={!value.isReady || isSaving}
				onClick={() => setTyped("")}
				size="icon-sm"
				variant="ghost"
			>
				<Icons.Edit aria-hidden="true" />
			</Button>

			{row.isHeldByOwn ? (
				<Button
					aria-label={t("secrets.delete.action", { key: row.key })}
					disabled={isSaving}
					onClick={() =>
						onDelete(row.key, value.scope, value.server ?? undefined)
					}
					size="icon-sm"
					variant="ghost"
				>
					<Icons.Delete aria-hidden="true" />
				</Button>
			) : null}

			{servedElsewhere && row.servedBy ? (
				<ConfirmDialog
					confirmLabel={t(`secrets.delete.wider.${row.servedBy}`)}
					description={t(`secrets.delete.confirm.${row.servedBy}`)}
					isTriggerDisabled={isSaving}
					onConfirm={() =>
						row.servedBy &&
						onDelete(row.key, row.servedBy, row.servedByServer ?? undefined)
					}
					title={t("secrets.delete.title", { key: row.key })}
					trigger={
						<>
							<Icons.Delete aria-hidden="true" />
							<span className="sr-only">
								{t(`secrets.delete.wider.${row.servedBy}`)}
							</span>
						</>
					}
					triggerClassName={buttonVariants({
						variant: "ghost",
						size: "icon-sm",
					})}
				/>
			) : null}
		</li>
	)
}

export { SecretRow, type SecretRowProps }
