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

	it("keeps every Windows key a spawned process needs", () => {
		const source = {
			SystemRoot: "C:\\Windows",
			USERPROFILE: "C:\\Users\\bean",
			APPDATA: "C:\\Users\\bean\\AppData\\Roaming",
			LOCALAPPDATA: "C:\\Users\\bean\\AppData\\Local",
			TEMP: "C:\\Temp",
			TMP: "C:\\Temp",
			PATHEXT: ".COM;.EXE;.BAT;.CMD",
			ComSpec: "C:\\Windows\\system32\\cmd.exe",
		}

		expect(inheritedEnv(source)).toEqual(source)
	})

	it("omits every Windows key a POSIX source does not carry", () => {
		expect(inheritedEnv({ PATH: "/usr/bin" })).toEqual({ PATH: "/usr/bin" })
	})

	it("drops a key the allowlist does not name", () => {
		const env = inheritedEnv({ PATH: "/usr/bin", ANTHROPIC_API_KEY: "sk-live" })

		expect(env).toEqual({ PATH: "/usr/bin" })
	})

	it("omits an allowed key the sidecar does not carry", () => {
		expect(inheritedEnv({ PATH: "/usr/bin" })).not.toHaveProperty("HOME")
	})
})
