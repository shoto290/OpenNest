const SPACING_STEPS = [
	0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8, 10, 12, 16, 20, 24,
]

const remFor = (step: number) => `${step * 0.25}rem`

export const SpacingScale = () => (
	<div className="flex flex-col gap-1">
		{SPACING_STEPS.map((step) => (
			<div
				key={step}
				className="flex items-center gap-4 rounded-lg border border-border bg-card p-2"
			>
				<code className="w-20 shrink-0 font-mono text-muted-foreground text-xs">
					{step}
				</code>
				<code className="w-24 shrink-0 font-mono text-muted-foreground text-xs">
					{remFor(step)}
				</code>
				<span
					aria-hidden="true"
					className="h-3 rounded-sm bg-accent"
					style={{ width: `calc(var(--spacing) * ${step})` }}
				/>
			</div>
		))}
	</div>
)
