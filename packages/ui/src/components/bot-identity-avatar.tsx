"use client"

import {
	BotAvatar,
	type BotAvatarBlot,
} from "@workspace/ui/components/bot-avatar"
import type { BotAvatarAnimal } from "@workspace/ui/components/bot-avatar-animals"
import type { BotAvatarState } from "@workspace/ui/components/bot-avatar-data"
import { cn } from "@workspace/ui/lib/utils"

/** What a bot holds when it is not working. One frame, the same for every bot: what
 * tells two resting bots apart is the blot behind them, not what they are doing. */
const REST_STATE: BotAvatarState = "idle"

/** What a bot is busy with, named after the pose it holds while doing it. The caller
 * reads it off the running tool. It lives here rather than beside the row that
 * displays the words, because it is the avatar that has to draw it. */
type BotWorkingKind = Extract<
	BotAvatarState,
	"thinking" | "searching" | "working" | "writing" | "waiting"
>

/** The state the engine draws for a kind of work. Only one needs translating:
 * waiting on the reader looks like listening, not like a bot doing nothing. */
const busyStateFor = (kind: BotWorkingKind): BotAvatarState =>
	kind === "waiting" ? "listening" : kind

/** A picture fills the slot the drawing would have taken, so a bot wearing one lands
 * on the same column and baseline as a bot wearing its animal. */
const IMAGE_CLASS = "size-full rounded-full border border-border object-cover"

/** The dot that says a bot is working. Sized from the avatar so it reads the same at
 * every call site, and capped so it stays a dot on a large one.
 *
 * The ring punches it out of the surface behind it, and that surface is named: every
 * place a working bot is shown today is the sidebar or the settings column beside it.
 * On a lighter or darker surface the ring reads as a faint halo rather than a hole. */
const DOT_CLASS =
	"absolute right-[6%] bottom-[6%] block rounded-full bg-sidebar-primary ring-2 ring-sidebar motion-safe:animate-pulse"

/** A roster row and a reply, which are the same box. */
const DEFAULT_SIZE = 40

const DOT_RATIO = 0.25
const DOT_MAX = 12

const dotSize = (size: number) =>
	Math.round(Math.min(size * DOT_RATIO, DOT_MAX))

type BotIdentityAvatarProps = {
	/** The animal the bot was given. Drawn unless it carries a picture. */
	animal?: BotAvatarAnimal
	/** The tint drawn behind the animal — what tells one bot from another at a
	 * glance. Leave it out and the animal is drawn on nothing. */
	blot?: BotAvatarBlot
	/** A picture its reader uploaded, already a URL the host will load. It wins over
	 * the animal and never moves: a photograph cannot act, so work is said with the
	 * dot instead. */
	image?: string
	/** Whether the bot is working. The only thing that makes this avatar move. */
	working?: boolean
	/** What the work is, while `working`. The bot's own animal performs it. */
	kind?: BotWorkingKind
	/** Rendered size in px — the only thing a call site changes. Defaults to the size
	 * a roster row and a reply draw it at, which is the one two of the four use. */
	size?: number
	className?: string
}

/**
 * A bot's face, wherever it is shown: the roster row, its settings, the replies it
 * signs, the row that says it is working. One rendering, so the four cannot drift —
 * a bot that picked a rabbit is a rabbit in all of them, and one wearing a picture
 * wears it in all of them too.
 *
 * It draws and nothing else. No name, no live region, no layout around it: the
 * surfaces that need those own them, and a live region per roster row would be a
 * dozen of them announcing at once.
 */
function BotIdentityAvatar({
	animal,
	blot,
	image,
	working = false,
	kind = "thinking",
	size = DEFAULT_SIZE,
	className,
}: BotIdentityAvatarProps) {
	return (
		<span
			className={cn("relative block shrink-0", className)}
			data-slot="bot-identity-avatar"
			style={{ width: size, height: size }}
		>
			{image ? (
				<img alt="" aria-hidden="true" className={IMAGE_CLASS} src={image} />
			) : (
				<BotAvatar
					animal={animal}
					animated={working}
					blot={blot}
					className="block"
					size={size}
					state={working ? busyStateFor(kind) : REST_STATE}
				/>
			)}
			{working ? (
				<span
					aria-hidden="true"
					className={DOT_CLASS}
					data-slot="bot-activity-dot"
					style={{ width: dotSize(size), height: dotSize(size) }}
				/>
			) : null}
		</span>
	)
}

export { BotIdentityAvatar, type BotIdentityAvatarProps, type BotWorkingKind }
