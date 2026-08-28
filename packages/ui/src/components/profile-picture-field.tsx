"use client"

import type { ReactNode } from "react"

import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import {
	PICTURE_CONTROL_CLASS,
	PICTURE_FIELD_SIZE,
	PICTURE_REMOVE_CLASS,
	PICTURE_REMOVE_INSET,
} from "@workspace/ui/components/settings-styles"
import { usePicturePicker } from "@workspace/ui/hooks/use-picture-picker"
import { cn } from "@workspace/ui/lib/utils"

type ProfilePictureFieldProps = {
	preview: ReactNode
	fileLabel: string
	pickLabel: string
	removeLabel: string
	isPlaceholder?: boolean
	onPick: (file: File) => void
	onRemove?: () => void
	className?: string
}

const ProfilePictureField = ({
	preview,
	fileLabel,
	pickLabel,
	removeLabel,
	isPlaceholder,
	onPick,
	onRemove,
	className,
}: ProfilePictureFieldProps) => {
	const { controlProps, inputProps } = usePicturePicker({
		label: fileLabel,
		onPick,
	})

	return (
		<div
			className={cn("relative w-fit", className)}
			data-slot="profile-picture-field"
		>
			<button
				{...controlProps}
				aria-label={pickLabel}
				className={cn(PICTURE_CONTROL_CLASS, isPlaceholder && "border-dashed")}
				style={{ width: PICTURE_FIELD_SIZE, height: PICTURE_FIELD_SIZE }}
			>
				{preview}
			</button>
			{onRemove ? (
				<Button
					aria-label={removeLabel}
					className={PICTURE_REMOVE_CLASS}
					onClick={onRemove}
					size="icon-xs"
					style={{ right: PICTURE_REMOVE_INSET, bottom: PICTURE_REMOVE_INSET }}
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
