"use client"

import { useTranslation } from "react-i18next"

import { buttonVariants } from "@workspace/ui/components/button"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { Icons } from "@workspace/ui/components/icons"
import { DANGER_BLOCK_CLASS } from "@workspace/ui/components/settings-styles"

type ConversationDangerZoneProps = {
	conversationName: string
	onDelete: () => void
	defaultConfirming?: boolean
}

const ConversationDangerZone = ({
	conversationName,
	onDelete,
	defaultConfirming,
}: ConversationDangerZoneProps) => {
	const { t } = useTranslation("chat")

	return (
		<div className={DANGER_BLOCK_CLASS} data-slot="conversation-danger-zone">
			<div className="flex flex-col gap-1">
				<span className="font-medium text-destructive text-sm">
					{t("conversationSettings.danger.delete")}
				</span>
				<p className="text-muted-foreground text-sm">
					{t("conversationSettings.danger.description")}
				</p>
			</div>
			<ConfirmDialog
				confirmLabel={t("conversationSettings.danger.delete")}
				defaultOpen={defaultConfirming}
				description={t("conversationSettings.danger.description")}
				onConfirm={onDelete}
				title={t("conversationSettings.danger.confirm.title", {
					name: conversationName,
				})}
				trigger={
					<>
						<Icons.Delete aria-hidden="true" className="size-3.5" />
						{t("conversationSettings.danger.delete")}
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

export { ConversationDangerZone, type ConversationDangerZoneProps }
