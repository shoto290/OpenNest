import { invoke } from "@tauri-apps/api/core"

import { isDesktopHost } from "../host"

/** Every model label the agent offers, in the order it offers them. The host asks the
 * sidecar — there is no file to read and no endpoint to ask — and keeps the answer for
 * the launch, so calling this a second time costs a round trip and no session.
 *
 * An empty answer is a host with no sidecar to ask, or a provider that names no model.
 * It is not a failure: what to offer instead is [`modelOptionsFor`]'s to decide, and a
 * bot's model is free text either way.
 *
 * Outside the host there is no sidecar to ask, so `bun dev:web` runs on that same
 * empty answer. */
export const readModelCatalogue = (): Promise<string[]> =>
	isDesktopHost() ? invoke<string[]>("agent_models") : Promise.resolve([])
