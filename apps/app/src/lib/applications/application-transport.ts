import { invoke } from "@tauri-apps/api/core"

import type { Application, ApplicationPort } from "./application-port"

export const applicationTransport: ApplicationPort = {
	catalogue: () => invoke<Application[]>("application_catalogue"),

	search: (query) => invoke<Application[]>("application_search", { query }),
}
