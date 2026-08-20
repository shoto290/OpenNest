"use client"

import { Select } from "@base-ui/react/select"
import { useId } from "react"

import type { BotModelOption } from "@workspace/ui/components/bot-settings"
import { Icons } from "@workspace/ui/components/icons"
import {
	FIELD_CONTROL_CLASS,
	FIELD_LABEL_CLASS,
	POPUP_CLASS,
} from "@workspace/ui/components/settings-styles"
import { cn } from "@workspace/ui/lib/utils"

type RuntimeFieldsProps = {
	models: BotModelOption[]
	model: string
	onModelChange: (model: string) => void
	workingDirectory: string
	onBrowseWorkingDirectory: () => void
}

/** What the bot runs on: the model behind it and the folder it works in. Both are
 * pickers rather than text — neither is something a reader can type correctly. */
const RuntimeFields = ({
	models,
	model,
	onModelChange,
	workingDirectory,
	onBrowseWorkingDirectory,
}: RuntimeFieldsProps) => {
	const directoryId = useId()

	return (
		<>
			<div className="flex flex-col gap-1.5">
				<Select.Root
					items={models}
					onValueChange={(next: string | null) => onModelChange(next ?? "")}
					value={model}
				>
					<Select.Label className={FIELD_LABEL_CLASS}>Model</Select.Label>
					<Select.Trigger
						className={cn(
							FIELD_CONTROL_CLASS,
							"flex items-center justify-between gap-2 pr-2.5 text-left hover:bg-muted",
						)}
					>
						<Select.Value
							className="min-w-0 truncate data-placeholder:text-muted-foreground"
							placeholder="Choose a model"
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
									{models.map((option) => (
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
			</div>

			<div className="flex flex-col gap-1.5">
				<span className={FIELD_LABEL_CLASS} id={`${directoryId}-label`}>
					Working directory
				</span>
				<button
					aria-labelledby={`${directoryId}-label ${directoryId}`}
					className={cn(
						FIELD_CONTROL_CLASS,
						"flex items-center gap-2 pl-2.5 text-left hover:bg-muted",
					)}
					id={directoryId}
					onClick={onBrowseWorkingDirectory}
					title={workingDirectory || undefined}
					type="button"
				>
					<Icons.Folder
						aria-hidden="true"
						className="size-4 shrink-0 text-muted-foreground"
					/>
					<span
						className={cn(
							"min-w-0 flex-1 truncate",
							!workingDirectory && "text-muted-foreground",
						)}
					>
						{workingDirectory || "Choose a folder"}
					</span>
					<span className="shrink-0 text-muted-foreground text-xs">Change</span>
				</button>
			</div>
		</>
	)
}

export { RuntimeFields, type RuntimeFieldsProps }
