import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"

import type { BotAvatarBlot } from "@workspace/ui/components/bot-avatar"
import type { BotAvatarAnimal } from "@workspace/ui/components/bot-avatar-animals"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { Button } from "@workspace/ui/components/button"
import { EmptyStateShell } from "@workspace/ui/components/empty-state-shell"
import { Icons } from "@workspace/ui/components/icons"

type ChatEmptyStateStatus = "ready" | "unavailable"

interface ChatEmptyStateProps extends Omit<ComponentProps<"div">, "children"> {
	status?: ChatEmptyStateStatus
	onSetup?: () => void
	onOpenSettings?: () => void
	name?: string
	animal?: BotAvatarAnimal
	blot?: BotAvatarBlot
	seed?: string
	image?: string
}

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
	...props
}: ChatEmptyStateProps) {
	const { t } = useTranslation("chat")
	const isReady = status === "ready"

	const settingsAction = onOpenSettings ? (
		<Button onClick={onOpenSettings} variant="outline">
			<Icons.Settings aria-hidden="true" />
			{t("emptyState.settings")}
		</Button>
	) : null

	const setupAction = <Button onClick={onSetup}>{t("emptyState.setup")}</Button>

	const botMark = (
		<BotIdentityAvatar
			animal={animal}
			blot={blot}
			image={image}
			name={name}
			seed={seed}
			size={MARK_SIZE}
		/>
	)

	const alertMark = (
		<span className="flex size-12 items-center justify-center rounded-2xl border border-destructive bg-destructive/10 text-destructive">
			<Icons.Alert aria-hidden="true" className="size-6" />
		</span>
	)

	return (
		<EmptyStateShell
			action={isReady ? settingsAction : setupAction}
			data-slot="chat-empty-state"
			data-status={status}
			description={t(`emptyState.${status}.description`)}
			hint={isReady ? t("emptyState.hint") : undefined}
			mark={isReady ? botMark : alertMark}
			title={isReady && name ? name : t(`emptyState.${status}.title`)}
			{...props}
		/>
	)
}

export { ChatEmptyState, type ChatEmptyStateProps, type ChatEmptyStateStatus }
