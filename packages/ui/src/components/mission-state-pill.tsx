import type { VariantProps } from "class-variance-authority"
import { useTranslation } from "react-i18next"

import { Badge, type badgeVariants } from "@workspace/ui/components/badge"
import { type Icon, Icons } from "@workspace/ui/components/icons"
import type { MissionState } from "@workspace/ui/components/mission"
import { cn } from "@workspace/ui/lib/utils"

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>

const MISSION_STATE_MARK: Record<MissionState, Icon> = {
	working: Icons.Loading,
	waiting_bot: Icons.Pending,
	waiting_human: Icons.Bell,
	ready_to_merge: Icons.Check,
	failed: Icons.Error,
	done: Icons.Success,
}

const MISSION_STATE_MARK_CLASS: Record<MissionState, string> = {
	working: "animate-spin text-muted-foreground motion-reduce:animate-none",
	waiting_bot: "text-muted-foreground",
	waiting_human: "text-bot-badge-attention",
	ready_to_merge: "text-bot-badge-done",
	failed: "text-destructive",
	done: "text-muted-foreground",
}

const MISSION_STATE_VARIANT: Record<MissionState, BadgeVariant> = {
	working: "secondary",
	waiting_bot: "secondary",
	waiting_human: "outline",
	ready_to_merge: "outline",
	failed: "destructive",
	done: "secondary",
}

type MissionStatePillProps = {
	state: MissionState
	className?: string
}

const MissionStatePill = ({ state, className }: MissionStatePillProps) => {
	const { t } = useTranslation("chat")
	const Mark = MISSION_STATE_MARK[state]

	return (
		<Badge
			className={className}
			data-slot="mission-state-pill"
			data-state={state}
			variant={MISSION_STATE_VARIANT[state]}
		>
			<Mark
				aria-hidden="true"
				className={cn("shrink-0", MISSION_STATE_MARK_CLASS[state])}
				data-icon="inline-start"
			/>
			{t(`missions.state.${state}`)}
		</Badge>
	)
}

export { MissionStatePill, type MissionStatePillProps }
