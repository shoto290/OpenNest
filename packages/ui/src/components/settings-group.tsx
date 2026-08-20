import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

type SettingsGroupProps = {
	/** What the whole set of controls is called. A legend rather than a heading, so
	 * the name is announced with every option a reader lands on. */
	label: string
	/** Grid shape of the options — a row of swatches packs tighter than a row of
	 * named tiles. */
	grid: string
	children: ReactNode
	className?: string
}

/**
 * One named set of choices inside a settings surface: a legend, then the options
 * laid on the grid the caller asks for. Every group in every settings dialog is
 * this one, so the label of a set of animals and the label of a set of palettes
 * cannot drift apart.
 */
const SettingsGroup = ({
	label,
	grid,
	children,
	className,
}: SettingsGroupProps) => (
	<fieldset className={cn("min-w-0 border-0 p-0", className)}>
		<legend className="mb-2 font-medium text-muted-foreground text-xs">
			{label}
		</legend>
		<div className={cn("grid", grid)}>{children}</div>
	</fieldset>
)

export { SettingsGroup, type SettingsGroupProps }
