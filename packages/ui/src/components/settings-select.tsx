"use client"

import { Select } from "@base-ui/react/select"
import { useId } from "react"

import { Icons } from "@workspace/ui/components/icons"
import {
	FIELD_CONTROL_CLASS,
	FIELD_LABEL_CLASS,
	POPUP_CLASS,
} from "@workspace/ui/components/settings-styles"
import { cn } from "@workspace/ui/lib/utils"

type SettingsSelectOption = {
	label: string
	value: string
}

type SettingsSelectProps = {
	label: string
	value: string
	onValueChange: (value: string) => void
	options: SettingsSelectOption[]
	placeholder?: string
	hint?: string
}

const SettingsSelect = ({
	label,
	value,
	onValueChange,
	options,
	placeholder,
	hint,
}: SettingsSelectProps) => {
	const id = useId()
	const hintId = hint ? `${id}-hint` : undefined

	return (
		<div className="flex shrink-0 flex-col gap-1.5">
			<Select.Root
				items={options}
				onValueChange={(next: string | null) => onValueChange(next ?? "")}
				value={value}
			>
				<Select.Label className={FIELD_LABEL_CLASS}>{label}</Select.Label>
				<Select.Trigger
					aria-describedby={hintId}
					className={cn(
						FIELD_CONTROL_CLASS,
						"flex items-center justify-between gap-2 pr-2.5 text-left hover:bg-muted",
					)}
				>
					<Select.Value
						className="min-w-0 truncate data-placeholder:text-muted-foreground"
						placeholder={placeholder}
					/>
					<Select.Icon className="shrink-0 text-muted-foreground">
						<Icons.Expand className="size-4" />
					</Select.Icon>
				</Select.Trigger>
				<Select.Portal>
					<Select.Positioner
						alignItemWithTrigger={false}
						className="z-50 outline-none"
						sideOffset={6}
					>
						<Select.Popup
							className={cn(
								POPUP_CLASS,
								"max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) overflow-y-auto rounded-xl p-1",
							)}
						>
							<Select.List>
								{options.map((option) => (
									<Select.Item
										className="grid cursor-pointer grid-cols-[1rem_1fr] items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-muted"
										key={option.value}
										value={option.value}
									>
										<Select.ItemIndicator className="col-start-1">
											<Icons.Check className="size-3.5" />
										</Select.ItemIndicator>
										<Select.ItemText className="col-start-2 truncate">
											{option.label}
										</Select.ItemText>
									</Select.Item>
								))}
							</Select.List>
						</Select.Popup>
					</Select.Positioner>
				</Select.Portal>
			</Select.Root>
			{hint ? (
				<p className="text-muted-foreground text-xs" id={hintId}>
					{hint}
				</p>
			) : null}
		</div>
	)
}

export { SettingsSelect, type SettingsSelectOption, type SettingsSelectProps }
