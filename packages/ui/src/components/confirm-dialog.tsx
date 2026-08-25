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
	trigger?: ReactNode
	triggerClassName?: string
	isTriggerDisabled?: boolean
	open?: boolean
	onOpenChange?: (open: boolean) => void
	title: string
	description: string
	confirmLabel: string
	onConfirm: () => void
	defaultOpen?: boolean
}

const ConfirmDialog = ({
	trigger,
	triggerClassName,
	isTriggerDisabled,
	open,
	onOpenChange,
	title,
	description,
	confirmLabel,
	onConfirm,
	defaultOpen,
}: ConfirmDialogProps) => {
	const { t } = useTranslation("common")

	return (
		<AlertDialog.Root
			defaultOpen={defaultOpen}
			onOpenChange={onOpenChange}
			open={open}
		>
			{trigger ? (
				<AlertDialog.Trigger
					className={triggerClassName}
					disabled={isTriggerDisabled}
				>
					{trigger}
				</AlertDialog.Trigger>
			) : null}
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
