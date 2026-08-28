"use client"

import { type FormEvent, useId, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import {
	FIELD_CONTROL_CLASS,
	FIELD_CONTROL_INVALID_CLASS,
	FIELD_LABEL_CLASS,
} from "@workspace/ui/components/settings-styles"
import { cn } from "@workspace/ui/lib/utils"

type SettingsListFieldProps = {
	label: string
	items: string[]
	onItemsChange: (items: string[]) => void
	placeholder: string
	addLabel: string
	removeLabel: (item: string) => string
	emptyLabel: string
	hint?: string
	isItemValid?: (item: string) => boolean
	invalidMessage?: string
}

const SettingsListField = ({
	label,
	items,
	onItemsChange,
	placeholder,
	addLabel,
	removeLabel,
	emptyLabel,
	hint,
	isItemValid,
	invalidMessage,
}: SettingsListFieldProps) => {
	const id = useId()
	const [typed, setTyped] = useState("")
	const [isRefused, setRefused] = useState(false)
	const hintId = hint ? `${id}-hint` : undefined
	const errorId = isRefused ? `${id}-error` : undefined
	const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined

	const add = (event: FormEvent) => {
		event.preventDefault()
		const item = typed.trim()

		if (item.length === 0) return

		if (isItemValid && !isItemValid(item)) {
			setRefused(true)
			return
		}

		setRefused(false)
		setTyped("")

		if (!items.includes(item)) {
			onItemsChange([...items, item])
		}
	}

	const answer = (value: string) => {
		setTyped(value)
		setRefused(false)
	}

	return (
		<div className="flex shrink-0 flex-col gap-1.5">
			<label className={FIELD_LABEL_CLASS} htmlFor={id}>
				{label}
			</label>
			<form className="flex items-center gap-2" onSubmit={add}>
				<input
					aria-describedby={describedBy}
					aria-invalid={isRefused ? true : undefined}
					className={cn(
						FIELD_CONTROL_CLASS,
						isRefused && FIELD_CONTROL_INVALID_CLASS,
						"min-w-0 flex-1 font-mono text-xs",
					)}
					id={id}
					onChange={(event) => answer(event.target.value)}
					placeholder={placeholder}
					type="text"
					value={typed}
				/>
				<Button size="sm" type="submit" variant="outline">
					<Icons.Add aria-hidden="true" className="size-3.5" />
					{addLabel}
				</Button>
			</form>
			{hint ? (
				<p className="text-muted-foreground text-xs" id={hintId}>
					{hint}
				</p>
			) : null}
			{isRefused && invalidMessage ? (
				<p className="text-destructive text-xs" id={errorId} role="alert">
					{invalidMessage}
				</p>
			) : null}
			{items.length === 0 ? (
				<p className="text-muted-foreground text-xs">{emptyLabel}</p>
			) : (
				<ul className="flex list-none flex-col gap-1 p-0">
					{items.map((item) => (
						<li
							className="flex items-center gap-2 rounded-xl border border-border py-1 pr-1 pl-3"
							key={item}
						>
							<span className="min-w-0 flex-1 truncate font-mono text-foreground text-xs">
								{item}
							</span>
							<Button
								aria-label={removeLabel(item)}
								onClick={() =>
									onItemsChange(items.filter((held) => held !== item))
								}
								size="icon-xs"
								variant="ghost"
							>
								<Icons.Close aria-hidden="true" className="size-3.5" />
							</Button>
						</li>
					))}
				</ul>
			)}
		</div>
	)
}

export { SettingsListField, type SettingsListFieldProps }
