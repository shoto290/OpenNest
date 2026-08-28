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
import { cn } from "@workspace/ui/lib/utils"

type RuntimeFieldsProps = {
	models: BotModelOption[]
	model: string
	onModelChange: (model: string) => void
	outputStyle?: BotOutputStyle
	onOutputStyleChange?: (outputStyle: BotOutputStyle) => void
	workingDirectory: string
	onBrowseWorkingDirectory: () => void
}

const RuntimeFields = ({
	models,
	model,
	onModelChange,
	outputStyle = DEFAULT_BOT_OUTPUT_STYLE,
	onOutputStyleChange,
	workingDirectory,
	onBrowseWorkingDirectory,
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
		</>
	)
}

export { RuntimeFields, type RuntimeFieldsProps }
