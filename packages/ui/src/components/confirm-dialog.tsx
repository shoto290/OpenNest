"use client"

import { AlertDialog } from "@base-ui/react/alert-dialog"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { buttonVariants } from "@workspace/ui/components/button"
import {
	BACKDROP_CLASS,
	DIALOG_POPUP_CLASS,
} from "@workspace/ui/components/settings-styles"
import { cn } from "@workspace/ui/lib/utils"

type ConfirmDialogProps = {
	/** What is inside the button that opens the question — an icon, a word, both. */
	trigger: ReactNode
	/** The trigger's own shape. Every caller so far dresses it with
	 * `buttonVariants`. */
	triggerClassName: string
	/** Names the thing being acted on, so a reader who opened the wrong one finds
	 * out here rather than after. */
	title: string
	/** What the action takes away, in full. Never shortened to "Are you sure?" —
	 * the consequence is the question. */
	description: string
	confirmLabel: string
	/** Fired only once the question is accepted. */
	onConfirm: () => void
	/** Whether it mounts with the question already up. Read once, as it mounts. */
	defaultOpen?: boolean
}

/**
 * A question standing between a reader and something they cannot undo. It dims the
 * whole page and traps focus — this is a question, not a notification — and puts
 * Cancel first, so the safe way out is the one the hand reaches. Escape and the
 * backdrop both cancel, and a cancelled question reports nothing: `onConfirm` fires
 * on the second press and only then.
 */
const ConfirmDialog = ({
	trigger,
	triggerClassName,
	title,
	description,
	confirmLabel,
	onConfirm,
	defaultOpen,
}: ConfirmDialogProps) => {
	const { t } = useTranslation("common")

	return (
		<AlertDialog.Root defaultOpen={defaultOpen}>
			<AlertDialog.Trigger className={triggerClassName}>
				{trigger}
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
							{title}
						</AlertDialog.Title>
						<AlertDialog.Description className="text-muted-foreground text-sm">
							{description}
						</AlertDialog.Description>
					</div>
					<div className="flex justify-end gap-2">
						<AlertDialog.Close
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							{t("confirm.cancel")}
						</AlertDialog.Close>
						<AlertDialog.Close
							className={buttonVariants({ variant: "destructive", size: "sm" })}
							onClick={onConfirm}
						>
							{confirmLabel}
						</AlertDialog.Close>
					</div>
				</AlertDialog.Popup>
			</AlertDialog.Portal>
		</AlertDialog.Root>
	)
}

export { ConfirmDialog, type ConfirmDialogProps }
