import type { BotMcpServerItem } from "@workspace/ui/components/bot-settings"

export const BOT_MCP_SERVERS: BotMcpServerItem[] = [
	{
		name: "atlas",
		config: {
			command: "npx",
			args: ["-y", "@atlas/mcp-server", "--root", "/Users/reader/atlas"],
			env: { ATLAS_TOKEN: "sk-atlas-2f9c41d8e7b6a530", ATLAS_REGION: "eu" },
		},
	},
	{
		name: "ledger",
		config: {
			type: "http",
			url: "https://ledger.internal/mcp",
		},
	},
	{
		name: "sketchpad",
		config: {
			transport: "stdio",
		},
	},
]

export const LONG_MCP_SERVER: BotMcpServerItem = {
	name: "nightly-ingestion-pipeline-inspector",
	config: {
		command: "/usr/local/lib/observability/bin/ingestion-inspector",
		args: [
			"--checkpoint-store",
			"postgres://observability.internal:5432/checkpoints",
			"--dead-letter-queue",
			"amqps://observability.internal:5671/dead-letters",
			"--replay",
			"never",
		],
		env: {
			INSPECTOR_TOKEN:
				"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aW5zcGVjdG9yLW5pZ2h0bHk",
			INSPECTOR_LOG_LEVEL: "debug",
		},
	},
}
