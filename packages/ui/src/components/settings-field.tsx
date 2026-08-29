import { type ChangeEvent, useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { type Icon, Icons } from "@workspace/ui/components/icons"
import {
	FIELD_CONTROL_CLASS,
	FIELD_CONTROL_INVALID_CLASS,
	FIELD_CONTROL_READONLY_CLASS,
	FIELD_LABEL_CLASS,
} from "@workspace/ui/components/settings-styles"
import { cn } from "@workspace/ui/lib/utils"

type SettingsFieldProps = {
	label: string
	value: string
	onValueChange?: (value: string) => void
	placeholder?: string
	hint?: string
	error?: string
	icon?: Icon
	rows?: number
	fill?: boolean
	readOnly?: boolean
	masked?: boolean
}

const SettingsField = ({
	label,
	value,
	onValueChange,
	placeholder,
	hint,
	error,
	icon: Glyph,
	rows,
	fill = false,
	readOnly = false,
	masked = false,
}: SettingsFieldProps) => {
	const { t } = useTranslation("common")
	const id = useId()
	const [isRevealed, setRevealed] = useState(false)
	const hintId = hint ? `${id}-hint` : undefined
	const errorId = error ? `${id}-error` : undefined
	const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined
	const emit = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
		onValueChange?.(event.target.value)

	return (
		<div className={cn("flex flex-col gap-1.5", fill && "min-h-0 flex-1")}>
			<label className={FIELD_LABEL_CLASS} htmlFor={id}>
				{label}
			</label>
			{rows || fill ? (
				<textarea
					aria-describedby={describedBy}
					aria-invalid={error ? true : undefined}
					className={cn(
						FIELD_CONTROL_CLASS,
						error && FIELD_CONTROL_INVALID_CLASS,
						readOnly && FIELD_CONTROL_READONLY_CLASS,
						"resize-none leading-relaxed",
						fill && "min-h-0 flex-1",
					)}
					id={id}
					onChange={emit}
					placeholder={placeholder}
					readOnly={readOnly}
					rows={rows}
					value={value}
				/>
			) : (
				<div className="relative">
					{Glyph ? (
						<Glyph
							aria-hidden="true"
							className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
						/>
					) : null}
					<input
						aria-describedby={describedBy}
						aria-invalid={error ? true : undefined}
						className={cn(
							FIELD_CONTROL_CLASS,
							error && FIELD_CONTROL_INVALID_CLASS,
							readOnly && FIELD_CONTROL_READONLY_CLASS,
							Glyph && "pl-9",
							masked && "pr-10",
						)}
						id={id}
						onChange={emit}
						placeholder={placeholder}
						readOnly={readOnly}
						type={masked && !isRevealed ? "password" : "text"}
						value={value}
					/>
					{masked ? (
						<Button
							aria-label={t(isRevealed ? "field.conceal" : "field.reveal", {
								label,
							})}
							className="-translate-y-1/2 absolute top-1/2 right-1.5"
							onClick={() => setRevealed(!isRevealed)}
							size="icon-xs"
							variant="ghost"
						>
							{isRevealed ? (
								<Icons.Conceal aria-hidden="true" />
							) : (
								<Icons.Reveal aria-hidden="true" />
							)}
						</Button>
					) : null}
				</div>
			)}
			{hint ? (
				<p className="text-muted-foreground text-xs" id={hintId}>
					{hint}
				</p>
			) : null}
			{error ? (
				<p className="text-destructive text-xs" id={errorId}>
					{error}
				</p>
			) : null}
		</div>
	)
}

export { SettingsField, type SettingsFieldProps }
