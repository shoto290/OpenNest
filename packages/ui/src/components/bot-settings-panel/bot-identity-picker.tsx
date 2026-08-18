"use client"

import { Popover } from "@base-ui/react/popover"
import { Tabs } from "@base-ui/react/tabs"
import {
	type ChangeEvent,
	type ClipboardEvent,
	type DragEvent,
	type ReactNode,
	useId,
	useRef,
	useState,
} from "react"

import { BotAvatar } from "@workspace/ui/components/bot-avatar"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { POPUP_CLASS } from "@workspace/ui/components/bot-settings-panel/styles"
import {
	BOT_IDENTITY_ANIMALS,
	BOT_IDENTITY_POSES,
	type BotIdentity,
	titleCase,
} from "@workspace/ui/components/bot-settings-panel/types"
import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

const PREVIEW_SIZE = 96
const ANIMAL_SIZE = 40
const POSE_SIZE = 28

const TAB_CLASS =
	"relative z-10 flex h-7 flex-1 items-center justify-center rounded-lg text-muted-foreground text-sm outline-none transition-colors select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-active:text-foreground motion-reduce:transition-none"

const OPTION_CLASS =
	"flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-transparent p-1.5 transition-colors hover:bg-muted has-[:checked]:border-primary/40 has-[:checked]:bg-primary/10 has-[:checked]:ring-2 has-[:checked]:ring-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring motion-reduce:transition-none"

/** The whole zone is the control: a reader who has a file already drops or pastes
 * it, and one who does not presses the same target to go looking for it. A button
 * rather than a div with a handler, so Enter and Space open the picker for free and
 * the target is a tab stop paste can land in. */
const DROPZONE_CLASS =
	"flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border border-border border-dashed p-6 text-center outline-none transition-colors hover:border-primary/50 hover:bg-muted focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/30 motion-reduce:transition-none"

const POSE_OPTION_CLASS = cn(OPTION_CLASS, "p-1")

type PickerGroupProps = {
	label: string
	/** Grid shape of the options — the poses pack tighter than the animals. */
	className: string
	children: ReactNode
}

const PickerGroup = ({ label, className, children }: PickerGroupProps) => (
	<fieldset className="min-w-0 border-0 p-0">
		<legend className="mb-2 font-medium text-muted-foreground text-xs">
			{label}
		</legend>
		<div className={cn("grid", className)}>{children}</div>
	</fieldset>
)

type BotIdentityPickerProps = {
	identity: BotIdentity
	working: boolean
	onIdentityChange: (identity: BotIdentity) => void
	onAvatarUpload: (file: File) => void
}

