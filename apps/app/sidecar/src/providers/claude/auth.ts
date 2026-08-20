import { resolveExecutable } from "./executable"

import type { ProviderAuth } from "../provider"
import { describeError } from "../../describe-error"

/** The payload also carries an email, an organisation and a subscription type. It
 * is reduced to one boolean here and the rest is dropped on the floor: nothing
 * below `authenticated` ever leaves this module. */
type AuthStatus = {
	loggedIn?: boolean
}

/** The local subscription, read from the credential store the shipped executable
 * already owns. Spawned rather than asked over the SDK: no session can be opened
 * before this answer, so there is nothing to ask it of.
 *
 * A probe that could not be run at all answers with a `detail` instead of a
 * verdict — a broken install is not the same account as one that is signed out. */
export const authenticateClaude = async (): Promise<ProviderAuth> => {
	try {
		const child = Bun.spawn([resolveExecutable(), "auth", "status"], {
			stdout: "pipe",
			stderr: "ignore",
		})
		const [stdout] = await Promise.all([
			new Response(child.stdout).text(),
			child.exited,
		])
		const status = JSON.parse(stdout.trim()) as AuthStatus
		return { authenticated: status.loggedIn === true }
	} catch (error) {
		return { authenticated: false, detail: describeError(error) }
	}
}
