"use client"

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
import {
	BotIdentityAvatar,
	type BotWorkingKind,
} from "@workspace/ui/components/bot-identity-avatar"
import {
	BLOT_TINTS,
	BOT_IDENTITY_ANIMALS,
	type BotAvatarBlot,
	type BotIdentity,
	titleCase,
} from "@workspace/ui/components/bot-settings"
import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

const PREVIEW_SIZE = 96
const ANIMAL_SIZE = 40
const BLOT_SIZE = 24

/** The eight tints and the option that takes the blot off, as one radio group. */
const BLOT_OPTIONS = [...BLOT_TINTS, undefined] as const

const blotLabel = (blot?: BotAvatarBlot) => (blot ? titleCase(blot) : "No blot")

/** The chosen option is the filled tile, the way a selected row in the system's
 * select is: one neutral surface and a name that stops being muted. No outline
 * around it — a ring on a round swatch reads as a second, competing edge, and a
 * tint would fight the eight tints the swatches are there to show. */
const OPTION_CLASS =
	"flex cursor-pointer flex-col items-center gap-1 rounded-xl p-1.5 text-muted-foreground transition-colors hover:bg-muted has-[:checked]:bg-muted has-[:checked]:font-medium has-[:checked]:text-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring motion-reduce:transition-none"

const BLOT_OPTION_CLASS = cn(OPTION_CLASS, "p-1")

/** The whole zone is the control: a reader who has a file already drops or pastes
 * it, and one who does not presses the same target to go looking for it. A button
 * rather than a div with a handler, so Enter and Space open the picker for free and
 * the target is a tab stop paste can land in. */
const DROPZONE_CLASS =
	"flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border border-border border-dashed p-6 text-center outline-none transition-colors hover:border-primary/50 hover:bg-muted focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/30 motion-reduce:transition-none"

type IdentityGroupProps = {
	label: string
	/** Grid shape of the options — the blots pack tighter than the animals. */
	grid: string
	children: ReactNode
}

const IdentityGroup = ({ label, grid, children }: IdentityGroupProps) => (
	<fieldset className="min-w-0 border-0 p-0">
		<legend className="mb-2 font-medium text-muted-foreground text-xs">
			{label}
		</legend>
		<div className={cn("grid", grid)}>{children}</div>
	</fieldset>
)

type BotIdentityFieldsProps = {
	identity: BotIdentity
	/** The edited bot's id, so every avatar in here wears the blot shape that bot
	 * will actually wear — the preview and the swatches alike. */
	seed?: string
	/** The only thing that makes the preview move. The choices always rest: a grid
	 * of working animals would say something about the bot that is not true. */
	working?: boolean
	/** What the bot is busy with, so the preview performs the work the rest of the
	 * app is showing rather than a work of its own. */
	workingKind?: BotWorkingKind
	onIdentityChange: (identity: BotIdentity) => void
	/** Receives the dropped, pasted or browsed file. The host turns it into a URL
	 * and writes it back as `identity.image`. */
	onAvatarUpload: (file: File) => void
	className?: string
}

/**
 * Everything a bot's face is made of, laid out flat: what it looks like now, the
 * eight animals, the eight ink blots plus the option that takes the blot off, and
 * the zone that takes a picture. No popover, no disclosure, no tabs — a reader
 * opening a bot's appearance sees every choice it has at once and can compare them.
 */
const BotIdentityFields = ({
	identity,
	seed,
	working = false,
	workingKind,
	onIdentityChange,
	onAvatarUpload,
	className,
}: BotIdentityFieldsProps) => {
	const groupId = useId()
	const fileRef = useRef<HTMLInputElement>(null)
	const [dragging, setDragging] = useState(false)

	const currentLabel = identity.image
		? "Uploaded image"
		: `${titleCase(identity.animal)}, ${blotLabel(identity.blot)}`

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
		<div
			className={cn("flex flex-col gap-5", className)}
			data-slot="bot-identity-fields"
		>
			<div className="flex items-center gap-4">
				<BotIdentityAvatar
					animal={identity.animal}
					blot={identity.blot}
					image={identity.image}
					kind={workingKind}
					seed={seed}
					size={PREVIEW_SIZE}
					working={working}
				/>
				<div className="flex min-w-0 flex-col gap-1">
					<span className="font-medium text-foreground text-sm">Avatar</span>
					<p className="truncate text-muted-foreground text-xs">
						{currentLabel}
					</p>
				</div>
			</div>

			<IdentityGroup grid="grid-cols-4 gap-1.5" label="Animal">
				{BOT_IDENTITY_ANIMALS.map((animal) => (
					<label className={OPTION_CLASS} key={animal}>
						<input
							checked={identity.animal === animal}
							className="sr-only"
							name={`${groupId}-animal`}
							onChange={() => onIdentityChange({ animal, blot: identity.blot })}
							type="radio"
							value={animal}
						/>
						<span aria-hidden="true">
							<BotAvatar
								animal={animal}
								animated={false}
								blot={identity.blot}
								seed={seed}
								size={ANIMAL_SIZE}
								state="idle"
							/>
						</span>
						<span className="w-full truncate text-center text-[11px]">
							{titleCase(animal)}
						</span>
					</label>
				))}
			</IdentityGroup>

			<IdentityGroup grid="grid-cols-9 gap-1" label="Blot">
				{BLOT_OPTIONS.map((blot) => (
					<label
						className={BLOT_OPTION_CLASS}
						key={blot ?? "none"}
						title={blotLabel(blot)}
					>
						<input
							checked={identity.blot === blot}
							className="sr-only"
							name={`${groupId}-blot`}
							onChange={() =>
								onIdentityChange({ animal: identity.animal, blot })
							}
							type="radio"
							value={blot ?? ""}
						/>
						<span aria-hidden="true">
							<BotAvatar
								animal={identity.animal}
								animated={false}
								blot={blot}
								seed={seed}
								size={BLOT_SIZE}
								state="idle"
							/>
						</span>
						<span className="sr-only">{blotLabel(blot)}</span>
					</label>
				))}
			</IdentityGroup>

			<IdentityGroup grid="grid-cols-1" label="Picture">
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
				{/* Outside the control it belongs to: a button may not hold an input, and
				this one is only ever opened by that button. */}
				<input
					accept="image/*"
					aria-label="Avatar image file"
					className="hidden"
					onChange={handleBrowsed}
					ref={fileRef}
					type="file"
				/>
			</IdentityGroup>
		</div>
	)
}

export { BotIdentityFields, type BotIdentityFieldsProps }
