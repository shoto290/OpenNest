import { cn } from "@workspace/ui/lib/utils"

const FALLBACK_NAME = "You"

const DEFAULT_SIZE = 28

const INITIALS_RATIO = 0.4

const AVATAR_CLASS = "block shrink-0 overflow-hidden rounded-full"

const IMAGE_CLASS = "size-full object-cover"

const INITIALS_CLASS =
	"grid size-full place-items-center bg-sidebar-accent font-medium text-sidebar-accent-foreground uppercase leading-none"

const displayNameOf = (name?: string) => name?.trim() || FALLBACK_NAME

const initialsOf = (name: string) =>
	name
		.split(/\s+/, 2)
		.map((word) => Array.from(word)[0])
		.join("")

type AvatarProps = {
	name?: string
	image?: string
	size?: number
	className?: string
}

const Avatar = ({
	name,
	image,
	size = DEFAULT_SIZE,
	className,
}: AvatarProps) => (
	<span
		className={cn(AVATAR_CLASS, className)}
		data-slot="user-avatar"
		style={{ width: size, height: size }}
	>
		{image ? (
			<img alt="" aria-hidden="true" className={IMAGE_CLASS} src={image} />
		) : (
			<span
				aria-hidden="true"
				className={INITIALS_CLASS}
				style={{ fontSize: Math.round(size * INITIALS_RATIO) }}
			>
				{initialsOf(displayNameOf(name))}
			</span>
		)}
	</span>
)

export { Avatar, type AvatarProps, displayNameOf }
