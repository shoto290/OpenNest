"use client"

import { useTranslation } from "react-i18next"

import type { BotAvatarBlot } from "@workspace/ui/components/bot-avatar"
import type { BotAvatarAnimal } from "@workspace/ui/components/bot-avatar-animals"
import {
	BotIdentityAvatar,
	type BotWorkingKind,
} from "@workspace/ui/components/bot-identity-avatar"
import { Button } from "@workspace/ui/components/button"
import {
	ConnectionStatus,
	type ConnectionStatusState,
} from "@workspace/ui/components/connection-status"
import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

const AVATAR_SIZE = 24

const HEADER_IDENTITY_CLASS = "h-9 min-w-0 shrink gap-2 pr-2.5 pl-1.5"

type HeaderIdentityButtonProps = {
	name: string
	animal?: BotAvatarAnimal
	blot?: BotAvatarBlot
	seed?: string
	image?: string
	working?: boolean
	kind?: BotWorkingKind
	connection: ConnectionStatusState
	version?: string | null
	isSettingsOpen?: boolean
	onOpenSettings?: () => void
	className?: string
}

const HeaderIdentityButton = ({
	name,
	animal,
	blot,
	seed,
	image,
	working,
	kind,
	connection,
	version,
	isSettingsOpen = false,
	onOpenSettings,
	className,
}: HeaderIdentityButtonProps) => {
	const { t } = useTranslation("chat")

	return (
		<Button
			aria-expanded={isSettingsOpen}
			aria-label={t("screen.identity", { name })}
			className={cn(HEADER_IDENTITY_CLASS, className)}
			data-slot="header-identity-button"
			onClick={onOpenSettings}
			variant="ghost"
		>
			<BotIdentityAvatar
				animal={animal}
				blot={blot}
				image={image}
				kind={kind}
				name={name}
				seed={seed}
				size={AVATAR_SIZE}
				working={working}
			/>
			<span className="min-w-0 truncate">{name}</span>
			<ConnectionStatus
				className="shrink-0"
				state={connection}
				version={version}
			/>
			<Icons.Settings aria-hidden="true" className="text-muted-foreground" />
		</Button>
	)
}

export {
	HEADER_IDENTITY_CLASS,
	HeaderIdentityButton,
	type HeaderIdentityButtonProps,
}
