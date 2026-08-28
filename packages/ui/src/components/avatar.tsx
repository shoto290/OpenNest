import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

const FALLBACK_NAME = "You"

const DEFAULT_SIZE = 28

const INITIALS_RATIO = 0.4

const FRAME_CLASS = "relative block shrink-0 overflow-hidden"

const UPLOADED_IMAGE_SHAPE = "rounded-full"

const IMAGE_CLASS = `size-full object-cover ${UPLOADED_IMAGE_SHAPE}`

const INITIALS_CLASS =
	"grid size-full place-items-center rounded-full bg-sidebar-accent font-medium text-sidebar-accent-foreground uppercase leading-none"

const displayNameOf = (name?: string) => name?.trim() || FALLBACK_NAME

const initialsOf = (name: string) =>
	name
		.split(/\s+/, 2)
		.map((word) => Array.from(word)[0])
		.join("")

type AvatarFrameProps = {
	slot: string
	size: number
	image?: string
	imageClassName?: string
	overlay?: ReactNode
	className?: string
	children: ReactNode
}

const AvatarFrame = ({
	slot,
	size,
	image,
	imageClassName,
	overlay,
	className,
	children,
}: AvatarFrameProps) => (
	<span
		className={cn(FRAME_CLASS, className)}
		data-slot={slot}
		style={{ width: size, height: size }}
	>
		{image ? (
			<img
				alt=""
				aria-hidden="true"
				className={cn(IMAGE_CLASS, imageClassName)}
				src={image}
			/>
		) : (
			children
		)}
		{overlay}
	</span>
)

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
	<AvatarFrame
		className={className}
		image={image}
		size={size}
		slot="user-avatar"
	>
		<span
			aria-hidden="true"
			className={INITIALS_CLASS}
			style={{ fontSize: Math.round(size * INITIALS_RATIO) }}
		>
			{initialsOf(displayNameOf(name))}
		</span>
	</AvatarFrame>
)

export {
	Avatar,
	AvatarFrame,
	type AvatarProps,
	displayNameOf,
	UPLOADED_IMAGE_SHAPE,
}
