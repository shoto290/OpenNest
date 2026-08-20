"use client"

import { AnimatedSidebarMenuButton } from "@workspace/ui/components/motion/animated-sidebar"
import { cn } from "@workspace/ui/lib/utils"

/** What the chip reads when the host has no name to give — a reader with no
 * display name still has to recognise the way into their own settings. */
const FALLBACK_NAME = "You"

/** Smaller than a roster row's avatar: the chip is a footer row, not a bot, and
 * it still lands well inside the rail once the panel collapses. */
const AVATAR = "block size-7 shrink-0 overflow-hidden rounded-full"
const AVATAR_IMAGE = "size-full object-cover"
const AVATAR_INITIALS =
	"grid size-full place-items-center bg-sidebar-accent font-medium text-[11px] text-sidebar-accent-foreground uppercase leading-none"

/** The picture is inset from the leading edge by exactly what the row's height
 * leaves above and below it, so the chip reads as one square-set avatar with a
 * name after it rather than an avatar pushed off its own corner.
 *
 * On the rail the name is gone and the row stops taking what it no longer draws:
 * it holds the height it has beside a name, gives the same inset to all four
 * edges, and is the square target that leaves — never a band down the rail. */
const CHIP =
	"min-w-0 flex-1 px-1 group-data-[state=collapsed]/sidebar:size-9 group-data-[state=collapsed]/sidebar:flex-none"

const displayNameOf = (name?: string) => name?.trim() || FALLBACK_NAME

const initialsOf = (name: string) =>
	name
		.split(/\s+/, 2)
		.map((word) => Array.from(word)[0])
		.join("")

type UserChipIdentity = {
	/** The reader's own name, as the host spells it. Empty, and the chip reads
	 * `You` rather than nothing. */
	name?: string
	/** A picture the reader uploaded, already a URL the host will load. It wins
	 * over the initials. */
	image?: string
}

type UserChipProps = UserChipIdentity & {
	/** Fired once per activation — the chip is the only way into the settings, so
	 * it opens them and does nothing else. */
	onOpen?: () => void
	className?: string
}

/**
 * The reader's own row, pinned under a sidebar list. It carries the picture and
 * the display name, falls back to the initials of that name when there is no
 * picture, and clips a long name to one line. On the rail the picture is left
 * alone and centred, and the name stays the button's accessible name.
 */
const UserChip = ({ name, image, onOpen, className }: UserChipProps) => {
	const displayName = displayNameOf(name)

	return (
		<AnimatedSidebarMenuButton
			className={cn(CHIP, className)}
			icon={
				<span className={AVATAR} data-slot="user-chip-avatar">
					{image ? (
						<img
							alt=""
							aria-hidden="true"
							className={AVATAR_IMAGE}
							src={image}
						/>
					) : (
						<span aria-hidden="true" className={AVATAR_INITIALS}>
							{initialsOf(displayName)}
						</span>
					)}
				</span>
			}
			label={displayName}
			onSelect={onOpen}
		>
			{displayName}
		</AnimatedSidebarMenuButton>
	)
}

export { UserChip, type UserChipIdentity, type UserChipProps }
