"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

const extensionOf = (name: string) => {
	const dot = name.lastIndexOf(".")
	return dot > 0 ? name.slice(dot + 1).toUpperCase() : ""
}

export type MessageAttachment = {
	id: string
	name: string
	/** Anything an `img` can load. Given for a file the host resolved to a picture,
	 * left out for one it could not. */
	previewUrl?: string
}

export interface MessageAttachmentsProps {
	/** The files the message carries, in the order given. */
	items: MessageAttachment[]
	/** Receives the id of the item that was activated. Opening it is the host's
	 * business: the row holds no state beyond which previews failed to load. */
	onOpen: (id: string) => void
	className?: string
}

/**
 * The files a message carries, drawn inside its bubble above the text. A picture
 * shows itself, bounded so a tall one cannot stretch the bubble; anything else
 * shows a glyph, its name and its extension. Colors are drawn from the bubble's
 * own text color, so the row reads on the reader's solid bubble and the bot's soft
 * one alike. An empty list renders nothing at all.
 */
export function MessageAttachments({
	items,
	onOpen,
	className,
}: MessageAttachmentsProps) {
	const { t } = useTranslation("chat")
	const [brokenIds, setBrokenIds] = useState<ReadonlySet<string>>(new Set())

	if (items.length === 0) return null

	const markBroken = (id: string) => setBrokenIds((ids) => new Set(ids).add(id))

	return (
		<ul
			aria-label={t("attachments.label")}
			data-slot="message-attachments"
			className={cn(
				"mt-0! mb-2! flex list-none! flex-wrap items-start gap-1.5 pl-0! last:mb-0!",
				className,
			)}
		>
			{items.map((item) => {
				const preview = brokenIds.has(item.id) ? undefined : item.previewUrl
				const Glyph = item.previewUrl ? Icons.Image : Icons.File

				return (
					<li key={item.id} data-slot="message-attachment" className="my-0!">
						<button
							type="button"
							aria-label={t("attachments.open", { name: item.name })}
							onClick={() => onOpen(item.id)}
							className={cn(
								"flex cursor-pointer items-center overflow-hidden rounded-xl border border-foreground/15 text-left outline-none transition duration-150 focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 focus-visible:ring-offset-transparent motion-reduce:transition-none",
								preview
									? "hover:opacity-90"
									: "max-w-56 gap-2 bg-foreground/5 p-1 pr-2 hover:bg-foreground/10",
							)}
						>
							{preview ? (
								<img
									alt=""
									src={preview}
									onError={() => markBroken(item.id)}
									className="block max-h-40 max-w-56 object-cover"
								/>
							) : (
								<>
									<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground/10">
										<Glyph aria-hidden="true" className="size-4" />
									</span>
									<span className="flex min-w-0 flex-col">
										<span className="truncate font-medium text-xs">
											{item.name}
										</span>
										<span className="text-[11px] tracking-wide">
											{extensionOf(item.name)}
										</span>
									</span>
								</>
							)}
						</button>
					</li>
				)
			})}
		</ul>
	)
}
