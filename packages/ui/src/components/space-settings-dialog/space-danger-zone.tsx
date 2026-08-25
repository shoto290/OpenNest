"use client"

import { useTranslation } from "react-i18next"

import { buttonVariants } from "@workspace/ui/components/button"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { Icons } from "@workspace/ui/components/icons"
import { DANGER_BLOCK_CLASS } from "@workspace/ui/components/settings-styles"

type SpaceDangerZoneProps = {
	spaceName: string
	onDelete: () => void
	isDeletable?: boolean
	defaultConfirming?: boolean
}

const SpaceDangerZone = ({
	spaceName,
	onDelete,
	isDeletable = true,
	defaultConfirming,
}: SpaceDangerZoneProps) => {
	const { t } = useTranslation("settings")

	return (
		<div className={DANGER_BLOCK_CLASS} data-slot="space-danger-zone">
			<div className="flex flex-col gap-1">
				<span className="font-medium text-destructive text-sm">
					{t("space.danger.delete")}
				</span>
				<p className="text-muted-foreground text-sm">
					{isDeletable ? t("space.danger.description") : t("space.danger.last")}
				</p>
			</div>
			<ConfirmDialog
				confirmLabel={t("space.danger.delete")}
				defaultOpen={defaultConfirming}
				description={t("space.danger.description")}
				isTriggerDisabled={!isDeletable}
				onConfirm={onDelete}
				title={t("space.danger.confirm.title", { name: spaceName })}
				trigger={
					<>
						<Icons.Delete aria-hidden="true" className="size-3.5" />
						{t("space.danger.delete")}
					</>
				}
				triggerClassName={buttonVariants({
					variant: "destructive",
					size: "sm",
				})}
			/>
		</div>
	)
}

export { SpaceDangerZone, type SpaceDangerZoneProps }
