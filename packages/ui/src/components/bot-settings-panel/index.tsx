"use client"

import { AlertDialog } from "@base-ui/react/alert-dialog"
import { Select } from "@base-ui/react/select"
import { useId, useState } from "react"

import type { BotWorkingKind } from "@workspace/ui/components/bot-identity-avatar"
import { BotIdentityPicker } from "@workspace/ui/components/bot-settings-panel/bot-identity-picker"
import { SettingsField } from "@workspace/ui/components/bot-settings-panel/settings-field"
import {
	FIELD_CONTROL_CLASS,
	FIELD_LABEL_CLASS,
	POPUP_CLASS,
} from "@workspace/ui/components/bot-settings-panel/styles"
import type {
	BotIdentity,
	BotModelOption,
	BotSettingsValue,
} from "@workspace/ui/components/bot-settings-panel/types"
import { buttonVariants } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

type BotSettingsPanelProps = {
	value: BotSettingsValue
	/** Fired on every edit — the panel keeps no draft and owns no persistence. */
	onValueChange: (value: BotSettingsValue) => void
	models: BotModelOption[]
	/** Receives the picked, dropped or pasted file. The host turns it into a URL
	 * and writes it back as `value.identity.image`. */
	onAvatarUpload: (file: File) => void
	/** Opens the host's folder picker. */
	onBrowseWorkingDirectory: () => void
	/** Fired only once the confirmation is accepted. */
	onDelete: () => void
	/** Whether the delete confirmation stands. Controlled, so a host with another way
	 * to ask — a row's context menu, a shortcut — lands on this one dialog instead of
	 * building a second one. Leave it out and the panel's own button owns it. */
	confirmingDelete?: boolean
	onConfirmingDeleteChange?: (confirming: boolean) => void
	/** The only thing that makes the avatar move: the animal animates in its
	 * working pose, an uploaded picture lights its activity dot. A bot at rest
	 * holds a single idle frame. */
	working?: boolean
	/** What the bot is busy with while `working`. Its own animal performs it, which is
	 * what keeps this avatar and the roster's showing the same bot doing the same
	 * thing. */
	workingKind?: BotWorkingKind
	/** Accessible name of the panel landmark, and the heading it shows. Two
	 * panels on one screen need distinct ones. */
	label?: string
	/** Puts the panel away. It has no closed state of its own — a host mounts it
	 * while the reader is in it and unmounts it after, which is what leaves the
	 * column beside it the whole width. */
	onClose: () => void
	className?: string
}

