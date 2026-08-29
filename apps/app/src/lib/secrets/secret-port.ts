import {
	type SecretEntry,
	type SecretScope,
	type SecretStoreStatus,
	type SecretTarget,
	type StoredSecretKeys,
	scopeOf,
} from "@workspace/ui/components/secrets-settings/secrets"

export type {
	SecretEntry as StoredSecretKey,
	SecretScope,
	SecretStoreStatus,
	SecretTarget,
	StoredSecretKeys,
}
export { scopeOf }

export type SecretPort = {
	status: () => Promise<SecretStoreStatus>
	keys: (target: SecretTarget) => Promise<StoredSecretKeys>
	set: (target: SecretTarget, key: string, value: string) => Promise<void>
	delete: (
		target: SecretTarget,
		key: string,
		scope: SecretScope,
		server?: string,
	) => Promise<void>
	unlock: (passphrase: string) => Promise<void>
}
