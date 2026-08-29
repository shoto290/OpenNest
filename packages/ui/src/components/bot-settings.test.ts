import { describe, expect, it } from "vitest"

import {
	type BotSkillDraft,
	drawnAnimal,
	isMcpServerDraftUnsaved,
	isSkillDraftUnsaved,
	readMcpSecretReferences,
	readMcpServerFields,
	readMcpServerTransport,
	toMcpServerConfigFor,
	toMcpServerConfigWith,
	toMcpServerWrittenConfig,
	toSkillDescriptionLength,
} from "@workspace/ui/components/bot-settings"

const SKILL: BotSkillDraft = {
	name: "release-notes",
	description: "How this project words a changelog entry",
	body: "One line per change.",
}

describe("drawnAnimal", () => {
	it("draws skippy for a bot called Skippy, whatever it keeps", () => {
		expect(drawnAnimal("Skippy", "rabbit")).toBe("skippy")
	})

	it("reads the name past its case and its spaces", () => {
		expect(drawnAnimal("  sKiPpY  ", "rabbit")).toBe("skippy")
	})

	it("draws the stored animal under any other name", () => {
		expect(drawnAnimal("Skippy the second", "rabbit")).toBe("rabbit")
	})

	it("draws the stored animal for a bot with no name", () => {
		expect(drawnAnimal(undefined, "rabbit")).toBe("rabbit")
	})

	it("keeps drawing nothing where nothing is stored", () => {
		expect(drawnAnimal("Nibbles", undefined)).toBeUndefined()
	})
})

describe("isSkillDraftUnsaved", () => {
	it("reads a draft as untouched while every answer holds", () => {
		expect(isSkillDraftUnsaved({ ...SKILL }, SKILL)).toBe(false)
	})

	it("reads a changed answer as something to save", () => {
		expect(isSkillDraftUnsaved({ ...SKILL, body: "Two lines." }, SKILL)).toBe(
			true,
		)
	})

	it("reads a field answered for the first time as something to save", () => {
		expect(isSkillDraftUnsaved({ ...SKILL, isPreloaded: true }, SKILL)).toBe(
			true,
		)
	})

	it("reads a mark taken down as something to save", () => {
		expect(
			isSkillDraftUnsaved(
				{ ...SKILL, isUserInvocable: false },
				{ ...SKILL, isUserInvocable: true },
			),
		).toBe(true)
	})

	it("reads a field cleared back to nothing as unanswered rather than changed", () => {
		expect(
			isSkillDraftUnsaved(
				{ ...SKILL, whenToUse: "", effort: undefined },
				SKILL,
			),
		).toBe(false)
	})

	it("reads a skill nobody has written yet as something to save", () => {
		expect(isSkillDraftUnsaved(SKILL)).toBe(true)
	})
})

describe("toSkillDescriptionLength", () => {
	it("budgets the description and the sentence beside it as one", () => {
		expect(
			toSkillDescriptionLength({ ...SKILL, whenToUse: "Every Friday." }),
		).toBe(SKILL.description.length + "Every Friday.".length)
	})

	it("counts a skill that says only what it is for", () => {
		expect(toSkillDescriptionLength(SKILL)).toBe(SKILL.description.length)
	})
})

const SERVER = {
	command: "npx",
	args: ["-y", "@atlas/mcp"],
	env: { ATLAS_TOKEN: "sk-atlas" },
	type: "stdio",
}

describe("readMcpServerFields", () => {
	it("reads a list and an environment as the lines a reader types", () => {
		const fields = readMcpServerFields(SERVER)

		expect(fields.args).toBe("-y\n@atlas/mcp")
		expect(fields.environment).toBe("ATLAS_TOKEN=sk-atlas")
	})

	it("reads a key the configuration leaves out as an unanswered field", () => {
		expect(readMcpServerFields({}).url).toBe("")
	})
})

