import { Icons } from "@workspace/ui/components/icons"

const ICON_ENTRIES = Object.entries(Icons)

export const IconCount = () => <>{ICON_ENTRIES.length}</>

export const IconGrid = () => (
	<div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2">
		{ICON_ENTRIES.map(([name, IconComponent]) => (
			<div
				key={name}
				className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-3"
			>
				<IconComponent aria-hidden="true" className="size-5 text-foreground" />
				<code className="max-w-full truncate font-mono text-muted-foreground text-xs">
					{name}
				</code>
			</div>
		))}
	</div>
)
