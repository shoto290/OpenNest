import type { EnvironmentEntry } from "@workspace/ui/components/environment-panel"

import type { EnvEntry } from "../conversations/store-contract"

export const toEnvironmentRows = (entries: EnvEntry[]): EnvironmentEntry[] => {
	const rows = new Map<string, EnvironmentEntry>()

	for (const entry of entries) {
		const narrower = rows.get(entry.name)
		if (narrower) {
			narrower.overrides ??= entry.definedIn.kind
			continue
		}
		rows.set(entry.name, {
			name: entry.name,
			definedIn: entry.definedIn.kind,
			servedFrom: entry.servedFrom.kind,
		})
	}

	return [...rows.values()]
}
