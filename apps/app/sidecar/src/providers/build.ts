import type { ProviderBuild, StageTarget } from "./provider"

import { claudeBuild } from "./claude/build"

const PROVIDER_BUILDS: ProviderBuild[] = [claudeBuild]

export const prepareProviders = () =>
	Promise.all(PROVIDER_BUILDS.map((build) => build.prepare()))

export const stageProviders = (target: StageTarget) => {
	for (const build of PROVIDER_BUILDS) {
		build.stage(target)
	}
}
