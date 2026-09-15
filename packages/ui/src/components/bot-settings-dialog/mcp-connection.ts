import type { BotMcpConnectionState } from "@workspace/ui/components/bot-settings"

type McpRefusedRefresh = {
	reason: string
	companionName: string
	toolCount: number
	sessionCount: number
}

type McpConnectionSection = {
	state: BotMcpConnectionState
	host?: string
	authorizedAt?: string
	refusedRefresh?: McpRefusedRefresh
	onConnect?: () => void
	onCancel?: () => void
	onReopen?: () => void
	onDisconnect?: () => void
}

const MCP_ATTENTION_FIELD =
	"border-bot-badge-attention/45 bg-bot-badge-attention/8"

const MCP_DESTRUCTIVE_SURFACE = "border-destructive/22 bg-destructive/6"

const MCP_CONNECTION_DOT = {
	connected: "bg-emerald-500",
	needsAuthorization: "bg-bot-badge-attention",
	connecting: "bg-muted-foreground motion-safe:animate-pulse",
	failed: "bg-destructive",
} satisfies Record<BotMcpConnectionState, string>

export {
	MCP_ATTENTION_FIELD,
	MCP_CONNECTION_DOT,
	MCP_DESTRUCTIVE_SURFACE,
	type McpConnectionSection,
	type McpRefusedRefresh,
}
