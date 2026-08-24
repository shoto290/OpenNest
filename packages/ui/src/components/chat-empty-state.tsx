import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"

import type { BotAvatarBlot } from "@workspace/ui/components/bot-avatar"
import type { BotAvatarAnimal } from "@workspace/ui/components/bot-avatar-animals"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

type ChatEmptyStateStatus = "ready" | "unavailable"

interface ChatEmptyStateProps extends Omit<ComponentProps<"div">, "children"> {
	status?: ChatEmptyStateStatus
	onSetup?: () => void
	/** Offers the way into this bot's settings, under the copy and above the hint.
	 * An empty conversation is the one screen with room for it: nothing has been
	 * said yet, so describing the bot is still worth offering beside the first
	 * prompt. Omit it and the hint stands alone. */
	onOpenSettings?: () => void
	/** The bot this empty conversation belongs to. It titles the screen, so a reader
	 * knows which of their bots they are about to talk to. Without it the screen
	 * falls back to naming the product. */
	name?: string
	/** The animal that bot was given. Drawn as the mark unless it wears a picture. */
	animal?: BotAvatarAnimal
	/** The tint that bot was marked with — what tells its screen from another's. */
	blot?: BotAvatarBlot
	/** The bot's id, which is what the shape of its blot is derived from. */
	seed?: string
	/** The picture that bot wears, if it wears one. It wins over the animal. */
	image?: string
}

/** Larger than the 40 a roster row draws, so the face reads as the ornament of the
 * heading under it rather than as a row that lost its list. */
const MARK_SIZE = 64

function ChatEmptyState({
	status = "ready",
	onSetup,
	onOpenSettings,
	name,
	animal,
	blot,
	seed,
	image,
	className,
	...props
}: ChatEmptyStateProps) {
	const { t } = useTranslation("chat")
	const title = t(`emptyState.${status}.title`)
	const description = t(`emptyState.${status}.description`)
	const isReady = status === "ready"

	return (
		<div
			data-slot="chat-empty-state"
			data-status={status}
			className={cn(
				"flex w-full flex-col items-center gap-5 px-6 py-12 text-center",
				className,
			)}
			{...props}
		>
			{isReady ? (
				<BotIdentityAvatar
					animal={animal}
					blot={blot}
					image={image}
					name={name}
					seed={seed}
					size={MARK_SIZE}
				/>
			) : (
				<span className="flex size-12 items-center justify-center rounded-2xl border border-destructive bg-destructive/10 text-destructive">
					<Icons.Alert aria-hidden="true" className="size-6" />
				</span>
			)}

			<div className="flex max-w-md flex-col gap-2">
				<h2 className="font-heading font-medium text-foreground text-lg">
					{isReady && name ? name : title}
				</h2>
				<p className="text-muted-foreground text-sm">{description}</p>
			</div>

			{isReady ? (
				<>
					{onOpenSettings ? (
						<Button onClick={onOpenSettings} variant="outline">
							<Icons.Settings aria-hidden="true" />
							{t("emptyState.settings")}
						</Button>
					) : null}
					<p className="flex items-center gap-1.5 text-muted-foreground text-xs">
						{t("emptyState.hint")}
						<Icons.ArrowDown aria-hidden="true" className="size-3.5" />
					</p>
				</>
			) : (
				<Button onClick={onSetup}>{t("emptyState.setup")}</Button>
			)}
		</div>
	)
}

export { ChatEmptyState, type ChatEmptyStateProps, type ChatEmptyStateStatus }
