"use client"

import { Icons } from "@workspace/ui/components/icons"
import { PICTURE_TARGET_CLASS } from "@workspace/ui/components/settings-styles"
import { usePicturePicker } from "@workspace/ui/hooks/use-picture-picker"
import { cn } from "@workspace/ui/lib/utils"

/** The whole zone is the control: a reader who has a file already drops or pastes
 * it, and one who does not presses the same target to go looking for it. A button
 * rather than a div with a handler, so Enter and Space open the picker for free and
 * the target is a tab stop paste can land in. */
const DROPZONE_CLASS = cn(
	PICTURE_TARGET_CLASS,
	"flex w-full flex-col items-center gap-2 rounded-xl border-dashed p-6 text-center",
)

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
	const { controlProps, inputProps } = usePicturePicker({ label, onPick })

	return (
		<>
			<button {...controlProps} className={DROPZONE_CLASS}>
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
			<input {...inputProps} />
		</>
	)
}

export { PictureDropzone, type PictureDropzoneProps }
