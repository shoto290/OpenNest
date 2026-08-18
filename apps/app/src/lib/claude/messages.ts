import type { TransportError } from "./contract"

export function describeTransportError(error: TransportError): string {
	switch (error.kind) {
		case "binaryNotFound":
			return `Claude Code was not found. Locations tried: ${error.searched.join(", ")}`
		case "notAuthenticated":
			return "Claude Code is not signed in. Run `claude auth login`."
		case "authCheckFailed":
			return `The sign-in check failed: ${error.detail}`
		case "spawnFailed":
			return `Claude Code could not be started: ${error.detail}`
		case "startupTimeout":
			return `Claude Code did not answer within ${error.timeoutMs} ms.`
		case "crashed":
			return `Claude Code exited (code ${error.code ?? "unknown"}).`
		case "resumeFailed":
			return "That conversation could not be resumed. Claude Code started a new one; your messages are still here."
		case "workingDirectoryRefused":
			return `${error.path} is not there any more. This bot is answering from the usual place instead.`
		case "invalidFrame":
			return `An unreadable frame was skipped: ${error.detail}`
		case "notStarted":
			return "No session is running."
		case "turnAlreadyRunning":
			return "A turn is already running."
		case "transitionInProgress":
			return "A session change is already in progress."
		case "noActiveTurn":
			return "There is no turn to interrupt."
		case "staleRuntimeSession":
			return "That session has been replaced. The one running now took its place."
		case "unknownPermission":
			return `Unknown permission request (${error.id}).`
		case "writeFailed":
			return `The prompt could not be sent: ${error.detail}`
	}
}
