import { invoke } from "@tauri-apps/api/core"

import { isDesktopHost } from "../host"

/** Every model label the installed Claude Code knows how to name, in the order it is
 * offered: tier by tier, each tier's own alias first. The host reads it out of the
 * executable itself — there is nothing to ask it, and no endpoint to ask — and reads
 * it once per launch, so calling this a second time costs a round trip and no file.
 *
 * An empty answer is a machine whose executable could not be found or carries no
 * catalogue. It is not a failure: what to offer instead is [`modelOptionsFor`]'s to
 * decide, and a bot's model is free text either way.
 *
 * Outside the host there is no executable to read, so `bun dev:web` runs on that same
 * empty answer. */
export const readModelCatalogue = (): Promise<string[]> =>
	isDesktopHost() ? invoke<string[]>("claude_models") : Promise.resolve([])
