export const SURFACE_TOKENS = [
	"--background",
	"--foreground",
	"--card",
	"--card-foreground",
	"--popover",
	"--popover-foreground",
]

export const ACTION_TOKENS = [
	"--primary",
	"--primary-foreground",
	"--secondary",
	"--secondary-foreground",
	"--accent",
	"--accent-foreground",
	"--muted",
	"--muted-foreground",
]

export const FEEDBACK_TOKENS = ["--destructive"]

export const CONTROL_TOKENS = ["--border", "--input", "--ring"]

export const SCROLLBAR_TOKENS = ["--scrollbar", "--scrollbar-hover"]

export const CHART_TOKENS = [
	"--chart-1",
	"--chart-2",
	"--chart-3",
	"--chart-4",
	"--chart-5",
]

export const SIDEBAR_TOKENS = [
	"--sidebar",
	"--sidebar-foreground",
	"--sidebar-primary",
	"--sidebar-primary-foreground",
	"--sidebar-accent",
	"--sidebar-accent-foreground",
	"--sidebar-border",
	"--sidebar-ring",
]

const ColorSwatch = ({ token }: { token: string }) => (
	<div className="flex items-center gap-3 rounded-lg border border-border bg-card p-2">
		<span
			aria-hidden="true"
			className="size-10 shrink-0 rounded-md border border-border"
			style={{ background: `var(${token})` }}
		/>
		<code className="min-w-0 truncate font-mono text-foreground text-xs">
			{token}
		</code>
	</div>
)

export const ColorTokenGrid = ({ tokens }: { tokens: string[] }) => (
	<div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2">
		{tokens.map((token) => (
			<ColorSwatch key={token} token={token} />
		))}
	</div>
)
