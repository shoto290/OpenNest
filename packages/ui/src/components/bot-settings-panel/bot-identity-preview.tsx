import { BotAvatar } from "@workspace/ui/components/bot-avatar"
import type { BotIdentity } from "@workspace/ui/components/bot-settings-panel/types"
import { cn } from "@workspace/ui/lib/utils"

type BotIdentityPreviewProps = {
	identity: BotIdentity
	name: string
	/** The only reason this avatar ever moves. An identity pose is a still
	 * character, so the animal animates while a run is in flight and holds a
	 * single frame the rest of the time. */
	working: boolean
	size: number
}

const BotIdentityPreview = ({
	identity,
	name,
	working,
	size,
}: BotIdentityPreviewProps) => {
	const activity = `${name.trim() || "This bot"} is ${working ? "working" : "idle"}`

	return (
		<span
			className="relative block"
			data-slot="bot-identity-preview"
			style={{ width: size, height: size }}
		>
			{identity.image ? (
				<>
					<img
						alt=""
						aria-hidden="true"
						className="size-full rounded-full border border-border object-cover"
						src={identity.image}
					/>
					<span
						aria-hidden="true"
						className={cn(
							"absolute right-[6%] bottom-[6%] block size-3 rounded-full border-2 border-sidebar",
							working
								? "bg-emerald-500 motion-safe:animate-pulse"
								: "bg-muted-foreground",
						)}
						data-slot="bot-activity-dot"
					/>
					<span className="sr-only" role="status">
						{activity}
					</span>
				</>
			) : (
				<BotAvatar
					animal={identity.animal}
					animated={working}
					className="block"
					size={size}
					state={working ? "working" : identity.pose}
				/>
			)}
		</span>
	)
}

export { BotIdentityPreview, type BotIdentityPreviewProps }
