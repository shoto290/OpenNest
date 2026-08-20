import { THEME_CLASS_NAMES } from "@workspace/storybook/themed-docs-container"
import { type Palette, PALETTE_IDS, PALETTES } from "@workspace/ui/lib/palettes"

type PaletteCardProps = {
	palette: Palette
	scheme: string
	schemeClassName: string
}

const SWATCH_TOKENS = [
	"--primary",
	"--sidebar-primary",
	"--chart-3",
	"--chart-5",
	"--border",
]

const PaletteCard = ({
	palette,
	scheme,
	schemeClassName,
}: PaletteCardProps) => (
	<div
		className={`${schemeClassName} rounded-lg border border-border bg-background p-3`}
		data-theme={palette}
	>
		<p className="mb-2 font-medium text-foreground text-xs capitalize">
			{scheme}
		</p>
		<div className="mb-2 flex gap-1">
			{SWATCH_TOKENS.map((token) => (
				<span
					aria-hidden="true"
					className="h-8 flex-1 rounded-md border border-border"
					key={token}
					style={{ background: `var(${token})` }}
				/>
			))}
		</div>
		<p className="rounded-md bg-muted p-2 text-muted-foreground text-xs">
			Muted foreground on muted
		</p>
	</div>
)

export const PaletteMatrix = () => (
	<div className="flex flex-col gap-4">
		{PALETTE_IDS.map((palette) => (
			<div key={palette}>
				<p className="mb-2 font-medium text-foreground text-sm">
					{PALETTES[palette]}{" "}
					<code className="font-mono text-muted-foreground text-xs">
						data-theme="{palette}"
					</code>
				</p>
				<div className="grid grid-cols-2 gap-2">
					{Object.entries(THEME_CLASS_NAMES).map(([scheme, className]) => (
						<PaletteCard
							key={scheme}
							palette={palette}
							scheme={scheme}
							schemeClassName={className}
						/>
					))}
				</div>
			</div>
		))}
	</div>
)
