"use client"

import { Switch as BaseSwitch } from "@base-ui/react/switch"

import { cn } from "@workspace/ui/lib/utils"

type SwitchProps = {
	checked: boolean
	onCheckedChange: (checked: boolean) => void
	id?: string
	"aria-describedby"?: string
	"aria-label"?: string
	disabled?: boolean
	className?: string
}

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
