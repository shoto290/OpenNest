import type { TransportError } from "./contract"

export function describeTransportError(error: TransportError): string {
	switch (error.kind) {
		case "binaryNotFound":
			return `Claude Code introuvable. Emplacements testés : ${error.searched.join(", ")}`
		case "notAuthenticated":
			return "Claude Code n'est pas connecté. Lancez `claude auth login`."
		case "authCheckFailed":
			return `Vérification d'authentification impossible : ${error.detail}`
		case "spawnFailed":
			return `Démarrage de Claude Code impossible : ${error.detail}`
		case "startupTimeout":
			return `Claude Code n'a pas répondu en ${error.timeoutMs} ms.`
		case "crashed":
			return `Claude Code s'est arrêté (code ${error.code ?? "inconnu"}).`
		case "invalidFrame":
			return `Trame illisible ignorée : ${error.detail}`
		case "notStarted":
			return "Aucune session active."
		case "turnAlreadyRunning":
			return "Un tour est déjà en cours."
		case "noActiveTurn":
			return "Aucun tour à interrompre."
		case "unknownPermission":
			return `Demande de permission inconnue (${error.id}).`
		case "writeFailed":
			return `Envoi impossible : ${error.detail}`
	}
}
