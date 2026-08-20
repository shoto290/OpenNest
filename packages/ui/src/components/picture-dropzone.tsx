"use client"

import {
	type ChangeEvent,
	type ClipboardEvent,
	type DragEvent,
	useRef,
	useState,
} from "react"

import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

/** The whole zone is the control: a reader who has a file already drops or pastes
 * it, and one who does not presses the same target to go looking for it. A button
 * rather than a div with a handler, so Enter and Space open the picker for free and
 * the target is a tab stop paste can land in. */
const DROPZONE_CLASS =
	"flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border border-border border-dashed p-6 text-center outline-none transition-colors hover:border-primary/50 hover:bg-muted focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/30 motion-reduce:transition-none"

type PictureDropzoneProps = {
	/** The accessible name of the file input behind the zone — what picture this one
	 * takes, since a dialog may hold more than one. */
	label: string
	/** Receives the dropped, pasted or browsed file. The host turns it into a URL and
	 * writes it back: the zone holds nothing and shows nothing it was given. */
	onPick: (file: File) => void
}

/**
 * The one way a picture gets in: dropped on it, pasted into it, or chosen through
 * the picker it opens when pressed. Every settings surface that takes an image uses
 * this one, so drag, paste and browse behave the same wherever a picture is set.
 */
const PictureDropzone = ({ label, onPick }: PictureDropzoneProps) => {
	const fileRef = useRef<HTMLInputElement>(null)
	const [dragging, setDragging] = useState(false)

	const emitFile = (file: File | undefined) => {
		if (file) onPick(file)
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
		<>
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
				aria-label={label}
				className="hidden"
				onChange={handleBrowsed}
				ref={fileRef}
				type="file"
			/>
		</>
	)
}

export { PictureDropzone, type PictureDropzoneProps }
