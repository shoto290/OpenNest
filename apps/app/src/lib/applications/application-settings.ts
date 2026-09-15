import type { BotMcpServerItem } from "@workspace/ui/components/bot-settings"
import type { EnvironmentSection } from "@workspace/ui/components/environment-panel"
import type { InstallableApplication } from "@workspace/ui/components/plugin-settings/application-install-page"
import type {
	ApplicationCategory,
	ApplicationSetup,
	CatalogueApplication,
} from "@workspace/ui/components/plugin-settings/applications-catalogue"
import type { ApplicationsCatalogueSection } from "@workspace/ui/components/plugin-settings/use-mcp-session"
import { i18n } from "@workspace/ui/lib/i18n"

import type { Application, Install } from "./application-port"
import {
	type ApplicationsController,
	type ApplicationsState,
	type InstallTarget,
	isInstalledUnder,
	serverScopeOf,
} from "./applications-controller"
import { type SessionReopener, scopeOfOwner } from "./session-reopening"
import type { Applications } from "./use-applications"

import type { McpServers } from "../bots/use-mcp-servers"
import {
	type ConnectorSettings,
	toConnectorSettings,
} from "../connectors/connector-settings"
import type { Connectors } from "../connectors/use-connectors"
import type { EnvOwner, EnvScope } from "../conversations/store-contract"
import { toEnvironmentRows } from "../environment/environment-rows"
import type { Environment } from "../environment/use-environment"

const EVERYTHING_CATEGORY = "everything"

const SETUP_OF_INSTALL = {
	nothing: "none",
	key: "apiKey",
	oauth: "signIn",
} as const satisfies Record<Install["kind"], ApplicationSetup>

const setupOf = (application: Application) =>
	SETUP_OF_INSTALL[application.install.kind]

export const withApplicationMarks = (
	servers: BotMcpServerItem[],
	curated: Application[],
): BotMcpServerItem[] =>
	servers.map((server) => {
		const known = curated.find((held) => held.name === server.name)
		if (!known) {
			return server
		}
		return { ...server, displayName: known.title, mark: known.logo }
	})

const toCatalogueApplication = (
	application: Application,
): CatalogueApplication => ({
	id: application.name,
	name: application.title,
	description: application.description,
	setup: setupOf(application),
	mark: application.logo,
})

export const toInstallableApplication = (
	application: Application,
): InstallableApplication => ({
	id: application.name,
	name: application.title,
	description: application.description || undefined,
	packageIdentity: application.name,
	setup: setupOf(application),
	mark: application.logo,
	tools: application.tools,
})

const categoriesOf = (count: number): ApplicationCategory[] => [
	{
		id: EVERYTHING_CATEGORY,
		label: i18n.t("bots:applications.catalogue.everything"),
		count,
	},
]

const connectFor =
	({ controller }: Connectors) =>
	async (name: string, url: string) => {
		await controller.connect(name, url)
		const { failure } = controller.getState()
		if (failure?.command === "connect" && failure.name === name) {
			throw failure.reason
		}
	}

const matching = (applications: Application[], typed: string) =>
	applications.filter((held) =>
		`${held.title} ${held.name} ${held.description}`
			.toLowerCase()
			.includes(typed),
	)

type ApplicationsCatalogueSource = {
	state: ApplicationsState
	controller: ApplicationsController
	target: InstallTarget
}

