import { useEffect, useRef } from "react"

import type { ApplicationInstalled, ApplicationPort } from "./application-port"
import type { ReopenedScope } from "./session-reopening"

export type AnnouncedInstall = {
	application: string
	scope: ReopenedScope
}

const scopeOf = ({
	scope,
	destinationId,
}: ApplicationInstalled): ReopenedScope | null => {
	if (scope === "user") {
		return { kind: "user" }
	}
	if (!destinationId) {
		return null
	}
	return scope === "space"
		? { kind: "space", id: destinationId }
		: { kind: "companion", id: destinationId }
}

export const useApplicationInstalls = (
	port: ApplicationPort,
	onInstalled: (install: AnnouncedInstall) => void,
) => {
	const announce = useRef(onInstalled)

	useEffect(() => {
		announce.current = onInstalled
	}, [onInstalled])

	useEffect(() => {
		let isListening = true

		const listening = port
			.onInstalled((installed) => {
				const scope = scopeOf(installed)
				if (!isListening || !scope) {
					return
				}
				announce.current({ application: installed.application, scope })
			})
			.catch((reason) => {
				console.error("applications: installs could not be listened to", reason)
				return () => undefined
			})

		return () => {
			isListening = false
			void listening.then((unsubscribe) => unsubscribe())
		}
	}, [port])
}
