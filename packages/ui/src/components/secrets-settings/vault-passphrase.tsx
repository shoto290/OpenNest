"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import type { SecretsValue } from "@workspace/ui/components/secrets-settings/secrets"
import { SettingsField } from "@workspace/ui/components/settings-field"

type VaultPassphraseProps = {
	value: SecretsValue
	onVaultUnlock: (passphrase: string) => void
}

const VaultPassphrase = ({ value, onVaultUnlock }: VaultPassphraseProps) => {
	const { t } = useTranslation("settings")
	const [passphrase, setPassphrase] = useState("")
	const kind = value.hasVault ? "open" : "create"

	return (
		<form
			className="flex shrink-0 flex-col gap-2 rounded-xl border border-border p-3"
			onSubmit={(event) => {
				event.preventDefault()
				onVaultUnlock(passphrase)
			}}
		>
			<p className="text-muted-foreground text-xs leading-relaxed">
				{t(`secrets.vault.${kind}.notice`)}
			</p>
			<SettingsField
				error={
					value.isPassphraseRejected ? t("secrets.vault.rejected") : undefined
				}
				label={t(`secrets.vault.${kind}.label`)}
				masked
				onValueChange={setPassphrase}
				placeholder={t("secrets.vault.placeholder")}
				value={passphrase}
			/>
			<div className="flex justify-end">
				<Button
					disabled={value.isUnlocking || passphrase.length === 0}
					size="sm"
					type="submit"
				>
					{t(`secrets.vault.${kind}.action`)}
				</Button>
			</div>
		</form>
	)
}

export { VaultPassphrase, type VaultPassphraseProps }
