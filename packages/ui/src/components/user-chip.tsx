"use client"

import { AnimatedSidebarMenuButton } from "@workspace/ui/components/motion/animated-sidebar"
import { displayNameOf, UserAvatar } from "@workspace/ui/components/user-avatar"
import { cn } from "@workspace/ui/lib/utils"

const CHIP =
	"min-w-0 flex-1 px-1 group-data-[state=collapsed]/sidebar:size-9 group-data-[state=collapsed]/sidebar:flex-none"

type UserChipIdentity = {
	name?: string
	image?: string
}

type UserChipProps = UserChipIdentity & {
	onOpen?: () => void
	className?: string
}

const UserChip = ({ name, image, onOpen, className }: UserChipProps) => {
	const displayName = displayNameOf(name)

	return (
		<AnimatedSidebarMenuButton
			className={cn(CHIP, className)}
			icon={<UserAvatar image={image} name={displayName} />}
			label={displayName}
			onSelect={onOpen}
		>
			{displayName}
		</AnimatedSidebarMenuButton>
	)
}

export { UserChip, type UserChipIdentity, type UserChipProps }
