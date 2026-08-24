import { resolveExecutable } from "./executable"

import type { ProviderAuth } from "../provider"
import { describeError } from "../../describe-error"

type AuthStatus = {
	loggedIn?: boolean
}

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
