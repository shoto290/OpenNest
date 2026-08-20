"use client"

import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

const SIZE_UNITS = ["B", "KB", "MB", "GB"]

const formatSize = (bytes: number) => {
	const unit = Math.min(
		Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024)),
		SIZE_UNITS.length - 1,
	)
	const value = bytes / 1024 ** unit
	const rounded =
		unit === 0 || value >= 10 ? Math.round(value) : value.toFixed(1)
	return `${rounded} ${SIZE_UNITS[unit]}`
}

export type PromptAttachment = {
	id: string
	name: string
	/** Size in bytes, formatted for reading — the host never formats it itself. */
	size: number
	/** Anything an `img` can load. Given for a file the host could preview, left
	 * out for one it could not. */
	previewUrl?: string
}

export interface PromptAttachmentsProps {
	/** The files staged for the next prompt, in the order given. */
	items: PromptAttachment[]
	/** Receives the id of the chip whose remove control was pressed. The host drops
	 * it from the list: the row holds no state of its own. */
	onRemove: (id: string) => void
	className?: string
}

/**
 * The files staged for the next prompt, one chip each, sitting inside the composer
 * above the text. It draws what it is given and takes one back — reading a file or
 * sending it is the host's business. An empty list renders nothing at all, so the
 * composer keeps its resting shape.
 */
export function PromptAttachments({
	items,
	onRemove,
	className,
}: PromptAttachmentsProps) {
	if (items.length === 0) return null

	return (
		<ul
			aria-label="Attachments"
			data-slot="prompt-attachments"
			className={cn("flex w-full flex-wrap items-center gap-1.5", className)}
		>
			{items.map((item) => (
				<li
					key={item.id}
					data-slot="prompt-attachment"
					className="flex max-w-56 items-center gap-2 rounded-xl border border-border bg-muted/40 p-1"
				>
					{item.previewUrl ? (
						<img
							alt=""
							src={item.previewUrl}
							className="size-8 shrink-0 rounded-lg object-cover"
						/>
					) : (
						<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
							<Icons.File aria-hidden="true" className="size-4" />
						</span>
					)}
					<div className="flex min-w-0 flex-col">
						<span className="truncate font-medium text-foreground text-xs">
							{item.name}
						</span>
						<span className="text-[11px] text-muted-foreground">
							{formatSize(item.size)}
						</span>
					</div>
					<Button
						type="button"
						variant="ghost"
						size="icon-xs"
						aria-label={`Remove ${item.name}`}
						onClick={() => onRemove(item.id)}
						className="rounded-full text-muted-foreground"
					>
						<Icons.Close />
					</Button>
				</li>
			))}
		</ul>
	)
}
