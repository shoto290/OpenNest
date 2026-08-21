"use client"

import { Switch as BaseSwitch } from "@base-ui/react/switch"

import { cn } from "@workspace/ui/lib/utils"

type SwitchProps = {
	checked: boolean
	onCheckedChange: (checked: boolean) => void
	/** What a visible `label` points at, so the words beside the track are part of
	 * the same target. */
	id?: string
	/** The sentence that says what turning it on costs. Announced after the name
	 * rather than in place of it. */
	"aria-describedby"?: string
	"aria-label"?: string
	disabled?: boolean
	className?: string
}

/**
 * One binary setting, on or off, written the moment it is pressed. A switch rather
 * than a checkbox: nothing here is submitted later, so the control has to read as
 * the state itself and not as a choice waiting on a save.
 *
 * It renders a button, so a visible `label` may own it through `htmlFor`, and it
 * keeps no state — the surface holds the value and this only reports the press. The
 * thumb slides, unless the reader asked for no motion, in which case it lands.
 */
const Switch = ({
	checked,
	onCheckedChange,
	id,
	disabled,
	className,
	...labelling
}: SwitchProps) => (
	<BaseSwitch.Root
		{...labelling}
		checked={checked}
		className={cn(
			"inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-muted p-0.5 outline-none transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/30 data-checked:bg-primary data-disabled:cursor-not-allowed data-disabled:opacity-50 motion-reduce:transition-none",
			className,
		)}
		disabled={disabled}
		id={id}
		onCheckedChange={onCheckedChange}
	>
		<BaseSwitch.Thumb className="size-4 rounded-full bg-background shadow-sm transition-transform duration-150 data-checked:translate-x-4 motion-reduce:transition-none" />
	</BaseSwitch.Root>
)

export { Switch, type SwitchProps }
