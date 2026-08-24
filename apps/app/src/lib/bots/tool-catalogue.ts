import { invoke } from "@tauri-apps/api/core"

import { isDesktopHost } from "../host"

export const readToolCatalogue = (): Promise<string[]> =>
	isDesktopHost() ? invoke<string[]>("agent_tools") : Promise.resolve([])
