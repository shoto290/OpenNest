"use client"

import { useId } from "react"
import { useTranslation } from "react-i18next"

import {
	BOT_OUTPUT_STYLES,
	type BotModelOption,
	type BotOutputStyle,
	DEFAULT_BOT_OUTPUT_STYLE,
	readBotOutputStyle,
} from "@workspace/ui/components/bot-settings"
import { Icons } from "@workspace/ui/components/icons"
import { SettingsSelect } from "@workspace/ui/components/settings-select"
import {
	FIELD_CONTROL_CLASS,
	FIELD_LABEL_CLASS,
} from "@workspace/ui/components/settings-styles"
import { SettingsSwitch } from "@workspace/ui/components/settings-switch"
import { cn } from "@workspace/ui/lib/utils"

type RuntimeFieldsProps = {
	models: BotModelOption[]
	model: string
	onModelChange: (model: string) => void
	/** How the bot writes its answers, as the host stores it raw. Left out, the
	 * concise style the bot is given by default, reported to nobody: a host that has
	 * not wired the question yet still shows the field rather than a gap. */
	outputStyle?: BotOutputStyle
	onOutputStyleChange?: (outputStyle: BotOutputStyle) => void
	workingDirectory: string
	onBrowseWorkingDirectory: () => void
	/** Whether the bot is denied the tools that edit files and run commands. What it
	 * stops is those four and nothing else, which is why the sentence beside it says
	 * so — see the catalogue. */
	changesNothing: boolean
	onChangesNothingChange: (changesNothing: boolean) => void
}

/** What the bot runs on: the model behind it, the way it writes its answers, the
 * folder it works in, and whether it may change anything there. The three first are
 * pickers rather than text — none of them is something a reader can type correctly —
 * and the last is a switch, since it is on or off. */
const RuntimeFields = ({
	models,
	model,
	onModelChange,
	outputStyle = DEFAULT_BOT_OUTPUT_STYLE,
	onOutputStyleChange,
	workingDirectory,
	onBrowseWorkingDirectory,
	changesNothing,
	onChangesNothingChange,
}: RuntimeFieldsProps) => {
	const { t } = useTranslation("bots")
	const directoryId = useId()

	const outputStyleOptions = BOT_OUTPUT_STYLES.map((style) => ({
		label: t(`runtime.outputStyle.option.${style}.label`),
		value: style,
	}))

	return (
		<>
			<SettingsSelect
				label={t("runtime.model.label")}
				onValueChange={onModelChange}
				options={models}
				placeholder={t("runtime.model.placeholder")}
				value={model}
			/>

			<SettingsSelect
				hint={t(`runtime.outputStyle.option.${outputStyle}.hint`)}
				label={t("runtime.outputStyle.label")}
				onValueChange={(value) =>
					onOutputStyleChange?.(readBotOutputStyle(value))
				}
				options={outputStyleOptions}
				value={outputStyle}
			/>

			<div className="flex flex-col gap-1.5">
				<span className={FIELD_LABEL_CLASS} id={`${directoryId}-label`}>
					{t("runtime.directory.label")}
				</span>
				<button
					aria-labelledby={`${directoryId}-label ${directoryId}`}
					className={cn(
						FIELD_CONTROL_CLASS,
						"flex items-center gap-2 pl-2.5 text-left hover:bg-muted",
					)}
					id={directoryId}
					onClick={onBrowseWorkingDirectory}
					title={workingDirectory || undefined}
					type="button"
				>
					<Icons.Folder
						aria-hidden="true"
						className="size-4 shrink-0 text-muted-foreground"
					/>
					<span
						className={cn(
							"min-w-0 flex-1 truncate",
							!workingDirectory && "text-muted-foreground",
						)}
					>
						{workingDirectory || t("runtime.directory.placeholder")}
					</span>
					<span className="shrink-0 text-muted-foreground text-xs">
						{t("runtime.directory.browse")}
					</span>
				</button>
			</div>

			<SettingsSwitch
				checked={changesNothing}
				description={t("runtime.changesNothing.description")}
				label={t("runtime.changesNothing.label")}
				onCheckedChange={onChangesNothingChange}
			/>
		</>
	)
}

export { RuntimeFields, type RuntimeFieldsProps }
