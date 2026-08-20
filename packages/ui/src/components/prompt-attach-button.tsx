"use client"

import { type ChangeEvent, useRef } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

export interface PromptAttachButtonProps {
	/** Receives every file picked, several at a time. The host stages them and
	 * hands them back to the composer as chips. */
	onAttach: (files: File[]) => void
	disabled?: boolean
	className?: string
}

/**
 * The composer's way in for a file that is not dropped or pasted: a control for the
 * `leading` slot of `PromptInput` that opens the system picker and reports what came
 * back. It holds nothing — the file goes straight to the host.
 */
export function PromptAttachButton({
	onAttach,
	disabled,
	className,
}: PromptAttachButtonProps) {
	const { t } = useTranslation("chat")
	const label = t("attachments.attach")
	const fileRef = useRef<HTMLInputElement>(null)

	// Clearing the input lets the same file be picked twice in a row.
	const handleBrowsed = (event: ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(event.target.files ?? [])
		if (files.length > 0) onAttach(files)
		event.target.value = ""
	}

	return (
		<>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				aria-label={label}
				disabled={disabled}
				onClick={() => fileRef.current?.click()}
				className={cn("rounded-full", className)}
			>
				<Icons.Add />
			</Button>
			{/* Outside the control it belongs to: a button may not hold an input, and
			this one is only ever opened by that button. */}
			<input
				aria-label={label}
				className="hidden"
				multiple
				onChange={handleBrowsed}
				ref={fileRef}
				type="file"
			/>
		</>
	)
}
