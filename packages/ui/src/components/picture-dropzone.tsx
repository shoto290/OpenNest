"use client"

import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { PICTURE_TARGET_CLASS } from "@workspace/ui/components/settings-styles"
import { usePicturePicker } from "@workspace/ui/hooks/use-picture-picker"
import { cn } from "@workspace/ui/lib/utils"

const DROPZONE_CLASS = cn(
	PICTURE_TARGET_CLASS,
	"flex w-full flex-col items-center gap-2 rounded-xl border-dashed p-6 text-center",
)

type PictureDropzoneProps = {
	label: string
	onPick: (file: File) => void
}

const PictureDropzone = ({ label, onPick }: PictureDropzoneProps) => {
	const { t } = useTranslation("common")
	const { controlProps, inputProps } = usePicturePicker({ label, onPick })

	return (
		<>
			<button {...controlProps} className={DROPZONE_CLASS}>
				<Icons.Image
					aria-hidden="true"
					className="size-5 text-muted-foreground"
				/>
				<span className="block text-foreground text-sm">
					{t("dropzone.drop")}
				</span>
				<span className="block text-muted-foreground text-xs">
					{t("dropzone.browse")}
				</span>
			</button>
			<input {...inputProps} />
		</>
	)
}

export { PictureDropzone, type PictureDropzoneProps }
