import { useEffect, useState } from "react"

import { readModelCatalogue } from "./model-catalogue"

/** The catalogue for this launch. Read once, on mount, because it describes the
 * machine rather than the roster: nothing a reader does to a bot can change what the
 * installed executable knows how to name. Until it answers — one file read, off the
 * host's main thread — the empty list stands, and what that offers is the aliases
 * every build knows. */
export const useModelCatalogue = (): string[] => {
	const [catalogue, setCatalogue] = useState<string[]>([])

	useEffect(() => {
		let listening = true
		void readModelCatalogue().then((found) => {
			if (listening) setCatalogue(found)
		})
		return () => {
			listening = false
		}
	}, [])

	return catalogue
}
