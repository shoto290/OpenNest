import type { ProviderBuild } from "./provider"

import { claudeBuild } from "./claude/build"

const PROVIDER_BUILDS: ProviderBuild[] = [claudeBuild]

export const prepareProviders = () =>
	Promise.all(
		PROVIDER_BUILDS.map(async (build) => {
			await build.prepare()
			return build.assetName
		}),
	)

export const singleAssetName = (assetNames: string[]) => {
	const [assetName, ...colliding] = new Set(assetNames)
	if (colliding.length > 0) {
		throw new Error(
			`bun build accepts one asset naming pattern, providers requested ${assetName}, ${colliding.join(", ")}`,
		)
	}
	return assetName
}
