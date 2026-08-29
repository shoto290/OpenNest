export type ReferenceCase = {
	text: string
	keys: string[]
}

export const REFERENCE_CASES: ReferenceCase[] = [
	{ text: "${secret:github.env.TOKEN}", keys: ["github.env.TOKEN"] },
	{ text: "Bearer ${secret:github.env.TOKEN}", keys: ["github.env.TOKEN"] },
	{
		text: "${secret:a.env.ONE} and ${secret:b.env.TWO}",
		keys: ["a.env.ONE", "b.env.TWO"],
	},
	{
		text: "${secret:a.env.ONE}${secret:a.env.ONE}",
		keys: ["a.env.ONE"],
	},
	{ text: "${secret:remote.args.3}", keys: ["remote.args.3"] },
	{ text: "${secret:remote.url.api_key}", keys: ["remote.url.api_key"] },
	{
		text: "${secret:Server-One.headers.X-Api-Key}",
		keys: ["Server-One.headers.X-Api-Key"],
	},
	{ text: "no reference at all", keys: [] },
	{ text: "${env:GITHUB_TOKEN}", keys: [] },
	{ text: "${secret:}", keys: [] },
	{ text: "${secret:has space}", keys: [] },
	{ text: "${secret:has\nnewline}", keys: [] },
	{ text: "${secret:has{brace}", keys: [] },
	{ text: "${secret:has:colon}", keys: [] },
	{ text: "${secret:has$dollar}", keys: [] },
	{ text: "${secret:unclosed", keys: [] },
	{ text: "$ {secret:spaced}", keys: [] },
	{ text: "${SECRET:github.env.TOKEN}", keys: [] },
]

export const ROUND_TRIP_KEYS = [
	"github.env.GITHUB_TOKEN",
	"github.headers.Authorization",
	"remote.args.0",
	"remote.url.api_key",
	"Server-One.env.X_TOKEN",
]
