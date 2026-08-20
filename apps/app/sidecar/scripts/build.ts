import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"

import { prepareProviders, singleAssetName } from "../src/providers/build"

const BINARY_NAME = "opennest-agent"

const sidecarRoot = dirname(import.meta.dir)
const binariesDirectory = join(sidecarRoot, "..", "src-tauri", "binaries")

const hostTargetTriple = () => {
	const rustc = Bun.spawnSync(["rustc", "-vV"])
	if (!rustc.success) {
		throw new Error(
			"rustc is required to name the sidecar after the host target triple",
		)
	}
	const host = /^host: (.+)$/m.exec(rustc.stdout.toString())
	if (!host) {
		throw new Error("rustc -vV did not report a host triple")
	}
	return host[1].trim()
}

type CompileOptions = {
	outfile: string
	assetName: string
}

const compile = ({ outfile, assetName }: CompileOptions) => {
	mkdirSync(dirname(outfile), { recursive: true })
	const build = Bun.spawnSync(
		[
			"bun",
			"build",
			"--compile",
			join(sidecarRoot, "src", "index.ts"),
			`--asset-naming=${assetName}`,
			"--outfile",
			outfile,
		],
		{ cwd: sidecarRoot, stdio: ["inherit", "inherit", "inherit"] },
	)
	if (!build.success) {
		throw new Error(`bun build --compile failed for ${outfile}`)
	}
}

const targetTriple = hostTargetTriple()
const assetNames = await prepareProviders()

compile({
	outfile: join(binariesDirectory, `${BINARY_NAME}-${targetTriple}`),
	assetName: singleAssetName(assetNames),
})
