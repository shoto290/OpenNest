"use client"

import { useTranslation } from "react-i18next"

import { buttonVariants } from "@workspace/ui/components/button"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { Icons } from "@workspace/ui/components/icons"

type DangerZoneProps = {
	/** Named in the question, so a reader who opened the wrong bot's settings sees
	 * it before they answer. */
	botName: string
	/** Whether the group mounts with the question already up. Read once, as the group
	 * mounts: the group owns the question from there, and a question goes with the
	 * panel it was asked in. */
	defaultConfirming?: boolean
	/** Fired only once the confirmation is accepted. */
	onDelete: () => void
}

const DangerZone = ({
	botName,
	defaultConfirming,
	onDelete,
}: DangerZoneProps) => {
	const { t } = useTranslation("bots")

	return (
		<div className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 p-4">
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