describe("toMcpServerConfigWith", () => {
	it("keeps every key no field names", () => {
		expect(toMcpServerConfigWith(SERVER, "command", "bunx")).toEqual({
			...SERVER,
			command: "bunx",
		})
	})

	it("takes a key out rather than writing it empty", () => {
		expect(toMcpServerConfigWith(SERVER, "environment", "")).toEqual({
			command: "npx",
			args: ["-y", "@atlas/mcp"],
			type: "stdio",
		})
	})

	it("reads a header written either way a server's instructions spell it", () => {
		expect(
			toMcpServerConfigWith(
				{},
				"headers",
				"Authorization: Bearer sk\nX-Room=4",
			),
		).toEqual({ headers: { Authorization: "Bearer sk", "X-Room": "4" } })
	})
})

describe("toMcpServerConfigFor", () => {
	it("drops what only the transport being left names", () => {
		expect(toMcpServerConfigFor(SERVER, "remote")).toEqual({
			env: { ATLAS_TOKEN: "sk-atlas" },
			type: "http",
		})
	})

	it("names the kind of endpoint a remote server cannot be reached without", () => {
		expect(
			toMcpServerConfigFor({ url: "https://atlas.dev" }, "remote"),
		).toEqual({
			url: "https://atlas.dev",
			type: "http",
		})
	})

	it("leaves the kind of endpoint a configuration already names", () => {
		expect(
			toMcpServerConfigFor({ url: "https://atlas.dev", type: "sse" }, "remote"),
		).toEqual({ url: "https://atlas.dev", type: "sse" })
	})

	it("keeps the other spelling of an HTTP endpoint rather than writing over it", () => {
		expect(
			toMcpServerConfigFor(
				{ url: "https://atlas.dev", type: "streamable-http" },
				"remote",
			),
		).toEqual({ url: "https://atlas.dev", type: "streamable-http" })
	})

	it("takes the endpoint out with the address once the server is started here", () => {
		expect(
			toMcpServerConfigFor(
				{
					url: "https://atlas.dev",
					type: "http",
					headers: { A: "b" },
					env: {},
				},
				"local",
			),
		).toEqual({ env: {} })
	})
})

describe("readMcpServerTransport", () => {
	it("reads an address as a server reached rather than started", () => {
		expect(readMcpServerTransport({ url: "https://atlas.dev" })).toBe("remote")
	})

	it("leaves a configuration naming neither on the transport it is already on", () => {
		expect(readMcpServerTransport({ type: "stdio" }, "remote")).toBe("remote")
	})

	it("reads a kind of endpoint as a server reached, whichever spelling it takes", () => {
		expect(readMcpServerTransport({ type: "streamable-http" })).toBe("remote")
		expect(readMcpServerTransport({ type: "ws" })).toBe("remote")
	})

	it("reads a configuration naming stdio off the keys it carries", () => {
		expect(readMcpServerTransport({ type: "stdio", command: "npx" })).toBe(
			"local",
		)
	})
})

describe("toMcpServerWrittenConfig", () => {
	it("writes the endpoint beside the address of a server that names none", () => {
		expect(
			toMcpServerWrittenConfig(
				{ url: "https://ledger.internal/mcp" },
				"remote",
			),
		).toEqual({ url: "https://ledger.internal/mcp", type: "http" })
	})

	it("reads a server missing that endpoint as something to save", () => {
		const draft = {
			name: "ledger",
			transport: "remote" as const,
			config: '{"url":"https://ledger.internal/mcp"}',
		}

		expect(isMcpServerDraftUnsaved(draft, draft)).toBe(true)
	})
})

