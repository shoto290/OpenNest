import {
	type BotAvatarBlot,
	blotTint,
} from "@workspace/ui/components/bot-avatar"
import { cn } from "@workspace/ui/lib/utils"

type SpaceTintProps = {
	tint: BotAvatarBlot
	className?: string
}

const SpaceTint = ({ tint, className }: SpaceTintProps) => (
	<span
		aria-hidden="true"
		className={cn("block size-4 shrink-0 rounded-full", className)}
		data-slot="space-tint"
		data-tint={tint}
		style={{ backgroundColor: blotTint(tint) }}
	/>
)

export { SpaceTint, type SpaceTintProps }
