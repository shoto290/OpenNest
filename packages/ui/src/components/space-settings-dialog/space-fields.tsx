"use client"

import { type CSSProperties, useId } from "react"
import { useTranslation } from "react-i18next"

import {
	BLOT_TINTS,
	type BotAvatarBlot,
} from "@workspace/ui/components/bot-settings"
import { Icons } from "@workspace/ui/components/icons"
import { SettingsField } from "@workspace/ui/components/settings-field"
import { SettingsGroup } from "@workspace/ui/components/settings-group"
import { FIELD_OPTION_CLASS } from "@workspace/ui/components/settings-styles"
import type { SpaceSettingsValue } from "@workspace/ui/components/space-settings"
import { SpaceTint } from "@workspace/ui/components/space-tint"
import { cn } from "@workspace/ui/lib/utils"

const TINT_INK_STYLE = { color: "var(--bot-blot-ink)" } as CSSProperties

const COLOUR_OPTIONS = [undefined, ...BLOT_TINTS] as const

type SpaceFieldsProps = {
	value: SpaceSettingsValue
	onValueChange: (value: SpaceSettingsValue) => void
	className?: string
}

const SpaceFields = ({ value, onValueChange, className }: SpaceFieldsProps) => {
	const { t } = useTranslation("settings")
	const groupId = useId()

	const tintLabel = (tint?: BotAvatarBlot) =>
		tint
			? t(`identity.blot.option.${tint}`, { ns: "bots" })
			: t("space.colour.none")

	return (
		<div
			className={cn("flex flex-col gap-5", className)}
			data-slot="space-fields"
		>
			<SettingsField
				label={t("space.name.label")}
				onValueChange={(name) => onValueChange({ ...value, name })}
				placeholder={t("space.name.placeholder")}
				value={value.name}
			/>

			<SettingsGroup grid="grid-cols-9 gap-1" label={t("space.colour.label")}>
				{COLOUR_OPTIONS.map((tint) => (
					<label
						className={FIELD_OPTION_CLASS}
						key={tint ?? "none"}
						title={tintLabel(tint)}
					>
						<input
							checked={value.colour === tint}
							className="sr-only"
							name={`${groupId}-colour`}
							onChange={() => onValueChange({ ...value, colour: tint })}
							type="radio"
							value={tint ?? ""}
						/>
						<span className="relative grid place-items-center">
							<SpaceTint className="size-6" tint={tint} />
							{value.colour === tint ? (
								<Icons.Check
									aria-hidden="true"
									className="absolute size-3.5"
									style={tint ? TINT_INK_STYLE : undefined}
								/>
							) : null}
						</span>
						<span className="sr-only">{tintLabel(tint)}</span>
					</label>
				))}
			</SettingsGroup>
		</div>
	)
}

export { SpaceFields, type SpaceFieldsProps }
