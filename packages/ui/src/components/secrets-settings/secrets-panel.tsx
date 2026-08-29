"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { SecretRow } from "@workspace/ui/components/secrets-settings/secret-row"
import {
	isSecretKeyUsable,
	readSecretRows,
	type SecretScope,
	type SecretsValue,
} from "@workspace/ui/components/secrets-settings/secrets"
import { VaultPassphrase } from "@workspace/ui/components/secrets-settings/vault-passphrase"
import { SettingsField } from "@workspace/ui/components/settings-field"

type SecretsMount = {
	value: SecretsValue
	onSave: (key: string, secret: string) => void
	onDelete: (key: string, scope: SecretScope, server?: string) => void
	onVaultUnlock: (passphrase: string) => void
}

type SecretsPanelProps = SecretsMount & {
	references?: string[]
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
	const [added, setAdded] = useState<string | null>(null)

	if (value.needsPassphrase) {
		return <VaultPassphrase onVaultUnlock={onVaultUnlock} value={value} />
	}

	const rows = readSecretRows(value, references)
	const addFailure = added ? value.failures[added] : undefined
	const isAdding = added !== null && value.saving.includes(added)
	const isAdded = added !== null && !isAdding && !addFailure
	const typedKey = isAdded ? "" : key
	const typedSecret = isAdded ? "" : secret
	const isAddable =
		value.isReady &&
		!isAdding &&
		isSecretKeyUsable(typedKey) &&
		typedSecret.trim().length > 0

	const answer = (write: (next: string) => void) => (next: string) => {
		setAdded(null)
		write(next)
	}

	const add = () => {
		const named = key.trim()

		setAdded(named)
		onSave(named, secret)
	}

	return (
		<>
			{value.isReady ? null : (
				<p className="shrink-0 text-muted-foreground text-xs">
					{t("secrets.unavailable")}
				</p>
			)}

			<form
				className="flex shrink-0 items-center gap-2"
				onSubmit={(event) => {
					event.preventDefault()
					add()
				}}
			>
				<div className="min-w-0 flex-1">
					<SettingsField
						hideLabel
						label={t("secrets.add.key.label")}
						onValueChange={answer(setKey)}
						placeholder={t("secrets.add.key.placeholder")}
						readOnly={!value.isReady}
						value={typedKey}
					/>
				</div>
				<div className="min-w-0 flex-1">
					<SettingsField
						hideLabel
						label={t("secrets.add.value.label")}
						masked
						onValueChange={answer(setSecret)}
						placeholder={t("secrets.add.value.placeholder")}
						readOnly={!value.isReady}
						value={typedSecret}
					/>
				</div>
				<Button disabled={!isAddable} size="sm" type="submit">
					{t("secrets.add.action")}
				</Button>
			</form>

			{addFailure ? (
				<p className="shrink-0 text-muted-foreground text-xs">
					{t(`secrets.failure.${addFailure}`)}
				</p>
			) : null}

			{rows.length === 0 ? (
				<p className="shrink-0 text-muted-foreground text-xs">
					{t("secrets.empty")}
				</p>
			) : (
				<ul className="flex list-none flex-col gap-2 p-0">
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

export { type SecretsMount, SecretsPanel, type SecretsPanelProps }
