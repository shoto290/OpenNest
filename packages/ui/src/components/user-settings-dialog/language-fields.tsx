"use client"

import { useId } from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { SettingsGroup } from "@workspace/ui/components/settings-group"
import { FIELD_OPTION_MARKS_CLASS } from "@workspace/ui/components/settings-styles"
import {
	LANGUAGE_IDS,
	LANGUAGE_NAMES,
	type Language,
} from "@workspace/ui/lib/i18n"
import { cn } from "@workspace/ui/lib/utils"

const OPTION_ROW_CLASS = cn(
	FIELD_OPTION_MARKS_CLASS,
	"grid grid-cols-[1rem_1fr] items-center gap-2 px-2 py-2 text-sm",
)

type LanguageFieldsProps = {
	language: Language | null
	onLanguageChange: (language: Language | null) => void
	className?: string
}

const LanguageFields = ({
	language,
	onLanguageChange,
	className,
}: LanguageFieldsProps) => {
	const { t } = useTranslation("settings")
	const groupId = useId()

	const options: { id: Language | null; name: string }[] = [
		{ id: null, name: t("language.machine") },
		...LANGUAGE_IDS.map((id) => ({ id, name: LANGUAGE_NAMES[id] })),
	]

	return (
		<div className={className} data-slot="language-fields">
			<SettingsGroup grid="gap-1" label={t("language.label")}>
				{options.map(({ id, name }) => (
					<label
						className={OPTION_ROW_CLASS}
						data-slot="language-option"
						key={id ?? "machine"}
					>
						<input
							checked={language === id}
							className="sr-only"
							name={`${groupId}-language`}
							onChange={() => onLanguageChange(id)}
							type="radio"
						/>
						{language === id ? (
							<Icons.Check
								aria-hidden="true"
								className="col-start-1 size-3.5 text-primary"
							/>
						) : null}
						<span className="col-start-2 truncate">{name}</span>
					</label>
				))}
			</SettingsGroup>
		</div>
	)
}

export { LanguageFields, type LanguageFieldsProps }
