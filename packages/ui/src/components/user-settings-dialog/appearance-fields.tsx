"use client"

import { useId } from "react"
import { useTranslation } from "react-i18next"

import { type Icon, Icons } from "@workspace/ui/components/icons"
import { SettingsGroup } from "@workspace/ui/components/settings-group"
import { FIELD_OPTION_CLASS } from "@workspace/ui/components/settings-styles"
import {
	COLOR_SCHEME_IDS,
	type ColorScheme,
} from "@workspace/ui/components/user-settings"
import { cn } from "@workspace/ui/lib/utils"

const SCHEME_ICONS: Record<ColorScheme, Icon> = {
	light: Icons.LightScheme,
	dark: Icons.DarkScheme,
	system: Icons.SystemScheme,
}

const OPTION_CLASS = cn(FIELD_OPTION_CLASS, "gap-1.5 px-2 py-3 text-xs")

type AppearanceFieldsProps = {
	colorScheme: ColorScheme
	onColorSchemeChange: (colorScheme: ColorScheme) => void
	className?: string
}

const AppearanceFields = ({
	colorScheme,
	onColorSchemeChange,
	className,
}: AppearanceFieldsProps) => {
	const { t } = useTranslation("settings")
	const groupId = useId()

	return (
		<SettingsGroup
			className={className}
			grid="grid-cols-3 gap-1.5"
			label={t("appearance.scheme.label")}
		>
			{COLOR_SCHEME_IDS.map((scheme) => {
				const SchemeIcon = SCHEME_ICONS[scheme]

				return (
					<label className={OPTION_CLASS} key={scheme}>
						<input
							checked={colorScheme === scheme}
							className="sr-only"
							name={`${groupId}-scheme`}
							onChange={() => onColorSchemeChange(scheme)}
							type="radio"
							value={scheme}
						/>
						<SchemeIcon aria-hidden="true" className="size-4" />
						<span>{t(`appearance.scheme.option.${scheme}`)}</span>
					</label>
				)
			})}
		</SettingsGroup>
	)
}

export { AppearanceFields, type AppearanceFieldsProps }
