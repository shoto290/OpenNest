"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import { SecretRow } from "@workspace/ui/components/secrets-settings/secret-row"
import {
	isSecretKeyUsable,
	readSecretRows,
	type SecretScope,
	type SecretsValue,
} from "@workspace/ui/components/secrets-settings/secrets"
import { VaultPassphrase } from "@workspace/ui/components/secrets-settings/vault-passphrase"
import { SettingsField } from "@workspace/ui/components/settings-field"

type SecretsPanelProps = {
	value: SecretsValue
	references?: string[]
	onSave: (key: string, secret: string) => void
	onDelete: (key: string, scope: SecretScope) => void
	onVaultUnlock: (passphrase: string) => void
}

const SecretsPanel = ({
	value,
	references = [],
	onSave,
	onDelete,
	onVaultUnlock,
}: SecretsPanelProps) => {
	const { t } = useTranslation("settings")
	const [key, setKey] = useState("")
	const [secret, setSecret] = useState("")

	if (value.needsPassphrase) {
		return <VaultPassphrase onVaultUnlock={onVaultUnlock} value={value} />
	}

	const rows = readSecretRows(value, references)
	const isAddable =
		value.isReady && isSecretKeyUsable(key) && secret.trim().length > 0

	const add = () => {
		onSave(key.trim(), secret)
		setKey("")
		setSecret("")
	}

	return (
		<>
			<p className="shrink-0 text-muted-foreground text-xs leading-relaxed">
				{value.isReady
					? t(`secrets.notice.${value.scope}`)
					: t("secrets.unavailable")}
			</p>

			<form
				className="flex shrink-0 flex-col gap-2 rounded-xl border border-border p-3"
				onSubmit={(event) => {
					event.preventDefault()
					add()
				}}
			>
				<SettingsField
					hint={t("secrets.add.hint")}
					label={t("secrets.add.key.label")}
					onValueChange={setKey}
					placeholder={t("secrets.add.key.placeholder")}
					readOnly={!value.isReady}
					value={key}
				/>
				<SettingsField
					label={t("secrets.add.value.label")}
					masked
					onValueChange={setSecret}
					placeholder={t("secrets.value.placeholder")}
					readOnly={!value.isReady}
					value={secret}
				/>
				<div className="flex justify-end">
					<Button disabled={!isAddable} size="sm" type="submit">
						<Icons.Add aria-hidden="true" className="size-3.5" />
						{t("secrets.add.action")}
					</Button>
				</div>
			</form>

			{rows.length === 0 ? (
				<p className="shrink-0 text-muted-foreground text-xs leading-relaxed">
					{t("secrets.empty")}
				</p>
			) : (
				<ul className="flex list-none flex-col gap-3 p-0">
					{rows.map((row) => (
						<SecretRow
							key={row.key}
							onDelete={onDelete}
							onSave={onSave}
							row={row}
							value={value}
						/>
					))}
				</ul>
			)}
		</>
	)
}

export { SecretsPanel, type SecretsPanelProps }
