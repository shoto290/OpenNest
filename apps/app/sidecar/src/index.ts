import { probe } from "./probe"

const PROBE_FLAG = "--probe"
const PROVIDER_FLAG = "--provider="

const requestedProviderId = () =>
	process.argv
		.find((argument) => argument.startsWith(PROVIDER_FLAG))
		?.slice(PROVIDER_FLAG.length)

if (process.argv.includes(PROBE_FLAG)) {
	probe(requestedProviderId())
} else {
	process.stderr.write(
		`usage: opennest-agent ${PROBE_FLAG} [${PROVIDER_FLAG}<id>]\n`,
	)
	process.exit(64)
}
