import { useEffect, useRef } from "react"

import { createArrivalsListener } from "./create-arrivals-listener"
import type { CompanionArrival } from "./transcript-contract"

export const useCompanionArrivals = (onArrived: () => void) => {
	const announce = useRef(onArrived)
	const settled = useRef(new Set<string>())

	useEffect(() => {
		announce.current = onArrived
	}, [onArrived])

	useEffect(() => {
		let isListening = true

		const arrived = ({ id }: CompanionArrival) => {
			if (!isListening || settled.current.has(id)) {
				return
			}
			settled.current.add(id)
			announce.current()
		}

		const listening = createArrivalsListener()(arrived).catch((reason) => {
			console.error(
				"conversations: companion arrivals could not be listened to",
				reason,
			)
			return () => undefined
		})

		return () => {
			isListening = false
			void listening.then((unsubscribe) => unsubscribe())
		}
	}, [])
}
