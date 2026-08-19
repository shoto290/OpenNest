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
	/** Turns the control into a textarea that takes the height its container has
	 * left, for a field that is the whole of what a surface shows. */
	fill?: boolean
}

const SettingsField = ({
	label,
	value,
	onValueChange,
	placeholder,
	rows,
	fill = false,
}: SettingsFieldProps) => {
	const id = useId()
	const emit = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
		onValueChange(event.target.value)

	return (
		<div className={cn("flex flex-col gap-1.5", fill && "min-h-0 flex-1")}>
			<label className={FIELD_LABEL_CLASS} htmlFor={id}>
				{label}
			</label>
			{rows || fill ? (
				<textarea
					className={cn(
						FIELD_CONTROL_CLASS,
						"resize-none leading-relaxed",
						fill && "min-h-0 flex-1",
					)}
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
