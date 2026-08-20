import { describeError } from "./describe-error"

import {
	DEFAULT_PROVIDER_ID,
	findProvider,
	PROVIDER_IDS,
} from "./providers/registry"

const UNKNOWN_PROVIDER_EXIT_CODE = 64
const NOT_READY_EXIT_CODE = 1

export const probe = (requestedId?: string) => {
	const id = requestedId ?? DEFAULT_PROVIDER_ID
	const provider = findProvider(id)
	if (!provider) {
		process.stderr.write(
			`Unknown provider "${id}". Known providers: ${PROVIDER_IDS.join(", ")}\n`,
		)
		process.exit(UNKNOWN_PROVIDER_EXIT_CODE)
	}
	try {
		provider.assertReady()
	} catch (error) {
		process.stderr.write(`${describeError(error)}\n`)
		process.exit(NOT_READY_EXIT_CODE)
	}
	process.stdout.write(
		`${JSON.stringify({
			provider: provider.id,
			version: provider.version,
			sdkVersion: provider.sdkVersion,
			capabilities: provider.capabilities,
		})}\n`,
	)
}
