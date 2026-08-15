const TEXT_SIZES = [
	{ className: "text-xs", size: "0.75rem", lineHeight: "1rem" },
	{ className: "text-sm", size: "0.875rem", lineHeight: "1.25rem" },
	{ className: "text-base", size: "1rem", lineHeight: "1.5rem" },
	{ className: "text-lg", size: "1.125rem", lineHeight: "1.75rem" },
	{ className: "text-xl", size: "1.25rem", lineHeight: "1.75rem" },
	{ className: "text-2xl", size: "1.5rem", lineHeight: "2rem" },
	{ className: "text-3xl", size: "1.875rem", lineHeight: "2.25rem" },
	{ className: "text-4xl", size: "2.25rem", lineHeight: "2.5rem" },
]

const FONT_WEIGHTS = [
	{ className: "font-normal", value: "400" },
	{ className: "font-medium", value: "500" },
	{ className: "font-semibold", value: "600" },
	{ className: "font-bold", value: "700" },
]

const FONT_FAMILIES = [
	{ className: "font-sans", token: "--font-sans" },
	{ className: "font-heading", token: "--font-heading" },
]

const readFontStack = (token: string) =>
	getComputedStyle(document.documentElement).getPropertyValue(token).trim()

export const FontSample = () => (
	<div className="flex flex-col gap-2">
		{FONT_FAMILIES.map(({ className, token }) => (
			<div
				key={token}
				className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4"
			>
				<code className="font-mono text-muted-foreground text-xs">
					{token} — {readFontStack(token)}
				</code>
				<p className={`${className} text-2xl text-foreground`}>
					The quick brown fox jumps over the lazy dog — 0123456789
				</p>
			</div>
		))}
	</div>
)

export const TypeScale = () => (
	<div className="flex flex-col gap-2">
		{TEXT_SIZES.map(({ className, size, lineHeight }) => (
			<div
				key={className}
				className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg border border-border bg-card p-3"
			>
				<code className="w-24 shrink-0 font-mono text-muted-foreground text-xs">
					{className}
				</code>
				<code className="w-40 shrink-0 font-mono text-muted-foreground text-xs">
					{size} / {lineHeight}
				</code>
				<span className={`${className} text-foreground`}>OpenNest</span>
			</div>
		))}
	</div>
)

export const FontWeights = () => (
	<div className="flex flex-col gap-2">
		{FONT_WEIGHTS.map(({ className, value }) => (
			<div
				key={className}
				className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg border border-border bg-card p-3"
			>
				<code className="w-24 shrink-0 font-mono text-muted-foreground text-xs">
					{className}
				</code>
				<code className="w-40 shrink-0 font-mono text-muted-foreground text-xs">
					{value}
				</code>
				<span className={`${className} text-foreground text-lg`}>OpenNest</span>
			</div>
		))}
	</div>
)
