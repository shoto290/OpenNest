"use client"

import { useId } from "react"

import { FIELD_LABEL_CLASS } from "@workspace/ui/components/settings-styles"
import { Switch } from "@workspace/ui/components/switch"

type SettingsSwitchProps = {
	label: string
	/** What turning it on does, and what it leaves alone. Under the label rather
	 * than beside it, and announced after it: a switch whose consequence needs a
	 * sentence is one nobody should have to guess at. */
	description: string
	checked: boolean
	onCheckedChange: (checked: boolean) => void
}

/**
 * One setting a reader turns on or off, with the sentence that says what it costs.
 * The row a settings surface uses wherever a `SettingsField` would be the wrong
 * shape — nothing is typed, so there is no control to label, only a state to read.
 *
 * The whole row is a panel so the sentence stays attached to the switch it explains,
 * and the label owns the control, so pressing the words is pressing the switch.
 */
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
