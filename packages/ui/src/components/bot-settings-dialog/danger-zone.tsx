"use client"

import { AlertDialog } from "@base-ui/react/alert-dialog"

import { buttonVariants } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import {
	BACKDROP_CLASS,
	POPUP_CLASS,
} from "@workspace/ui/components/settings-styles"
import { cn } from "@workspace/ui/lib/utils"

type DangerZoneProps = {
	/** Named in the question, so a reader who opened the wrong bot's settings sees
	 * it before they answer. */
	botName: string
	confirming: boolean
	onConfirmingChange: (confirming: boolean) => void
	/** Fired only once the confirmation is accepted. */
	onDelete: () => void
}

const DangerZone = ({
	botName,
	confirming,
	onConfirmingChange,
	onDelete,
}: DangerZoneProps) => (
	<div className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 p-4">
		<div className="flex flex-col gap-1">
			<span className="font-medium text-destructive text-sm">Delete bot</span>
			<p className="text-muted-foreground text-sm">
				Its avatar, instructions and working directory go with it. This cannot
				be undone.
			</p>
		</div>
		<AlertDialog.Root onOpenChange={onConfirmingChange} open={confirming}>
			<AlertDialog.Trigger
				className={buttonVariants({ variant: "destructive", size: "sm" })}
			>
				<Icons.Delete aria-hidden="true" className="size-3.5" />
				Delete bot
			</AlertDialog.Trigger>
			<AlertDialog.Portal>
				<AlertDialog.Backdrop className={BACKDROP_CLASS} />
				<AlertDialog.Popup
					className={cn(
						POPUP_CLASS,
						"-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 flex w-88 max-w-[calc(100vw-3rem)] flex-col gap-4 rounded-2xl p-5",
					)}
				>
					<div className="flex flex-col gap-1">
						<AlertDialog.Title className="font-medium text-base">
							Delete {botName}?
						</AlertDialog.Title>
						<AlertDialog.Description className="text-muted-foreground text-sm">
							Its avatar, instructions and working directory go with it. This
							cannot be undone.
						</AlertDialog.Description>
					</div>
					<div className="flex justify-end gap-2">
						<AlertDialog.Close
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							Cancel
						</AlertDialog.Close>
						<AlertDialog.Close
							className={buttonVariants({ variant: "destructive", size: "sm" })}
							onClick={onDelete}
						>
							Delete bot
						</AlertDialog.Close>
					</div>
				</AlertDialog.Popup>
			</AlertDialog.Portal>
		</AlertDialog.Root>
	</div>
)

export { DangerZone, type DangerZoneProps }
