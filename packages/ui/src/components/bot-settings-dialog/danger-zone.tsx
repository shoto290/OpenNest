"use client"

import { AlertDialog } from "@base-ui/react/alert-dialog"
import { useTranslation } from "react-i18next"

import { buttonVariants } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import {
	BACKDROP_CLASS,
	DIALOG_POPUP_CLASS,
} from "@workspace/ui/components/settings-styles"
import { cn } from "@workspace/ui/lib/utils"

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
			<AlertDialog.Root defaultOpen={defaultConfirming}>
				<AlertDialog.Trigger
					className={buttonVariants({ variant: "destructive", size: "sm" })}
				>
					<Icons.Delete aria-hidden="true" className="size-3.5" />
					{t("danger.delete")}
				</AlertDialog.Trigger>
				<AlertDialog.Portal>
					<AlertDialog.Backdrop className={BACKDROP_CLASS} />
					<AlertDialog.Popup
						className={cn(
							DIALOG_POPUP_CLASS,
							"-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 flex w-88 max-w-[calc(100vw-3rem)] flex-col gap-4 rounded-2xl p-5",
						)}
					>
						<div className="flex flex-col gap-1">
							<AlertDialog.Title className="font-medium text-base">
								{t("danger.confirm.title", { name: botName })}
							</AlertDialog.Title>
							<AlertDialog.Description className="text-muted-foreground text-sm">
								{t("danger.description")}
							</AlertDialog.Description>
						</div>
						<div className="flex justify-end gap-2">
							<AlertDialog.Close
								className={buttonVariants({ variant: "outline", size: "sm" })}
							>
								{t("danger.confirm.cancel")}
							</AlertDialog.Close>
							<AlertDialog.Close
								className={buttonVariants({
									variant: "destructive",
									size: "sm",
								})}
								onClick={onDelete}
							>
								{t("danger.delete")}
							</AlertDialog.Close>
						</div>
					</AlertDialog.Popup>
				</AlertDialog.Portal>
			</AlertDialog.Root>
		</div>
	)
}

export { DangerZone, type DangerZoneProps }