const BotSettingsPanel = ({
	value,
	onValueChange,
	models,
	onAvatarUpload,
	onBrowseWorkingDirectory,
	onDelete,
	confirmingDelete,
	onConfirmingDeleteChange,
	working = false,
	workingKind,
	label = "Bot settings",
	onClose,
	className,
}: BotSettingsPanelProps) => {
	const [internalConfirming, setInternalConfirming] = useState(false)
	const directoryId = useId()
	const isConfirming = confirmingDelete ?? internalConfirming

	const patch = (fields: Partial<BotSettingsValue>) =>
		onValueChange({ ...value, ...fields })

	const setConfirming = (next: boolean) => {
		if (confirmingDelete === undefined) setInternalConfirming(next)
		onConfirmingDeleteChange?.(next)
	}

	return (
		<aside
			aria-label={label}
			className={cn(
				"flex h-full w-80 shrink-0 flex-col overflow-hidden border-sidebar-border border-l bg-sidebar text-sidebar-foreground",
				className,
			)}
			data-slot="bot-settings-panel"
		>
			<header className="flex h-12 shrink-0 items-center gap-1 border-sidebar-border border-b px-3">
				{/* One live region for the whole column, here rather than on the avatar:
					the same avatar is drawn in a dozen roster rows at once, and a live
					region inside it would announce a dozen times over. */}
				<span className="sr-only" role="status">
					{`${value.name.trim() || "This bot"} is ${working ? "working" : "idle"}`}
				</span>
				<h2 className="min-w-0 flex-1 truncate font-medium text-sm">{label}</h2>
				<button
					aria-label={`Close ${label}`}
					className={cn(
						buttonVariants({ variant: "ghost", size: "icon-sm" }),
						"text-muted-foreground hover:text-foreground",
					)}
					onClick={onClose}
					type="button"
				>
					<Icons.Close />
				</button>
			</header>

			{/* The one scroll boundary in the column: the fields take the height the
			panel has left and scroll inside it, which is what keeps the delete action
			at the bottom edge when there is room and lets it leave with the content
			when there is not. */}
			<div
				className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-5"
				data-slot="bot-settings-fields"
			>
				<BotIdentityPicker
					identity={value.identity}
					onAvatarUpload={onAvatarUpload}
					onIdentityChange={(identity) => patch({ identity })}
					working={working}
					workingKind={workingKind}
				/>

				<div className="flex flex-col gap-4">
					<SettingsField
						label="Name"
						onValueChange={(name) => patch({ name })}
						placeholder="No name"
						value={value.name}
					/>
					<SettingsField
						label="Title"
						onValueChange={(title) => patch({ title })}
						placeholder="Short role label"
						value={value.title}
					/>
					<SettingsField
						label="Instructions"
						onValueChange={(instructions) => patch({ instructions })}
						placeholder="The system prompt this bot always runs with"
						rows={8}
						value={value.instructions}
					/>
				</div>

				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1.5">
						<Select.Root
							items={models}
							onValueChange={(model: string | null) =>
								patch({ model: model ?? "" })
							}
							value={value.model}
						>
							<Select.Label className={FIELD_LABEL_CLASS}>Model</Select.Label>
							<Select.Trigger
								className={cn(
									FIELD_CONTROL_CLASS,
									"flex items-center justify-between gap-2 text-left hover:bg-muted",
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
											{models.map((model) => (
												<Select.Item
													className="grid cursor-pointer grid-cols-[1rem_1fr] items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-muted"
													key={model.value}
													value={model.value}
												>
													<Select.ItemIndicator className="col-start-1">
														<Icons.Check className="size-3.5" />
													</Select.ItemIndicator>
													<Select.ItemText className="col-start-2 truncate">
														{model.label}
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
								"flex items-center gap-2 text-left hover:bg-muted",
							)}
							id={directoryId}
							onClick={onBrowseWorkingDirectory}
							title={value.workingDirectory || undefined}
							type="button"
						>
							<Icons.Folder
								aria-hidden="true"
								className="size-4 shrink-0 text-muted-foreground"
							/>
							<span
								className={cn(
									"min-w-0 flex-1 truncate",
									!value.workingDirectory && "text-muted-foreground",
								)}
							>
								{value.workingDirectory || "Choose a folder"}
							</span>
							<span className="shrink-0 text-muted-foreground text-xs">
								Change
							</span>
						</button>
					</div>
				</div>

				<div className="mt-auto border-sidebar-border border-t pt-4">
					<AlertDialog.Root onOpenChange={setConfirming} open={isConfirming}>
						<AlertDialog.Trigger
							className={cn(
								buttonVariants({ variant: "destructive", size: "sm" }),
								"w-full",
							)}
						>
							<Icons.Delete aria-hidden="true" className="size-3.5" />
							Delete bot
						</AlertDialog.Trigger>
						<AlertDialog.Portal>
							<AlertDialog.Backdrop className="fixed inset-0 z-50 bg-foreground/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
							<AlertDialog.Popup
								className={cn(
									POPUP_CLASS,
									"-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 flex w-88 max-w-[calc(100vw-3rem)] flex-col gap-4 rounded-2xl p-5",
								)}
							>
								<div className="flex flex-col gap-1">
									<AlertDialog.Title className="font-medium text-base">
										Delete {value.name.trim() || "this bot"}?
									</AlertDialog.Title>
									<AlertDialog.Description className="text-muted-foreground text-sm">
										Its avatar, instructions and working directory go with it.
										This cannot be undone.
									</AlertDialog.Description>
								</div>
								<div className="flex justify-end gap-2">
									<AlertDialog.Close
										className={buttonVariants({
											variant: "outline",
											size: "sm",
										})}
									>
										Cancel
									</AlertDialog.Close>
									<AlertDialog.Close
										className={buttonVariants({
											variant: "destructive",
											size: "sm",
										})}
										onClick={onDelete}
									>
										Delete bot
									</AlertDialog.Close>
								</div>
							</AlertDialog.Popup>
						</AlertDialog.Portal>
					</AlertDialog.Root>
				</div>
			</div>
		</aside>
	)
}

export {
	type BotIdentity,
	type BotModelOption,
	BotSettingsPanel,
	type BotSettingsPanelProps,
	type BotSettingsValue,
}
