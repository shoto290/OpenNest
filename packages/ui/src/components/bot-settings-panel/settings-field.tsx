import { type ChangeEvent, useId } from "react"

import {
	FIELD_CONTROL_CLASS,
	FIELD_LABEL_CLASS,
} from "@workspace/ui/components/bot-settings-panel/styles"
import { cn } from "@workspace/ui/lib/utils"

type SettingsFieldProps = {
	label: string
	value: string
	onValueChange: (value: string) => void
	placeholder?: string
	/** Turns the control into a textarea of this many rows. */
	rows?: number
}

const SettingsField = ({
	label,
	value,
	onValueChange,
	placeholder,
	rows,
}: SettingsFieldProps) => {
	const id = useId()
	const emit = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
		onValueChange(event.target.value)

	return (
		<div className="flex flex-col gap-1.5">
			<label className={FIELD_LABEL_CLASS} htmlFor={id}>
				{label}
			</label>
			{rows ? (
				<textarea
					className={cn(FIELD_CONTROL_CLASS, "resize-none leading-relaxed")}
					id={id}
					onChange={emit}
					placeholder={placeholder}
					rows={rows}
					value={value}
				/>
			) : (
				<input
					className={FIELD_CONTROL_CLASS}
					id={id}
					onChange={emit}
					placeholder={placeholder}
					type="text"
					value={value}
				/>
			)}
		</div>
	)
}

export { SettingsField, type SettingsFieldProps }
