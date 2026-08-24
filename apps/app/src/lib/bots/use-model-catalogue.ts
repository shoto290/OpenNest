import { useEffect, useState } from "react"

import { readModelCatalogue } from "./model-catalogue"

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
