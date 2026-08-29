"use client"

import { AlertDialog } from "@base-ui/react/alert-dialog"
import { type ReactNode, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button, buttonVariants } from "@workspace/ui/components/button"
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
	onConfirm: () => void | Promise<void>
	failureLabel?: string
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
	failureLabel,
	defaultOpen,
}: ConfirmDialogProps) => {
	const { t } = useTranslation("common")
	const [isOpen, setOpen] = useState(Boolean(defaultOpen))
	const [isConfirming, setConfirming] = useState(false)
	const [hasFailed, setFailed] = useState(false)

	const change = (next: boolean) => {
		setOpen(next)
		setFailed(false)
		onOpenChange?.(next)
	}

	const confirm = async () => {
		setFailed(false)
		setConfirming(true)

		try {
			await onConfirm()
			change(false)
		} catch {
			setFailed(true)
		} finally {
			setConfirming(false)
		}
	}

	return (
		<AlertDialog.Root onOpenChange={change} open={open ?? isOpen}>
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
					{hasFailed && failureLabel ? (
						<p className="text-destructive text-xs" role="alert">
							{failureLabel}
						</p>
					) : null}
					<div className="flex justify-end gap-2">
						<AlertDialog.Close
							className={buttonVariants({ variant: "outline", size: "sm" })}
							disabled={isConfirming}
						>
							{t("confirm.cancel")}
						</AlertDialog.Close>
						<Button
							disabled={isConfirming}
							onClick={confirm}
							size="sm"
							variant="destructive"
						>
							{confirmLabel}
						</Button>
					</div>
				</AlertDialog.Popup>
			</AlertDialog.Portal>
		</AlertDialog.Root>
	)
}

export { ConfirmDialog, type ConfirmDialogProps }
