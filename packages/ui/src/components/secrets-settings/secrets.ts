const SECRET_SCOPES = ["space", "bot", "server"] as const

type SecretScope = (typeof SECRET_SCOPES)[number]

type SecretKeyOwner = {
	scope: SecretScope
	server?: string
	readable: boolean
}

type SecretEntry = {
	key: string
	owners: SecretKeyOwner[]
	servedBy: SecretKeyOwner | null
}

type SecretsFailure = "save" | "delete"

type SecretsValue = {
	scope: SecretScope
	isReady: boolean
	needsPassphrase: boolean
	hasVault: boolean
	isUnlocking: boolean
	isPassphraseRejected: boolean
	entries: SecretEntry[]
	saved: Record<string, SecretScope>
	tookOver: Record<string, SecretScope>
	saving: string[]
	failures: Record<string, SecretsFailure>
}

const BLANK_SECRETS: SecretsValue = {
	scope: "bot",
	isReady: true,
	needsPassphrase: false,
	hasVault: false,
	isUnlocking: false,
	isPassphraseRejected: false,
	entries: [],
	saved: {},
	tookOver: {},
	saving: [],
	failures: {},
}

type SecretRowState = "stored" | "missing" | "unreadable" | "unavailable"

type SecretRow = {
	key: string
	state: SecretRowState
	servedBy: SecretScope | null
	isOwn: boolean
	shadowed: SecretScope | null
}

const stateOf = (
	value: SecretsValue,
	entry: SecretEntry | undefined,
): SecretRowState => {
	if (!value.isReady) return "unavailable"
	if (!entry?.servedBy) return "missing"

	return entry.servedBy.readable ? "stored" : "unreadable"
}

const shadowedBy = (
	value: SecretsValue,
	entry: SecretEntry | undefined,
): SecretScope | null => {
	if (!entry) return null

	const own = entry.owners.findIndex((owner) => owner.scope === value.scope)

	return own > 0 ? (entry.owners[own - 1]?.scope ?? null) : null
}

const toSecretRow = (
	value: SecretsValue,
	key: string,
	entry: SecretEntry | undefined,
): SecretRow => ({
	key,
	state: stateOf(value, entry),
	servedBy: entry?.servedBy?.scope ?? null,
	isOwn: Boolean(entry?.owners.some((owner) => owner.scope === value.scope)),
	shadowed: shadowedBy(value, entry),
})

const readSecretRows = (
	value: SecretsValue,
	references: string[],
): SecretRow[] => {
	const named = value.entries.map((entry) => entry.key)
	const keys = [...new Set([...named, ...references])].sort()

	return keys.map((key) =>
		toSecretRow(
			value,
			key,
			value.entries.find((entry) => entry.key === key),
		),
	)
}

const isSecretKeyUsable = (key: string) =>
	key.trim().length > 0 && !/[:{}$\s]/.test(key.trim())

export {
	BLANK_SECRETS,
	isSecretKeyUsable,
	readSecretRows,
	SECRET_SCOPES,
	type SecretEntry,
	type SecretKeyOwner,
	type SecretRow,
	type SecretRowState,
	type SecretScope,
	type SecretsFailure,
	type SecretsValue,
}
