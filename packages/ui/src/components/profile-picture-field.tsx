"use client"

import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import { PICTURE_TARGET_CLASS } from "@workspace/ui/components/settings-styles"
import { UserAvatar } from "@workspace/ui/components/user-avatar"
import { usePicturePicker } from "@workspace/ui/hooks/use-picture-picker"
import { cn } from "@workspace/ui/lib/utils"

const PICTURE_SIZE = 72

const REMOVE_SIZE = 24

const REMOVE_INSET = (PICTURE_SIZE / 2) * (1 - Math.SQRT1_2) - REMOVE_SIZE / 2

const REMOVE_CLASS = "absolute rounded-full ring-2 ring-popover"

const CONTROL_CLASS = cn(
	PICTURE_TARGET_CLASS,
	"grid place-items-center overflow-hidden rounded-full",
)

type ProfilePictureFieldProps = {
	image?: string
	onPick: (file: File) => void
	onRemove?: () => void
	className?: string
}

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
			<input {...inputProps} />
		</div>
	)
}

export { ProfilePictureField, type ProfilePictureFieldProps }
