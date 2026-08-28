import { useEffect } from "react"

import {
	type EvolutionSourceOptions,
	startEvolutionSource,
} from "./evolution-source"

export const useEvolution = ({
	driver,
	roster,
	skills,
	history,
	userPlugin,
	spacePlugin,
}: EvolutionSourceOptions) => {
	useEffect(
		() =>
			startEvolutionSource({
				driver,
				roster,
				skills,
				history,
				userPlugin,
				spacePlugin,
			}),
		[driver, roster, skills, history, userPlugin, spacePlugin],
	)
}
