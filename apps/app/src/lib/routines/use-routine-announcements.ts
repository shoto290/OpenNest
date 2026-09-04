import { useEffect, useRef } from "react"

import { routinesTransport } from "./routines-transport"

export const useRoutineAnnouncements = (
	conversationId: string | null,
	onAnnounced: () => void,
) => {
	const announce = useRef(onAnnounced)

	useEffect(() => {
		announce.current = onAnnounced
	}, [onAnnounced])

	useEffect(() => {
		if (!conversationId) {
			return
		}

		const listening = routinesTransport
			.onChanged((changed) => {
				if (changed.conversationId === conversationId) {
					announce.current()
				}
			})
			.catch((reason) => {
				console.error(
					"routines panel: routine changes could not be listened to",
					reason,
				)
				return () => undefined
			})

		return () => {
			void listening.then((unsubscribe) => unsubscribe())
		}
	}, [conversationId])
}
