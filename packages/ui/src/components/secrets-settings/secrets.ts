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
	server: string | null
	isReady: boolean
	needsPassphrase: boolean
	hasVault: boolean
	isUnlocking: boolean
	isPassphraseRejected: boolean
	loadFailed: boolean
	entries: SecretEntry[]
	saved: Record<string, SecretScope>
	tookOver: Record<string, SecretScope>
	saving: string[]
	failures: Record<string, SecretsFailure>
}

const BLANK_SECRETS: SecretsValue = {
	scope: "bot",
	server: null,
	isReady: true,
	needsPassphrase: false,
	hasVault: false,
	isUnlocking: false,
	isPassphraseRejected: false,
	loadFailed: false,
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
	servedByServer: string | null
	isServedByOwn: boolean
	isHeldByOwn: boolean
	displaced: SecretScope | null
}

const isOwnOwner = (value: SecretsValue, owner: SecretKeyOwner) =>
	owner.scope === value.scope &&
	(owner.scope !== "server" || (owner.server ?? null) === value.server)

const isSameOwner = (one: SecretKeyOwner, other: SecretKeyOwner) =>
	one.scope === other.scope && (one.server ?? null) === (other.server ?? null)

const stateOf = (
	value: SecretsValue,
	entry: SecretEntry | undefined,
): SecretRowState => {
	if (!value.isReady) return "unavailable"
	if (!entry || entry.owners.length === 0) return "missing"

	return entry.servedBy ? "stored" : "unreadable"
}

const displacedBy = (entry: SecretEntry | undefined): SecretScope | null => {
	const servedBy = entry?.servedBy

	if (!entry || !servedBy) return null

	const serving = entry.owners.findIndex((owner) =>
		isSameOwner(owner, servedBy),
	)

	return serving > 0 ? (entry.owners[serving - 1]?.scope ?? null) : null
}

const toSecretRow = (
	value: SecretsValue,
	key: string,
	entry: SecretEntry | undefined,
): SecretRow => ({
	key,
	state: stateOf(value, entry),
	servedBy: entry?.servedBy?.scope ?? null,
	servedByServer: entry?.servedBy?.server ?? null,
	isServedByOwn: Boolean(entry?.servedBy && isOwnOwner(value, entry.servedBy)),
	isHeldByOwn: Boolean(entry?.owners.some((owner) => isOwnOwner(value, owner))),
	displaced: displacedBy(entry),
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
