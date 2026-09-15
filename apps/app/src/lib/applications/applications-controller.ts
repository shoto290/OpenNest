import { readMcpServerLaunch } from "@workspace/ui/components/bot-settings-dialog/mcp-server-launch"
import {
	type NoticeMessage,
	raiseFailureNotice,
} from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import type { Application, ApplicationPort } from "./application-port"

import { declareServer, undeclareServer } from "../bots/mcp-server-writes"
import type { EnvOwner, EnvScope } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

export type ApplicationsState = {
	curated: Application[]
	hasCatalogueFailed: boolean
	query: string
	registry: Application[]
	isSearching: boolean
	hasSearchFailed: boolean
	picked: Application | null
	installing: string | null
	installed: string[]
	failure: string | null
}

export type InstallTarget = {
	owner: EnvOwner
	connect: (name: string, url: string) => Promise<void>
	settle: () => Promise<void>
}

export type ApplicationsController = {
	getState: () => ApplicationsState
	subscribe: (listener: () => void) => () => void
	open: () => Promise<void>
	search: (query: string) => void
	retry: () => void
	pick: (id: string) => void
	leave: () => void
	install: (target: InstallTarget, key?: string) => Promise<void>
}

export const initialApplicationsState: ApplicationsState = {
	curated: [],
	hasCatalogueFailed: false,
	query: "",
	registry: [],
	isSearching: false,
	hasSearchFailed: false,
	picked: null,
	installing: null,
	installed: [],
	failure: null,
}

const isRecord = (reason: unknown): reason is Record<string, unknown> =>
	typeof reason === "object" && reason !== null

const refusalTextOf = (reason: unknown): string => {
	if (reason instanceof Error) {
		return reason.message
	}
	if (typeof reason === "string") {
		return reason
	}
	if (isRecord(reason) && typeof reason.kind === "string") {
		return typeof reason.detail === "string"
			? `${reason.kind}: ${reason.detail}`
			: reason.kind
	}
	return String(reason)
}

export const serverScopeOf = (owner: EnvOwner, name: string): EnvScope => ({
	kind: "server",
	name,
	owner,
})

const ownerKeyOf = (owner: EnvOwner) =>
	owner.kind === "user" ? "user" : `${owner.kind}:${owner.id}`

const installKeyOf = (owner: EnvOwner, name: string) =>
	`${ownerKeyOf(owner)}/${name}`

export const isInstalledUnder = (
	state: ApplicationsState,
	owner: EnvOwner,
	name: string,
) => state.installed.includes(installKeyOf(owner, name))

const urlOf = (application: Application) =>
	readMcpServerLaunch(application.config).url ?? ""

export type ApplicationsControllerOptions = {
	reportFailure?: (notice: NoticeMessage) => void
}

export const createApplicationsController = (
	port: ApplicationPort,
	store: TranscriptStore,
	{ reportFailure = raiseFailureNotice }: ApplicationsControllerOptions = {},
): ApplicationsController => {
	let state = initialApplicationsState
	let isReadingCatalogue = false
	const listeners = new Set<() => void>()

	const publish = () => {
		for (const listener of listeners) {
			listener()
		}
	}

	const set = (fields: Partial<ApplicationsState>) => {
		state = { ...state, ...fields }
		publish()
	}

	const isLastTyped = (typed: string) => state.query.trim() === typed

	const searchFor = (query: string) => {
		const typed = query.trim()
		if (typed === "") {
			set({ registry: [], isSearching: false, hasSearchFailed: false })
			return
		}
		set({ isSearching: true, hasSearchFailed: false })
		void port.search(typed).then(
			(found) => {
				if (isLastTyped(typed)) {
					set({ registry: found, isSearching: false })
				}
			},
			() => {
				if (isLastTyped(typed)) {
					set({ isSearching: false, hasSearchFailed: true })
				}
			},
		)
	}

	const applicationNamed = (id: string) =>
		[...state.curated, ...state.registry].find((held) => held.name === id) ??
		null

	const writeKey = async (
		owner: EnvOwner,
		application: Application,
		key: string,
	) => {
		const { install } = application
		if (install.kind !== "key") {
			return
		}
		try {
			await store.setEnvironmentVariable(
				serverScopeOf(owner, application.name),
				install.secret,
				key,
			)
		} catch (refusal) {
			await undeclareServer(store, owner, application.name)
			throw refusal
		}
	}

	const runInstall = async (
		application: Application,
		target: InstallTarget,
		key: string,
	) => {
		await declareServer(
			store,
			target.owner,
			application.name,
			application.config,
		)
		await writeKey(target.owner, application, key)
		if (application.install.kind === "oauth") {
			await target.connect(application.name, urlOf(application))
		}
	}

	return {
		getState: () => state,

		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},

		open: async () => {
			if (isReadingCatalogue || state.curated.length > 0) {
				return
			}
			isReadingCatalogue = true
			try {
				set({ curated: await port.catalogue(), hasCatalogueFailed: false })
			} catch {
				set({ hasCatalogueFailed: true })
				reportFailure({
					title: i18n.t("bots:applications.catalogue.unavailable"),
				})
			} finally {
				isReadingCatalogue = false
			}
		},

		search: (query: string) => {
			set({ query })
			searchFor(query)
		},

		retry: () => searchFor(state.query),

		pick: (id: string) => set({ picked: applicationNamed(id), failure: null }),

		leave: () => set({ picked: null, failure: null }),

		install: async (target: InstallTarget, key = "") => {
			const application = state.picked
			if (
				!application ||
				state.installing !== null ||
				isInstalledUnder(state, target.owner, application.name)
			) {
				return
			}
			set({ installing: application.name, failure: null })
			try {
				await runInstall(application, target, key)
			} catch (reason) {
				set({
					installing: null,
					failure: i18n.t("bots:applications.install.failed", {
						reason: refusalTextOf(reason),
					}),
				})
				return
			}
			set({
				installing: null,
				installed: [
					...state.installed,
					installKeyOf(target.owner, application.name),
				],
			})
			await target.settle()
		},
	}
}
