"use client"

import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
	type BotMcpSecretState,
	type BotMcpSecrets,
	readMcpSecretState,
} from "@workspace/ui/components/bot-settings"
import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import { SettingsField } from "@workspace/ui/components/settings-field"
import {
	SETTINGS_EMPTY_CLASS,
	SETTINGS_TAG_CLASS,
} from "@workspace/ui/components/settings-styles"
import { cn } from "@workspace/ui/lib/utils"

const STATUS_TAG_CLASS = {
	filled: "text-foreground",
	missing: "text-muted-foreground",
	unreadable: "text-foreground",
	unavailable: "text-foreground",
} satisfies Record<BotMcpSecretState, string>

type VaultPassphraseProps = {
	secrets: BotMcpSecrets
	onVaultUnlock: (passphrase: string) => void
}

const VaultPassphrase = ({ secrets, onVaultUnlock }: VaultPassphraseProps) => {
	const { t } = useTranslation("bots")
	const [passphrase, setPassphrase] = useState("")
	const kind = secrets.hasVault ? "open" : "create"

	return (
		<form
			className="flex flex-col gap-2 rounded-xl border border-border p-3"
			onSubmit={(event) => {
				event.preventDefault()
				onVaultUnlock(passphrase)
			}}
		>
			<p className="text-muted-foreground text-xs leading-relaxed">
				{t(`mcp.secrets.vault.${kind}.notice`)}
			</p>
			<SettingsField
				error={
					secrets.isPassphraseRejected
						? t("mcp.secrets.vault.rejected")
						: undefined
				}
				label={t(`mcp.secrets.vault.${kind}.label`)}
				masked
				onValueChange={setPassphrase}
				placeholder={t("mcp.secrets.vault.placeholder")}
				value={passphrase}
			/>
			<div className="flex justify-end">
				<Button
					disabled={secrets.isUnlocking || passphrase.length === 0}
					size="sm"
					type="submit"
				>
					{t(`mcp.secrets.vault.${kind}.action`)}
				</Button>
			</div>
		</form>
	)
}

type McpServerSecretsProps = {
	references: string[]
	secrets: BotMcpSecrets
	onSecretSave: (key: string, value: string) => void
	onSecretClear: (key: string) => void
	onVaultUnlock: (passphrase: string) => void
}

const McpServerSecrets = ({
	references,
	secrets,
	onSecretSave,
	onSecretClear,
	onVaultUnlock,
}: McpServerSecretsProps) => {
	const { t } = useTranslation("bots")
	const [typed, setTyped] = useState<Record<string, string>>({})
	const rows = useRef<Record<string, HTMLLIElement | null>>({})

	if (references.length === 0) {
		return (
			<div className={SETTINGS_EMPTY_CLASS}>
				<Icons.Key
					aria-hidden="true"
					className="size-8 text-muted-foreground"
				/>
				<div className="flex flex-col gap-1">
					<span className="font-medium text-foreground text-sm">
						{t("mcp.secrets.empty.title")}
					</span>
					<p className="max-w-xs text-muted-foreground text-sm">
						{t("mcp.secrets.empty.description")}
					</p>
				</div>
			</div>
		)
	}

	if (secrets.needsPassphrase) {
		return <VaultPassphrase onVaultUnlock={onVaultUnlock} secrets={secrets} />
	}

	const save = (key: string) => {
		onSecretSave(key, typed[key] ?? "")
		setTyped({ ...typed, [key]: "" })
		rows.current[key]?.querySelector("input")?.focus()
	}

	return (
		<>
			<p className="shrink-0 text-muted-foreground text-xs leading-relaxed">
				{secrets.isReady
					? t("mcp.secrets.notice")
					: t("mcp.secrets.unavailable")}
			</p>
			<ul className="flex list-none flex-col gap-3 p-0">
				{references.map((key) => {
					const state = readMcpSecretState(secrets, key)
					const failure = secrets.failures[key]
					const isSaving = secrets.saving.includes(key)
					const isSavable =
						secrets.isReady && !isSaving && (typed[key] ?? "").trim().length > 0

					return (
						<li
							className="flex flex-col gap-2 rounded-xl border border-border p-3"
							key={key}
							ref={(node) => {
								rows.current[key] = node
							}}
						>
							<SettingsField
								error={
									failure ? t(`mcp.secrets.failure.${failure}`) : undefined
								}
								label={key}
								masked
								onValueChange={(value) => setTyped({ ...typed, [key]: value })}
								placeholder={t("mcp.secrets.value.placeholder")}
								readOnly={!secrets.isReady}
								value={typed[key] ?? ""}
							/>
							<div className="flex items-center justify-between gap-2">
								<span
									className={cn(SETTINGS_TAG_CLASS, STATUS_TAG_CLASS[state])}
								>
									{t(`mcp.secrets.status.${state}`)}
								</span>
								<div className="flex shrink-0 items-center gap-2">
									{state === "filled" ? (
										<Button
											disabled={isSaving}
											onClick={() => onSecretClear(key)}
											size="sm"
											variant="outline"
										>
											{t("mcp.secrets.clear")}
										</Button>
									) : null}
									<Button
										disabled={!isSavable}
										onClick={() => save(key)}
										size="sm"
									>
										{state === "filled"
											? t("mcp.secrets.replace")
											: t("mcp.secrets.save")}
									</Button>
								</div>
							</div>
						</li>
					)
				})}
			</ul>
		</>
	)
}

export { McpServerSecrets, type McpServerSecretsProps }
