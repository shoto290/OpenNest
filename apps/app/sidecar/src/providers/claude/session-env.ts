import { EXECUTABLE_OVERRIDE_ENV } from "./executable"

const INHERITED_KEYS = [
	"PATH",
	"HOME",
	"SHELL",
	"USER",
	"LOGNAME",
	"TMPDIR",
	"LANG",
	"LC_ALL",
	"TERM",
	"TZ",
	"HTTP_PROXY",
	"HTTPS_PROXY",
	"NO_PROXY",
	"http_proxy",
	"https_proxy",
	"no_proxy",
	"NODE_EXTRA_CA_CERTS",
	"SSL_CERT_FILE",
	EXECUTABLE_OVERRIDE_ENV,
]

const carriesSecret = (value: string, secrets: string[]): boolean =>
	secrets.some((secret) => secret.length > 0 && value.includes(secret))

export const inheritedEnv = (
	source: NodeJS.ProcessEnv = process.env,
	secrets: string[] = [],
): Record<string, string> =>
	Object.fromEntries(
		INHERITED_KEYS.flatMap((key) => {
			const value = source[key]
			if (value === undefined || carriesSecret(value, secrets)) {
				return []
			}
			return [[key, value] as const]
		}),
	)
