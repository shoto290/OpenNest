/// <reference types="node" />

import { Buffer } from "node:buffer"
import { execFileSync, spawn } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import {
	createServer,
	type IncomingHttpHeaders,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

const REPO_ROOT = resolve(
	fileURLToPath(new URL(".", import.meta.url)),
	"../../../../..",
)
const SCRIPT = join(REPO_ROOT, ".claude/hooks/opennest-agent-hook.sh")
const PATH_SUFFIX = "/routines/call"

type ReceivedCall = {
	method: string | undefined
	path: string | undefined
	headers: IncomingHttpHeaders
	body: string
}

type Listener = {
	server: Server
	calls: ReceivedCall[]
	url: string
}

const listeningOn = async (status: number): Promise<Listener> => {
	const calls: ReceivedCall[] = []
	const server = createServer(
		(request: IncomingMessage, response: ServerResponse) => {
			const chunks: Buffer[] = []
			request.on("data", (chunk: Buffer) => chunks.push(chunk))
			request.on("end", () => {
				calls.push({
					method: request.method,
					path: request.url,
					headers: request.headers,
					body: Buffer.concat(chunks).toString("utf8"),
				})
				response.writeHead(status)
				response.end()
			})
		},
	)
	await new Promise<void>((listening) => {
		server.listen(0, "127.0.0.1", listening)
	})
	const { port } = server.address() as AddressInfo
	return { server, calls, url: `http://127.0.0.1:${port}${PATH_SUFFIX}` }
}

const closing = (server: Server) =>
	new Promise<void>((closed) => {
		server.close(() => closed())
	})

const freePort = async () => {
	const { server, url } = await listeningOn(202)
	await closing(server)
	return url
}

type HookRun = {
	input: Record<string, unknown>
	home: string
	configPath?: string
}

type HookOutcome = {
	code: number | null
	stdout: string
	stderr: string
}

const runningHook = ({ input, home, configPath }: HookRun) =>
	new Promise<HookOutcome>((ran, failed) => {
		const child = spawn(SCRIPT, {
			cwd: REPO_ROOT,
			env: {
				PATH: process.env.PATH ?? "",
				HOME: home,
				...(configPath ? { OPENNEST_AGENT_HOOK: configPath } : {}),
			},
		})
		let stdout = ""
		let stderr = ""
		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString("utf8")
		})
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString("utf8")
		})
		child.on("error", failed)
		child.on("close", (code: number | null) => ran({ code, stdout, stderr }))
		child.stdin.end(JSON.stringify(input))
	})

