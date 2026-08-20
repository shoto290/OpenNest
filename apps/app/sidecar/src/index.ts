import { probe } from "./probe"
import { serve } from "./serve"

const PROBE_FLAG = "--probe"
const SERVE_FLAG = "--serve"
const PROVIDER_FLAG = "--provider="

const requestedProviderId = () =>
	process.argv
		.find((argument) => argument.startsWith(PROVIDER_FLAG))
		?.slice(PROVIDER_FLAG.length)

if (process.argv.includes(PROBE_FLAG)) {
	probe(requestedProviderId())
} else if (process.argv.includes(SERVE_FLAG)) {
	await serve(requestedProviderId())
} else {
	process.stderr.write(
		`usage: opennest-agent ${PROBE_FLAG}|${SERVE_FLAG} [${PROVIDER_FLAG}<id>]\n`,
	)
	process.exit(64)
}
