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
	"SystemRoot",
	"USERPROFILE",
	"APPDATA",
	"LOCALAPPDATA",
	"TEMP",
	"TMP",
	"PATHEXT",
	"ComSpec",
	EXECUTABLE_OVERRIDE_ENV,
]

export const inheritedEnv = (
	source: NodeJS.ProcessEnv = process.env,
): Record<string, string> =>
	Object.fromEntries(
		INHERITED_KEYS.flatMap((key) => {
			const value = source[key]
			return value === undefined ? [] : [[key, value] as const]
		}),
	)
