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

/** One choice on a list of them, a row each: a check slot, then the name. The same
 * marks a tile carries — filled when chosen, ringed when reached by keyboard — laid
 * on their side. */
const OPTION_ROW_CLASS = cn(
	FIELD_OPTION_MARKS_CLASS,
	"grid grid-cols-[1rem_1fr] items-center gap-2 px-2 py-2 text-sm",
)

type LanguageFieldsProps = {
	/** The language that was chosen, or `null` for none chosen — the machine row,
	 * which is what the app follows until a reader picks a language themselves. */
	language: Language | null
	/** Fired with the language chosen, or `null` when the reader hands the choice
	 * back to the machine. The group holds nothing: the tick moves once the host
	 * writes the choice down. */
	onLanguageChange: (language: Language | null) => void
	className?: string
}

/**
 * What the app reads in, as a list one line to a language: the machine's own first,
 * then every language this build ships a catalogue for. The list is the catalogues
 * themselves, so there is no second list to fall out of step with them, and each is
 * written in its own language — a reader lost in a language they cannot read still
 * finds `English` or `Français`. Only the machine row is a word of the interface,
 * because following the machine is not a language.
 */
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
