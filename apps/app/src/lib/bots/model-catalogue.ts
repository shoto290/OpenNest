import { invoke } from "@tauri-apps/api/core"

import { isDesktopHost } from "../host"

export const readModelCatalogue = (): Promise<string[]> =>
	isDesktopHost() ? invoke<string[]>("agent_models") : Promise.resolve([])