describe("the OpenNest agent hook", () => {
	let home: string
	let configPath: string
	let transcriptPath: string

	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "opennest-agent-hook-"))
		configPath = join(home, "agent-hook.json")
		transcriptPath = join(home, "transcript.jsonl")
	})

	afterEach(() => {
		rmSync(home, { recursive: true, force: true })
	})

	const writeConfig = (config: Record<string, unknown>) => {
		writeFileSync(configPath, JSON.stringify(config))
	}

	const writeTranscript = (texts: string[]) => {
		const lines = [
			JSON.stringify({ type: "user", message: { content: "go on" } }),
			...texts.map((text) =>
				JSON.stringify({
					type: "assistant",
					message: { content: [{ type: "text", text }] },
				}),
			),
		]
		writeFileSync(transcriptPath, `${lines.join("\n")}\n`)
	}

	it("sends the whole payload on a Stop event carrying a transcript", async () => {
		const { server, calls, url } = await listeningOn(202)
		writeConfig({ url, key: "routine-key" })
		writeTranscript(["an earlier word", "the last word"])

		const outcome = await runningHook({
			home,
			configPath,
			input: {
				hook_event_name: "Stop",
				session_id: "session-1",
				cwd: REPO_ROOT,
				transcript_path: transcriptPath,
			},
		})
		await closing(server)

		expect(outcome.code).toBe(0)
		expect(calls).toHaveLength(1)
		const [call] = calls
		expect(call.method).toBe("POST")
		expect(call.path).toBe(PATH_SUFFIX)
		expect(call.headers["x-opennest-delivery"]).toBe("routine-key")
		expect(call.headers["x-opennest-delivery-id"]).toMatch(/^\w+$/)
		expect(JSON.parse(call.body)).toEqual({
			event: "Stop",
			sessionId: "session-1",
			cwd: REPO_ROOT,
			branch: execFileSync("git", ["branch", "--show-current"], {
				cwd: REPO_ROOT,
			})
				.toString("utf8")
				.trim(),
			excerpt: "the last word",
			message: "",
		})
		expect(Buffer.byteLength(call.body)).toBeLessThan(64 * 1024)
	})

	it("cuts the excerpt to 500 characters", async () => {
		const { server, calls, url } = await listeningOn(202)
		writeConfig({ url, key: "routine-key" })
		writeTranscript(["z".repeat(900)])

		const outcome = await runningHook({
			home,
			configPath,
			input: {
				hook_event_name: "Stop",
				session_id: "session-2",
				cwd: REPO_ROOT,
				transcript_path: transcriptPath,
			},
		})
		await closing(server)

		expect(outcome.code).toBe(0)
		expect(JSON.parse(calls[0].body).excerpt).toBe("z".repeat(500))
	})

	it("sends the message and an empty excerpt on a Notification event without a transcript", async () => {
		const { server, calls, url } = await listeningOn(202)
		writeConfig({ url, key: "routine-key" })

		const outcome = await runningHook({
			home,
			configPath,
			input: {
				hook_event_name: "Notification",
				session_id: "session-3",
				cwd: REPO_ROOT,
				transcript_path: join(home, "nowhere.jsonl"),
				message: "Claude needs your permission to use Bash",
			},
		})
		await closing(server)

		expect(outcome.code).toBe(0)
		expect(calls).toHaveLength(1)
		expect(JSON.parse(calls[0].body)).toMatchObject({
			event: "Notification",
			sessionId: "session-3",
			excerpt: "",
			message: "Claude needs your permission to use Bash",
		})
	})

	it("sends nothing when no config file is there", async () => {
		const { server, calls } = await listeningOn(202)

		const outcome = await runningHook({
			home,
			input: { hook_event_name: "Stop", session_id: "session-4" },
		})
		await closing(server)

		expect(outcome.code).toBe(0)
		expect(outcome.stdout).toBe("")
		expect(calls).toHaveLength(0)
	})

	it("sends nothing when the config file carries no key", async () => {
		const { server, calls, url } = await listeningOn(202)
		writeConfig({ url })

		const outcome = await runningHook({
			home,
			configPath,
			input: { hook_event_name: "Stop", session_id: "session-5" },
		})
		await closing(server)

		expect(outcome.code).toBe(0)
		expect(outcome.stdout).toBe("")
		expect(calls).toHaveLength(0)
	})

	it("sends nothing when the input carries an agent id", async () => {
		const { server, calls, url } = await listeningOn(202)
		writeConfig({ url, key: "routine-key" })

		const outcome = await runningHook({
			home,
			configPath,
			input: {
				hook_event_name: "Stop",
				session_id: "session-6",
				agent_id: "subagent-1",
			},
		})
		await closing(server)

		expect(outcome.code).toBe(0)
		expect(calls).toHaveLength(0)
	})

	it("exits 0 when the server refuses the call", async () => {
		const { server, calls, url } = await listeningOn(404)
		writeConfig({ url, key: "unknown-key" })

		const outcome = await runningHook({
			home,
			configPath,
			input: { hook_event_name: "Stop", session_id: "session-7" },
		})
		await closing(server)

		expect(outcome.code).toBe(0)
		expect(calls).toHaveLength(1)
	})

	it("exits 0 when nothing listens on the port", async () => {
		const url = await freePort()
		writeConfig({ url, key: "routine-key" })

		const outcome = await runningHook({
			home,
			configPath,
			input: { hook_event_name: "Stop", session_id: "session-8" },
		})

		expect(outcome.code).toBe(0)
	})
})
