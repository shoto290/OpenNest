import { describeProvider } from "./describe"

import { requireProvider } from "./providers/registry"

export const probe = (requestedId?: string) => {
	const provider = requireProvider(requestedId)
	process.stdout.write(`${JSON.stringify(describeProvider(provider))}\n`)
}
