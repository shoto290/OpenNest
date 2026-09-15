import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

import type {
	Application,
	ApplicationInstall,
	ApplicationInstalled,
	ApplicationPort,
} from "./application-port"

export const INSTALLED_EVENT = "application://installed"

export const applicationTransport: ApplicationPort = {
	catalogue: () => invoke<Application[]>("application_catalogue"),

	search: (query) => invoke<Application[]>("application_search", { query }),

	installs: (conversationId) =>
		invoke<ApplicationInstall[]>("application_installs", { conversationId }),

	onInstalled: (listener) =>
		listen<ApplicationInstalled>(INSTALLED_EVENT, ({ payload }) =>
			listener(payload),
		),
}
