import { describe, expect, it } from "bun:test"

import { EXECUTABLE_OVERRIDE_ENV } from "./executable"
import { inheritedEnv } from "./session-env"

describe("inheritedEnv", () => {
	it("keeps every allowed key the sidecar carries", () => {
		const source = {
			PATH: "/usr/bin",
			HOME: "/home/bean",
			SHELL: "/bin/zsh",
			USER: "bean",
			LOGNAME: "bean",
			TMPDIR: "/tmp",
			LANG: "en_US.UTF-8",
			LC_ALL: "en_US.UTF-8",
			TERM: "xterm",
			TZ: "Europe/Paris",
			HTTP_PROXY: "http://proxy:1",
			HTTPS_PROXY: "http://proxy:2",
			NO_PROXY: "localhost",
			http_proxy: "http://proxy:3",
			https_proxy: "http://proxy:4",
			no_proxy: "127.0.0.1",
			NODE_EXTRA_CA_CERTS: "/certs/corp.pem",
			SSL_CERT_FILE: "/certs/bundle.pem",
			[EXECUTABLE_OVERRIDE_ENV]: "/bin/claude",
		}

		expect(inheritedEnv(source)).toEqual(source)
	})

	it("drops a key the allowlist does not name", () => {
		const env = inheritedEnv({ PATH: "/usr/bin", ANTHROPIC_API_KEY: "sk-live" })

		expect(env).toEqual({ PATH: "/usr/bin" })
	})

	it("omits an allowed key the sidecar does not carry", () => {
		expect(inheritedEnv({ PATH: "/usr/bin" })).not.toHaveProperty("HOME")
	})

	it("drops an allowed key whose value carries a stored secret", () => {
		const env = inheritedEnv(
			{ PATH: "/usr/bin", HTTPS_PROXY: "http://bean:ghp_livevalue@proxy" },
			["ghp_livevalue"],
		)

		expect(env).toEqual({ PATH: "/usr/bin" })
	})

	it("keeps every key when no secret is stored", () => {
		const source = { PATH: "/usr/bin", HTTPS_PROXY: "http://proxy" }

		expect(inheritedEnv(source, [])).toEqual(source)
		expect(inheritedEnv(source, [""])).toEqual(source)
	})
})
