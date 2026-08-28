import type { ChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import type { TransportError } from "./contract"

export function describeTransportError(
	t: ChatCopy,
	error: TransportError,
): string {
	switch (error.kind) {
		case "binaryNotFound":
			return t("screen.transport.binaryNotFound")
		case "notAuthenticated":
			return t("screen.transport.notAuthenticated")
		case "authCheckFailed":
			return t("screen.transport.authCheckFailed", { detail: error.detail })
		case "spawnFailed":
			return t("screen.transport.spawnFailed", { detail: error.detail })
		case "startupTimeout":
			return t("screen.transport.startupTimeout", {
				timeoutMs: error.timeoutMs,
			})
		case "crashed":
			return error.code === null
				? t("screen.transport.crashedUnknownCode")
				: t("screen.transport.crashed", { code: error.code })
		case "resumeFailed":
			return t("screen.transport.resumeFailed")
		case "workingDirectoryRefused":
			return t("screen.transport.workingDirectoryRefused", {
				path: error.path,
			})
		case "invalidFrame":
			return t("screen.transport.invalidFrame", { detail: error.detail })
		case "settingsRejected":
			return t("screen.transport.settingsRejected", { detail: error.detail })
		case "notStarted":
			return t("screen.transport.notStarted")
		case "turnAlreadyRunning":
			return t("screen.transport.turnAlreadyRunning")
		case "transitionInProgress":
			return t("screen.transport.transitionInProgress")
		case "noActiveTurn":
			return t("screen.transport.noActiveTurn")
		case "staleRuntimeSession":
			return t("screen.transport.staleRuntimeSession")
		case "unknownPermission":
			return t("screen.transport.unknownPermission", { id: error.id })
		case "writeFailed":
			return t("screen.transport.writeFailed", { detail: error.detail })
	}
}
