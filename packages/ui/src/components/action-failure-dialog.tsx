"use client"

import { AlertDialog } from "@base-ui/react/alert-dialog"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button, buttonVariants } from "@workspace/ui/components/button"
import {
	BACKDROP_CLASS,
	DIALOG_POPUP_CLASS,
} from "@workspace/ui/components/settings-styles"
import { cn } from "@workspace/ui/lib/utils"

const UNAVAILABLE_ACTION_CLASS =
	"aria-disabled:pointer-events-none aria-disabled:opacity-50"

type ActionFailureDialogProps = {
	open?: boolean
	onOpenChange?: (open: boolean) => void
	defaultOpen?: boolean
	title: string
	description: string
	onRetry: () => void | Promise<void>
	retryFailureLabel?: string
}

const ActionFailureDialog = ({
	open,
	onOpenChange,
	defaultOpen,
	title,
	description,
	onRetry,
	retryFailureLabel,
}: ActionFailureDialogProps) => {
	const { t } = useTranslation("common")
	const [isOpen, setOpen] = useState(Boolean(defaultOpen))
	const [isRetrying, setRetrying] = useState(false)
	const [hasRetryFailed, setRetryFailed] = useState(false)
	const retryRef = useRef<HTMLButtonElement>(null)

	const change = (next: boolean) => {
		setOpen(next)
		setRetryFailed(false)
		onOpenChange?.(next)
	}

	const requestChange = (next: boolean) => {
		if (isRetrying && !next) return
		change(next)
	}

	const retry = async () => {
		if (isRetrying) return

		setRetryFailed(false)
		setRetrying(true)

		try {
			await onRetry()
			setRetrying(false)
			change(false)
		} catch {
			setRetryFailed(true)
			setRetrying(false)
		}
	}

	return (
		<AlertDialog.Root onOpenChange={requestChange} open={open ?? isOpen}>
			<AlertDialog.Portal>
				<AlertDialog.Backdrop className={BACKDROP_CLASS} />
				<AlertDialog.Popup
					className={cn(
						DIALOG_POPUP_CLASS,
						"-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 flex w-88 max-w-[calc(100vw-3rem)] flex-col gap-4 rounded-2xl p-5",
					)}
					initialFocus={retryRef}
				>
					<div className="flex flex-col gap-1">
						<AlertDialog.Title className="font-medium text-base">
							{title}
						</AlertDialog.Title>
						<AlertDialog.Description className="break-words text-muted-foreground text-sm">
							{description}
						</AlertDialog.Description>
					</div>
					{hasRetryFailed && retryFailureLabel ? (
						<p className="break-words text-destructive text-xs" role="alert">
							{retryFailureLabel}
						</p>
					) : null}
					<div className="flex flex-wrap justify-end gap-2">
						<AlertDialog.Close
							aria-disabled={isRetrying}
							className={cn(
								buttonVariants({ variant: "outline", size: "sm" }),
								UNAVAILABLE_ACTION_CLASS,
							)}
						>
							{t("dialog.close")}
						</AlertDialog.Close>
						<Button
							aria-disabled={isRetrying}
							className={UNAVAILABLE_ACTION_CLASS}
							onClick={retry}
							ref={retryRef}
							size="sm"
						>
							{t("dialog.retry")}
						</Button>
					</div>
				</AlertDialog.Popup>
			</AlertDialog.Portal>
		</AlertDialog.Root>
	)
}

export { ActionFailureDialog, type ActionFailureDialogProps }