const BotIdentityPicker = ({
	identity,
	working,
	onIdentityChange,
	onAvatarUpload,
}: BotIdentityPickerProps) => {
	const groupId = useId()
	const fileRef = useRef<HTMLInputElement>(null)
	const [dragging, setDragging] = useState(false)

	const currentLabel = identity.image
		? "Uploaded image"
		: `${titleCase(identity.animal)}, ${titleCase(identity.pose)}`

	const emitFile = (file: File | undefined) => {
		if (file) onAvatarUpload(file)
	}

	const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
		event.preventDefault()
		setDragging(false)
		emitFile(event.dataTransfer.files[0])
	}

	const handlePaste = (event: ClipboardEvent<HTMLButtonElement>) =>
		emitFile(event.clipboardData.files[0])

	// Clearing the input lets the same file be picked twice in a row.
	const handleBrowsed = (event: ChangeEvent<HTMLInputElement>) => {
		emitFile(event.target.files?.[0])
		event.target.value = ""
	}

	return (
		<div className="flex flex-col items-center">
			<Popover.Root>
				<Popover.Trigger
					aria-label={`Change avatar. Current: ${currentLabel}.`}
					className="group relative rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
				>
					<BotIdentityAvatar
						animal={identity.animal}
						image={identity.image}
						pose={identity.pose}
						size={PREVIEW_SIZE}
						working={working}
					/>
					<span
						aria-hidden="true"
						className="absolute inset-0 flex items-center justify-center rounded-full bg-foreground/45 text-background opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
					>
						<Icons.Edit className="size-5" />
					</span>
				</Popover.Trigger>

				<Popover.Portal>
					<Popover.Positioner className="z-50 outline-none" sideOffset={10}>
						<Popover.Popup
							className={cn(
								POPUP_CLASS,
								"w-84 origin-(--transform-origin) rounded-2xl p-3",
							)}
						>
							<div className="flex items-baseline justify-between gap-2 px-1 pb-2">
								<Popover.Title className="font-medium text-sm">
									Avatar
								</Popover.Title>
								<p
									className="truncate text-muted-foreground text-xs"
									role="status"
								>
									{currentLabel}
								</p>
							</div>

							<Tabs.Root defaultValue="bot">
								<Tabs.List className="relative mb-3 flex gap-1 rounded-xl border border-border p-1">
									<Tabs.Tab className={TAB_CLASS} value="bot">
										Bot
									</Tabs.Tab>
									<Tabs.Tab className={TAB_CLASS} value="upload">
										Upload
									</Tabs.Tab>
									<Tabs.Indicator className="absolute top-1 left-0 h-[calc(100%-0.5rem)] w-(--active-tab-width) translate-x-(--active-tab-left) rounded-lg bg-muted transition-[translate,width] duration-200 ease-out motion-reduce:transition-none" />
								</Tabs.List>

								<Tabs.Panel
									className="flex flex-col gap-3 outline-none"
									value="bot"
								>
									<PickerGroup className="grid-cols-4 gap-1.5" label="Animal">
										{BOT_IDENTITY_ANIMALS.map((animal) => (
											<label className={OPTION_CLASS} key={animal}>
												<input
													checked={identity.animal === animal}
													className="sr-only"
													name={`${groupId}-animal`}
													onChange={() =>
														onIdentityChange({ animal, pose: identity.pose })
													}
													type="radio"
													value={animal}
												/>
												<span aria-hidden="true">
													<BotAvatar
														animal={animal}
														animated={false}
														size={ANIMAL_SIZE}
														state={identity.pose}
													/>
												</span>
												<span className="w-full truncate text-center text-[11px] text-muted-foreground">
													{titleCase(animal)}
												</span>
											</label>
										))}
									</PickerGroup>

									<PickerGroup className="grid-cols-8 gap-1" label="Pose">
										{BOT_IDENTITY_POSES.map((pose) => (
											<label
												className={POSE_OPTION_CLASS}
												key={pose}
												title={titleCase(pose)}
											>
												<input
													checked={identity.pose === pose}
													className="sr-only"
													name={`${groupId}-pose`}
													onChange={() =>
														onIdentityChange({
															animal: identity.animal,
															pose,
														})
													}
													type="radio"
													value={pose}
												/>
												<span aria-hidden="true">
													<BotAvatar
														animal={identity.animal}
														animated={false}
														size={POSE_SIZE}
														state={pose}
													/>
												</span>
												<span className="sr-only">{titleCase(pose)}</span>
											</label>
										))}
									</PickerGroup>
								</Tabs.Panel>

								<Tabs.Panel className="outline-none" value="upload">
									<button
										className={cn(
											DROPZONE_CLASS,
											dragging && "border-primary bg-primary/10",
										)}
										onClick={() => fileRef.current?.click()}
										onDragLeave={() => setDragging(false)}
										onDragOver={(event) => {
											event.preventDefault()
											setDragging(true)
										}}
										onDrop={handleDrop}
										onPaste={handlePaste}
										type="button"
									>
										<Icons.Image
											aria-hidden="true"
											className="size-5 text-muted-foreground"
										/>
										<span className="block text-foreground text-sm">
											Drag, drop or paste an image
										</span>
										<span className="block text-muted-foreground text-xs">
											or click to choose a file
										</span>
									</button>
									{/* Outside the control it belongs to: a button may not hold an
									input, and this one is only ever opened by that button. */}
									<input
										accept="image/*"
										aria-label="Avatar image file"
										className="hidden"
										onChange={handleBrowsed}
										ref={fileRef}
										type="file"
									/>
								</Tabs.Panel>
							</Tabs.Root>
						</Popover.Popup>
					</Popover.Positioner>
				</Popover.Portal>
			</Popover.Root>
		</div>
	)
}

export { BotIdentityPicker, type BotIdentityPickerProps }
