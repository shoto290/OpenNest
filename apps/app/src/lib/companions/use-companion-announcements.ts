import { useEffect, useRef } from "react"

import {
	type CompanionCreated,
	companionsTransport,
} from "./companions-transport"

export type CompanionAnnouncements = {
	onCreated: (created: CompanionCreated) => void
	onFirstRunDone: () => void
}

export const useCompanionAnnouncements = (
	announcements: CompanionAnnouncements,
) => {
	const announce = useRef(announcements)

	useEffect(() => {
		announce.current = announcements
	}, [announcements])

	useEffect(() => {
		const listening = Promise.all([
			companionsTransport.onCreated((created) =>
				announce.current.onCreated(created),
			),
			companionsTransport.onFirstRunDone(() =>
				announce.current.onFirstRunDone(),
			),
		]).catch((reason) => {
			console.error(
				"companions: companion announcements could not be listened to",
				reason,
			)
			return []
		})

		return () => {
			void listening.then((unsubscribes) => {
				for (const unsubscribe of unsubscribes) {
					unsubscribe()
				}
			})
		}
	}, [])
}
