"use client"

import { useTranslation } from "react-i18next"

import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import type { BotIdentity } from "@workspace/ui/components/bot-settings"
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

type BotPictureFieldProps = {
	identity: BotIdentity
	name?: string
	seed?: string
	onPick: (file: File) => void
	onRemove: () => void
	className?: string
}

const BotPictureField = ({
	identity,
	name,
	seed,
	onPick,
	onRemove,
	className,
}: BotPictureFieldProps) => {
	const { t } = useTranslation("bots")
	const { controlProps, inputProps } = usePicturePicker({
		label: t("identity.picture.file"),
		onPick,
	})

	return (
		<div
			className={cn("relative w-fit", className)}
			data-slot="bot-picture-field"
		>
			<button
				{...controlProps}
				aria-label={t(
					identity.image ? "identity.picture.change" : "identity.picture.add",
				)}
				className={PICTURE_CONTROL_CLASS}
				style={{ width: PICTURE_FIELD_SIZE, height: PICTURE_FIELD_SIZE }}
			>
				<BotIdentityAvatar
					animal={identity.animal}
					blot={identity.blot}
					image={identity.image}
					name={name}
					seed={seed}
					size={PICTURE_FIELD_SIZE}
				/>
			</button>
			{identity.image ? (
				<Button
					aria-label={t("identity.picture.remove")}
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

export { BotPictureField, type BotPictureFieldProps }
