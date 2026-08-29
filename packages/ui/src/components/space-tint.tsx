import {
	type BotAvatarBlot,
	blotTint,
} from "@workspace/ui/components/bot-avatar"
import { cn } from "@workspace/ui/lib/utils"

const UNTINTED = "border border-border bg-muted"

type SpaceTintProps = {
	tint?: BotAvatarBlot | null
	className?: string
}

const SpaceTint = ({ tint, className }: SpaceTintProps) => (
	<span
		aria-hidden="true"
		className={cn(
			"block size-4 shrink-0 rounded-full",
			!tint && UNTINTED,
			className,
		)}
		data-slot="space-tint"
		data-tint={tint}
		style={tint ? { backgroundColor: blotTint(tint) } : undefined}
	/>
)

export { SpaceTint, type SpaceTintProps }
