"use client"

import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import { PICTURE_TARGET_CLASS } from "@workspace/ui/components/settings-styles"
import { UserAvatar } from "@workspace/ui/components/user-avatar"
import { usePicturePicker } from "@workspace/ui/hooks/use-picture-picker"
import { cn } from "@workspace/ui/lib/utils"

/** Big enough to judge a face by, small enough to head a group rather than fill it. */
const PICTURE_SIZE = 72

/** What `icon-xs` draws, as the number the corner is measured from. */
const REMOVE_SIZE = 24

/** A round control has no bottom trailing corner to drop a badge in: one dropped in
 * the corner of the box around it lands over the face. This is where the circle's
 * own edge runs at 45° — the badge straddles the outline, half on the picture and
 * half off it. */
const REMOVE_INSET = (PICTURE_SIZE / 2) * (1 - Math.SQRT1_2) - REMOVE_SIZE / 2

/** Straddling the outline puts half of this badge on a picture the control knows
 * nothing about, so it may never let that picture through: `secondary` is the one
 * variant that stays opaque in both themes and under the cursor, where `outline`
 * goes transparent in the dark theme and again on hover — a cross with a face
 * showing through it is a cross a reader cannot find. The ring punches the badge
 * out of the dialog the way the activity dot is punched out of the sidebar, so the
 * picture's own edge never runs through it. */
const REMOVE_CLASS = "absolute rounded-full ring-2 ring-popover"

/** The picture is the control: a reader drops or pastes onto it, or presses it to
 * go looking. A button rather than a div with a handler, so Enter and Space open
 * the picker for free and the target is a tab stop a paste can land in. */
const CONTROL_CLASS = cn(
	PICTURE_TARGET_CLASS,
	"grid place-items-center overflow-hidden rounded-full",
)

type ProfilePictureFieldProps = {
	/** The picture the reader wears, already a URL the host will load. Empty, and the
	 * control is an outline waiting for one. */
	image?: string
	/** Receives the dropped, pasted or browsed file. The host turns it into a URL and
	 * writes it back: the control holds nothing and shows nothing it was given. */
	onPick: (file: File) => void
	/** Takes the picture off. Left out, and no remove button is drawn — a surface
	 * that cannot undo an upload should not offer to. */
	onRemove?: () => void
	className?: string
}

/**
 * The reader's own picture, as the control that sets it: the face the app shows
 * them by, pressed to browse, dropped or pasted on to replace, and taken off by the
 * button in its corner. The same face the sidebar chip and the breadcrumb draw, so
 * what a reader edits is what they will wear.
 *
 * Drag, paste and browse are the ones every picture in the app comes through — the
 * round control and the dashed zone a bot's picture uses are the same behaviour
 * wearing different shapes.
 */
const ProfilePictureField = ({
	image,
	onPick,
	onRemove,
	className,
}: ProfilePictureFieldProps) => {
	const { t } = useTranslation("settings")
	const { controlProps, inputProps } = usePicturePicker({
		label: t("profile.picture.file"),
		onPick,
	})

	return (
		<div
			className={cn("relative w-fit", className)}
			data-slot="profile-picture-field"
		>
			<button
				{...controlProps}
				aria-label={t(image ? "profile.picture.change" : "profile.picture.add")}
				className={cn(CONTROL_CLASS, !image && "border-dashed")}
				style={{ width: PICTURE_SIZE, height: PICTURE_SIZE }}
			>
				{image ? (
					<UserAvatar image={image} size={PICTURE_SIZE} />
				) : (
					<Icons.User
						aria-hidden="true"
						className="size-6 text-muted-foreground"
					/>
				)}
			</button>
			{image && onRemove ? (
				<Button
					aria-label={t("profile.picture.remove")}
					className={REMOVE_CLASS}
					onClick={onRemove}
					size="icon-xs"
					style={{ right: REMOVE_INSET, bottom: REMOVE_INSET }}
					variant="secondary"
				>
					<Icons.Close aria-hidden="true" />
				</Button>
			) : null}
			{/* Outside the control it belongs to: a button may not hold an input, and
			this one is only ever opened by that button. */}
			<input {...inputProps} />
		</div>
	)
}

export { ProfilePictureField, type ProfilePictureFieldProps }
