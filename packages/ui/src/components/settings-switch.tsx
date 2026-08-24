"use client"

import { useId } from "react"

import { FIELD_LABEL_CLASS } from "@workspace/ui/components/settings-styles"
import { Switch } from "@workspace/ui/components/switch"

type SettingsSwitchProps = {
	label: string
	description: string
	checked: boolean
	onCheckedChange: (checked: boolean) => void
}

const SettingsSwitch = ({
	label,
	description,
	checked,
	onCheckedChange,
}: SettingsSwitchProps) => {
	const id = useId()
	const descriptionId = `${id}-description`

	return (
		<div className="flex shrink-0 items-start justify-between gap-4 rounded-xl border border-border bg-muted/40 p-3">
			<div className="flex min-w-0 flex-col gap-1">
				<label className={FIELD_LABEL_CLASS} htmlFor={id}>
					{label}
				</label>
				<p
					className="text-muted-foreground text-xs leading-relaxed"
					id={descriptionId}
				>
					{description}
				</p>
			</div>
			<Switch
				aria-describedby={descriptionId}
				checked={checked}
				id={id}
				onCheckedChange={onCheckedChange}
			/>
		</div>
	)
}

export { SettingsSwitch, type SettingsSwitchProps }