describe("isMcpServerDraftUnsaved", () => {
	it("reads a configuration laid out again as nothing to save", () => {
		expect(
			isMcpServerDraftUnsaved(
				{ name: "atlas", transport: "local", config: '{ "command": "npx" }' },
				{ name: "atlas", transport: "local", config: '{"command":"npx"}' },
			),
		).toBe(false)
	})

	it("reads a key answered again in another order as nothing to save", () => {
		expect(
			isMcpServerDraftUnsaved(
				{
					name: "atlas",
					transport: "local",
					config: '{"args":["-y"],"command":"npx","env":{"B":"2","A":"1"}}',
				},
				{
					name: "atlas",
					transport: "local",
					config: '{"command":"npx","env":{"A":"1","B":"2"},"args":["-y"]}',
				},
			),
		).toBe(false)
	})

	it("reads a list put in another order as something to save", () => {
		expect(
			isMcpServerDraftUnsaved(
				{ name: "atlas", transport: "local", config: '{"args":["b","a"]}' },
				{ name: "atlas", transport: "local", config: '{"args":["a","b"]}' },
			),
		).toBe(true)
	})

	it("reads a rename as something to save", () => {
		expect(
			isMcpServerDraftUnsaved(
				{ name: "books", transport: "local", config: "{}" },
				{ name: "atlas", transport: "local", config: "{}" },
			),
		).toBe(true)
	})

	it("reads a server nobody has written yet as something to save", () => {
		expect(
			isMcpServerDraftUnsaved({ name: "", transport: "local", config: "{}" }),
		).toBe(true)
	})
})

describe("readMcpSecretReferences", () => {
	it("names every key the five places a server is started from ask for", () => {
		expect(
			readMcpSecretReferences({
				// biome-ignore lint/suspicious/noTemplateCurlyInString: the reference syntax a configuration carries
				command: "${secret:LAUNCHER}",
				// biome-ignore lint/suspicious/noTemplateCurlyInString: the reference syntax a configuration carries
				args: ["--token", "${secret:ARG_TOKEN}"],
				// biome-ignore lint/suspicious/noTemplateCurlyInString: the reference syntax a configuration carries
				url: "https://ledger.internal/${secret:PATH_TOKEN}",
				// biome-ignore lint/suspicious/noTemplateCurlyInString: the reference syntax a configuration carries
				env: { ATLAS_TOKEN: "${secret:ENV_TOKEN}" },
				// biome-ignore lint/suspicious/noTemplateCurlyInString: the reference syntax a configuration carries
				headers: { Authorization: "Bearer ${secret:HEADER_TOKEN}" },
			}),
		).toEqual([
			"LAUNCHER",
			"ARG_TOKEN",
			"PATH_TOKEN",
			"ENV_TOKEN",
			"HEADER_TOKEN",
		])
	})

	it("asks once for a key two places reference", () => {
		expect(
			readMcpSecretReferences({
				// biome-ignore lint/suspicious/noTemplateCurlyInString: the reference syntax a configuration carries
				args: ["${secret:ATLAS_TOKEN}"],
				// biome-ignore lint/suspicious/noTemplateCurlyInString: the reference syntax a configuration carries
				env: { ATLAS_TOKEN: "${secret:ATLAS_TOKEN}" },
			}),
		).toEqual(["ATLAS_TOKEN"])
	})

	it("names both keys one value carries", () => {
		expect(
			readMcpSecretReferences({
				// biome-ignore lint/suspicious/noTemplateCurlyInString: the reference syntax a configuration carries
				url: "https://${secret:HOST}/mcp?key=${secret:KEY}",
			}),
		).toEqual(["HOST", "KEY"])
	})

	it("reads a reference from every field, as the resolver does", () => {
		expect(
			readMcpSecretReferences({
				command: "npx",
				args: ["-y", "@atlas/mcp-server"],
				env: { ATLAS_REGION: "eu" },
				// biome-ignore lint/suspicious/noTemplateCurlyInString: the reference syntax a configuration carries
				transport: "${secret:ATLAS_TRANSPORT}",
			}),
		).toEqual(["ATLAS_TRANSPORT"])
	})

	it("leaves alone a curly form the grammar refuses", () => {
		expect(
			readMcpSecretReferences({
				// biome-ignore lint/suspicious/noTemplateCurlyInString: a form the grammar refuses
				env: { REGION: "${env:ATLAS_REGION}" },
				// biome-ignore lint/suspicious/noTemplateCurlyInString: a form the grammar refuses
				url: "${secret:has space}",
			}),
		).toEqual([])
	})
})
