"use client"

import { useId } from "react"
import { useTranslation } from "react-i18next"

import { BotAvatar } from "@workspace/ui/components/bot-avatar"
import {
	type ActivityIndicatorKind,
	BotIdentityAvatar,
} from "@workspace/ui/components/bot-identity-avatar"
import {
	BLOT_TINTS,
	BOT_IDENTITY_ANIMALS,
	type BotAvatarBlot,
	type BotIdentity,
	drawnAnimal,
} from "@workspace/ui/components/bot-settings"
import { ProfilePictureField } from "@workspace/ui/components/profile-picture-field"
import { SettingsGroup } from "@workspace/ui/components/settings-group"
import {
	FIELD_OPTION_CLASS,
	PICTURE_FIELD_SIZE,
} from "@workspace/ui/components/settings-styles"
import { cn } from "@workspace/ui/lib/utils"

const PREVIEW_SIZE = 96
const ANIMAL_SIZE = 40
const BLOT_SIZE = 24

const BLOT_OPTIONS = [...BLOT_TINTS, undefined] as const

const BLOT_OPTION_CLASS = cn(FIELD_OPTION_CLASS, "p-1")

type BotIdentityFieldsProps = {
	identity: BotIdentity
	name?: string
	seed?: string
	working?: boolean
	workingKind?: ActivityIndicatorKind
	onIdentityChange: (identity: BotIdentity) => void
	onAvatarUpload: (file: File) => void
	className?: string
}

const BotIdentityFields = ({
	identity,
	name,
	seed,
	working = false,
	workingKind,
	onIdentityChange,
	onAvatarUpload,
	className,
}: BotIdentityFieldsProps) => {
	const { t } = useTranslation("bots")
	const groupId = useId()

	const blotLabel = (blot?: BotAvatarBlot) =>
		blot ? t(`identity.blot.option.${blot}`) : t("identity.blot.none")

	const dropPicture = () =>
		onIdentityChange({ animal: identity.animal, blot: identity.blot })

	const currentLabel = identity.image
		? t("identity.uploadedImage")
		: t("identity.current", {
				animal: t(
					`identity.animal.option.${drawnAnimal(name, identity.animal)}`,
				),
				blot: blotLabel(identity.blot),
			})

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
					name={name}
					seed={seed}
					size={PREVIEW_SIZE}
					working={working}
				/>
				<div className="flex min-w-0 flex-col gap-1">
					<span className="font-medium text-foreground text-sm">
						{t("identity.avatar")}
					</span>
					<p className="truncate text-muted-foreground text-xs">
						{currentLabel}
					</p>
				</div>
			</div>

			<SettingsGroup
				grid="grid-cols-4 gap-1.5"
				label={t("identity.animal.label")}
			>
				{BOT_IDENTITY_ANIMALS.map((animal) => (
					<label className={FIELD_OPTION_CLASS} key={animal}>
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
							{t(`identity.animal.option.${animal}`)}
						</span>
					</label>
				))}
			</SettingsGroup>

			<SettingsGroup grid="grid-cols-9 gap-1" label={t("identity.blot.label")}>
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
			</SettingsGroup>

			<SettingsGroup grid="grid-cols-1" label={t("identity.picture.label")}>
				<ProfilePictureField
					fileLabel={t("identity.picture.file")}
					onPick={onAvatarUpload}
					onRemove={identity.image ? dropPicture : undefined}
					pickLabel={t(
						identity.image ? "identity.picture.change" : "identity.picture.add",
					)}
					preview={
						<BotIdentityAvatar
							animal={identity.animal}
							blot={identity.blot}
							image={identity.image}
							name={name}
							seed={seed}
							size={PICTURE_FIELD_SIZE}
						/>
					}
					removeLabel={t("identity.picture.remove")}
				/>
			</SettingsGroup>
		</div>
	)
}

export { BotIdentityFields, type BotIdentityFieldsProps }
