import type { BotMcpServerItem } from "@workspace/ui/components/bot-settings"
import type {
	ApplicationCategory,
	CatalogueApplication,
} from "@workspace/ui/components/plugin-settings/applications-catalogue"

const markOf = (fill: string, letter: string) =>
	`data:image/svg+xml,${encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><rect width="36" height="36" fill="${fill}"/><text x="18" y="23.5" fill="#ffffff" font-family="system-ui, sans-serif" font-size="15" font-weight="600" text-anchor="middle">${letter}</text></svg>`,
	)}`

const LINEAR_MARK = markOf("#5e6ad2", "L")
const GITHUB_MARK = markOf("#24292f", "G")
const NOTION_MARK = markOf("#191919", "N")
const SENTRY_MARK = markOf("#362d59", "S")
const FIGMA_MARK = markOf("#a259ff", "F")
const POSTGRES_MARK = markOf("#336791", "P")

export const MARKED_APPLICATIONS: BotMcpServerItem[] = [
	{
		name: "linear",
		displayName: "Linear",
		mark: LINEAR_MARK,
		config: { type: "http", url: "https://mcp.linear.app/mcp" },
		connection: "connected",
	},
	{
		name: "github",
		displayName: "GitHub",
		mark: GITHUB_MARK,
		config: { type: "http", url: "https://api.githubcopilot.com/mcp/" },
		connection: "needsAuthorization",
	},
	{
		name: "atlas",
		config: { command: "npx", args: ["-y", "@atlas/mcp-server"] },
		connection: "failed",
	},
]

export const CATALOGUE_CATEGORIES: ApplicationCategory[] = [
	{ id: "everything", label: "Everything", count: 6 },
	{ id: "work", label: "Work tracking" },
	{ id: "code", label: "Code" },
	{ id: "design", label: "Design" },
	{ id: "data", label: "Data" },
]

export const CURATED_APPLICATIONS: CatalogueApplication[] = [
	{
		id: "linear",
		name: "Linear",
		description: "Reads and files issues, projects and cycles.",
		setup: "signIn",
		mark: LINEAR_MARK,
	},
	{
		id: "github",
		name: "GitHub",
		description: "Opens pull requests and reads repositories.",
		setup: "signIn",
		mark: GITHUB_MARK,
	},
	{
		id: "notion",
		name: "Notion",
		description: "Searches pages and writes into databases.",
		setup: "signIn",
		mark: NOTION_MARK,
	},
	{
		id: "sentry",
		name: "Sentry",
		description: "Pulls the errors and traces behind a release.",
		setup: "apiKey",
		mark: SENTRY_MARK,
	},
	{
		id: "figma",
		name: "Figma",
		description: "Reads frames, components and their tokens.",
		setup: "apiKey",
		mark: FIGMA_MARK,
	},
	{
		id: "postgres",
		name: "Postgres",
		description: "Runs read-only queries against a local database.",
		setup: "none",
		mark: POSTGRES_MARK,
	},
]

export const REGISTRY_APPLICATIONS: CatalogueApplication[] = [
	{
		id: "io.github.weatherdesk/forecast",
		name: "forecast",
		description: "Forecasts and alerts from national weather services.",
		setup: "none",
	},
	{
		id: "io.github.linear-community/linear-lite",
		name: "linear-lite",
		description: "A smaller Linear server that only reads issues.",
		setup: "apiKey",
	},
]

export const PUBLISHED_APPLICATION_COUNT = 1284
