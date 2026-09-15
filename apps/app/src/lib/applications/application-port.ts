export type Install =
	| { kind: "nothing" }
	| { kind: "key"; name: string; secret: string; description?: string }
	| { kind: "oauth" }

export type Application = {
	name: string
	title: string
	description: string
	config: Record<string, unknown>
	tools: string[]
	logo?: string
	install: Install
}

export type ApplicationsError =
	| { kind: "catalogueUnreadable"; detail: string }
	| { kind: "registryUnreached"; detail: string }
	| { kind: "registryTimedOut" }
	| { kind: "registryRefused"; status: number }
	| { kind: "registryUnreadable"; detail: string }

export type ApplicationDestination = "companion" | "space" | "user"

export type ApplicationInstalled = {
	application: string
	scope: ApplicationDestination
	destinationId?: string
}

export type ApplicationPort = {
	catalogue: () => Promise<Application[]>
	search: (query: string) => Promise<Application[]>
	onInstalled: (
		listener: (installed: ApplicationInstalled) => void,
	) => Promise<() => void>
}
