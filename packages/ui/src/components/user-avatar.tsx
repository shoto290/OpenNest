import { cn } from "@workspace/ui/lib/utils"

/** What a reader with no display name is called — in the sidebar chip, and in the
 * breadcrumb of the settings that chip opens. */
const FALLBACK_NAME = "You"

/** A footer row and a breadcrumb, which are the same box. */
const DEFAULT_SIZE = 28

/** The initials scale with the picture they stand in for, so one rendering serves
 * every call site without a second size table. */
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

type UserAvatarProps = {
	/** The reader's own name, as the host spells it. Empty, and the initials are
	 * taken from `You` rather than left blank. */
	name?: string
	/** A picture the reader uploaded, already a URL the host will load. It wins over
	 * the initials. */
	image?: string
	/** Rendered size in px — the only thing a call site changes. */
	size?: number
	className?: string
}

/**
 * The reader's own face, wherever it is shown: the sidebar chip and the breadcrumb
 * of their settings. One rendering, so the two cannot drift — a reader who uploaded
 * a picture wears it in both, and one who did not wears the same initials in both.
 *
 * It draws and nothing else: no name beside it, no layout around it, no press
 * target. The rows that need those own them.
 */
const UserAvatar = ({
	name,
	image,
	size = DEFAULT_SIZE,
	className,
}: UserAvatarProps) => (
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

export { displayNameOf, UserAvatar, type UserAvatarProps }
