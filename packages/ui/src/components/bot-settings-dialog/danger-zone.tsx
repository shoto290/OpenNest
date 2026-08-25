"use client"

import { useTranslation } from "react-i18next"

import { buttonVariants } from "@workspace/ui/components/button"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { Icons } from "@workspace/ui/components/icons"
import { DANGER_BLOCK_CLASS } from "@workspace/ui/components/settings-styles"

type DangerZoneProps = {
	botName: string
	defaultConfirming?: boolean
	onDelete: () => void
}

const DangerZone = ({
	botName,
	defaultConfirming,
	onDelete,
}: DangerZoneProps) => {
	const { t } = useTranslation("bots")

	return (
		<div className={DANGER_BLOCK_CLASS}>
			<div className="flex flex-col gap-1">
				<span className="font-medium text-destructive text-sm">
					{t("danger.delete")}
				</span>
				<p className="text-muted-foreground text-sm">
					{t("danger.description")}
				</p>
			</div>
			<ConfirmDialog
				confirmLabel={t("danger.delete")}
				defaultOpen={defaultConfirming}
				description={t("danger.description")}
				onConfirm={onDelete}
				title={t("danger.confirm.title", { name: botName })}
				trigger={
					<>
						<Icons.Delete aria-hidden="true" className="size-3.5" />
						{t("danger.delete")}
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

export { DangerZone, type DangerZoneProps }