const toApplicationsCatalogue = ({
	state,
	controller,
	target,
}: ApplicationsCatalogueSource): ApplicationsCatalogueSection => {
	const typed = state.query.trim().toLowerCase()
	const curated = typed === "" ? state.curated : matching(state.curated, typed)
	const { picked } = state

	return {
		categories: categoriesOf(state.curated.length),
		category: EVERYTHING_CATEGORY,
		onCategoryChange: () => undefined,
		query: state.query,
		onQueryChange: controller.search,
		curated: curated.map(toCatalogueApplication),
		registry: state.registry.map(toCatalogueApplication),
		isRegistrySearching: state.isSearching,
		hasRegistryFailed: state.hasSearchFailed,
		onRegistryRetry: controller.retry,
		onPick: (application) => controller.pick(application.id),
		install: picked
			? {
					application: toInstallableApplication(picked),
					isInstalling: state.installing === picked.name,
					isInstalled: isInstalledUnder(state, target.owner, picked.name),
					failure: state.failure ?? undefined,
					onInstall: (key) => {
						void controller.install(target, key)
					},
					onLeave: controller.leave,
				}
			: undefined,
	}
}

export const applicationTitleOf = (curated: Application[], name: string) =>
	curated.find((held) => held.name === name)?.title ?? name

export const openedServerScope = (
	name: string | null,
	owner: EnvOwner | null,
): EnvScope | null => (name && owner ? serverScopeOf(owner, name) : null)

type ServerEnvironmentSource = {
	environment: Environment
	opened: EnvScope | null
	curated: Application[]
	reopen: SessionReopener
}

export const toServerEnvironmentSection = ({
	environment,
	opened,
	curated,
	reopen,
}: ServerEnvironmentSource): EnvironmentSection => {
	const reopenScope = () => {
		if (opened?.kind !== "server") {
			return
		}
		void reopen({
			scope: scopeOfOwner(opened.owner),
			application: applicationTitleOf(curated, opened.name),
		})
	}

	return {
		entries: toEnvironmentRows(environment.state.entries),
		hasFailedToRead: environment.state.hasFailedToRead,
		onSet: ({ name, value }) =>
			environment.controller.set(name, value).then(reopenScope),
		onDelete: environment.controller.remove,
	}
}

type ApplicationScopeSource = {
	applications: Applications
	servers: McpServers
	connectors: Connectors
	openedName: string | null
	reopen: SessionReopener
}

type ApplicationScope = ConnectorSettings & {
	mcpCatalogue?: ApplicationsCatalogueSection
	onMcpServerCreate: (name: string, config: Record<string, unknown>) => void
	onMcpServerChange: (
		openedName: string,
		name: string,
		config: Record<string, unknown>,
	) => void
	onMcpServerDelete: (name: string) => void
}

export const toApplicationScope = ({
	applications,
	servers,
	connectors,
	openedName,
	reopen,
}: ApplicationScopeSource): ApplicationScope => {
	const { curated } = applications.state
	const owner = servers.state.owner

	const reopenFor = (name: string) => {
		if (!owner) {
			return
		}
		void reopen({
			scope: scopeOfOwner(owner),
			application: applicationTitleOf(curated, name),
		})
	}

	const onceWritten = (name: string) => (landed: boolean) => {
		if (landed) {
			reopenFor(name)
		}
	}

	const settleConnector = () => {
		if (openedName) {
			reopenFor(openedName)
		}
	}

	const connectorSettings = toConnectorSettings({
		servers: servers.state.servers,
		connectors,
		openedName,
		onSettled: settleConnector,
	})

	const installTarget = (owned: EnvOwner): InstallTarget => ({
		owner: owned,
		connect: connectFor(connectors),
		settle: async () => {
			await servers.controller.reload()
			reopenFor(applications.state.picked?.name ?? "")
		},
	})

	return {
		...connectorSettings,
		mcpServers: withApplicationMarks(connectorSettings.mcpServers, curated),
		mcpCatalogue: owner
			? toApplicationsCatalogue({
					state: applications.state,
					controller: applications.controller,
					target: installTarget(owner),
				})
			: undefined,
		onMcpServerCreate: (name, config) => {
			void servers.controller.create(name, config).then(onceWritten(name))
		},
		onMcpServerChange: (opened, name, config) => {
			void servers.controller
				.rename(opened, name, config)
				.then(onceWritten(name))
		},
		onMcpServerDelete: (name) => {
			void servers.controller.remove(name).then(onceWritten(name))
		},
	}
}
