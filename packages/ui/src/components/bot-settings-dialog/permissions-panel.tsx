"use client"

import { useTranslation } from "react-i18next"

import {
	BOT_PERMISSION_MODES,
	BOT_PERMISSION_RULE_LISTS,
	type BotPermissionRuleList,
	type BotPermissions,
	isPermissionRule,
	readBotPermissionMode,
} from "@workspace/ui/components/bot-settings"
import { SettingsListField } from "@workspace/ui/components/settings-list-field"
import { SettingsSelect } from "@workspace/ui/components/settings-select"

type PermissionsPanelProps = {
	permissions: BotPermissions
	onPermissionsChange: (permissions: BotPermissions) => void
}

const PermissionsPanel = ({
	permissions,
	onPermissionsChange,
}: PermissionsPanelProps) => {
	const { t } = useTranslation("bots")

	const patch = (fields: Partial<BotPermissions>) =>
		onPermissionsChange({ ...permissions, ...fields })

	const modeOptions = BOT_PERMISSION_MODES.map((mode) => ({
		label: t(`permissions.mode.option.${mode}.label`),
		value: mode,
	}))

	const ruleList = (list: BotPermissionRuleList) => (
		<SettingsListField
			addLabel={t("permissions.rule.add")}
			emptyLabel={t(`permissions.rule.${list}.empty`)}
			hint={t(`permissions.rule.${list}.hint`)}
			invalidMessage={t("permissions.rule.invalid")}
			isItemValid={isPermissionRule}
			items={permissions[list]}
			key={list}
			label={t(`permissions.rule.${list}.label`)}
			onItemsChange={(rules) => patch({ [list]: rules })}
			placeholder={t("permissions.rule.placeholder")}
			removeLabel={(rule) => t("permissions.rule.remove", { rule })}
		/>
	)

	return (
		<>
			<SettingsSelect
				hint={t(
					`permissions.mode.option.${readBotPermissionMode(permissions.defaultMode)}.hint`,
				)}
				label={t("permissions.mode.label")}
				onValueChange={(mode) =>
					patch({ defaultMode: readBotPermissionMode(mode) })
				}
				options={modeOptions}
				value={permissions.defaultMode}
			/>

			{BOT_PERMISSION_RULE_LISTS.map(ruleList)}

			<SettingsListField
				addLabel={t("permissions.directories.add")}
				emptyLabel={t("permissions.directories.empty")}
				hint={t("permissions.directories.hint")}
				invalidMessage={t("permissions.directories.invalid")}
				isItemValid={(path) => path.startsWith("/")}
				items={permissions.additionalDirectories}
				label={t("permissions.directories.label")}
				onItemsChange={(additionalDirectories) =>
					patch({ additionalDirectories })
				}
				placeholder={t("permissions.directories.placeholder")}
				removeLabel={(path) => t("permissions.directories.remove", { path })}
			/>
		</>
	)
}

export { PermissionsPanel, type PermissionsPanelProps }
