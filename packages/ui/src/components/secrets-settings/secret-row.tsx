"use client"

import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button, buttonVariants } from "@workspace/ui/components/button"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import type {
	SecretRow as SecretRowValue,
	SecretScope,
	SecretsValue,
} from "@workspace/ui/components/secrets-settings/secrets"
import { SettingsField } from "@workspace/ui/components/settings-field"
import { SETTINGS_TAG_CLASS } from "@workspace/ui/components/settings-styles"
import { cn } from "@workspace/ui/lib/utils"

type SecretRowProps = {
	row: SecretRowValue
	value: SecretsValue
	onSave: (key: string, secret: string) => void
	onDelete: (key: string, scope: SecretScope) => void
}

const SecretRow = ({ row, value, onSave, onDelete }: SecretRowProps) => {
	const { t } = useTranslation("settings")
	const [typed, setTyped] = useState("")
	const field = useRef<HTMLDivElement | null>(null)

	const failure = value.failures[row.key]
	const saved = value.saved[row.key]
	const tookOver = value.tookOver[row.key]
	const isSaving = value.saving.includes(row.key)
	const isSavable = value.isReady && !isSaving && typed.trim().length > 0

	const save = () => {
		onSave(row.key, typed)
		setTyped("")
		field.current?.querySelector("input")?.focus()
	}

	const isInherited = row.servedBy !== null && !row.isOwn

	return (
		<li className="flex flex-col gap-2 rounded-xl border border-border p-3">
			<div ref={field}>
				<SettingsField
					error={failure ? t(`secrets.failure.${failure}`) : undefined}
					label={row.key}
					masked
					onValueChange={setTyped}
					placeholder={t("secrets.value.placeholder")}
					readOnly={!value.isReady}
					value={typed}
				/>
			</div>

			{row.shadowed ? (
				<p className="text-muted-foreground text-xs leading-relaxed">
					{t(`secrets.shadowed.${row.shadowed}`)}
				</p>
			) : null}

			{saved ? (
				<p className="text-muted-foreground text-xs leading-relaxed">
					{t(`secrets.saved.${saved}`)}
				</p>
			) : null}

			{tookOver ? (
				<p className="text-muted-foreground text-xs leading-relaxed">
					{t(`secrets.tookOver.${tookOver}`)}
				</p>
			) : null}

			<div className="flex items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-2">
					<span className={cn(SETTINGS_TAG_CLASS, "text-foreground")}>
						{t(`secrets.status.${row.state}`)}
					</span>
					{isInherited && row.servedBy ? (
						<span className={cn(SETTINGS_TAG_CLASS, "text-muted-foreground")}>
							{t(`secrets.from.${row.servedBy}`)}
						</span>
					) : null}
				</div>

				<div className="flex shrink-0 items-center gap-2">
					{row.isOwn ? (
						<Button
							disabled={isSaving}
							onClick={() => onDelete(row.key, value.scope)}
							size="sm"
							variant="outline"
						>
							{t("secrets.delete.action")}
						</Button>
					) : null}

					{isInherited && row.servedBy ? (
						<ConfirmDialog
							confirmLabel={t(`secrets.delete.wider.${row.servedBy}`)}
							description={t(`secrets.delete.confirm.${row.servedBy}`)}
							isTriggerDisabled={isSaving}
							onConfirm={() => row.servedBy && onDelete(row.key, row.servedBy)}
							title={t("secrets.delete.title", { key: row.key })}
							trigger={t(`secrets.delete.wider.${row.servedBy}`)}
							triggerClassName={buttonVariants({
								variant: "outline",
								size: "sm",
							})}
						/>
					) : null}

					<Button disabled={!isSavable} onClick={save} size="sm">
						{row.isOwn ? t("secrets.replace") : t("secrets.save")}
					</Button>
				</div>
			</div>
		</li>
	)
}

export { SecretRow, type SecretRowProps }
