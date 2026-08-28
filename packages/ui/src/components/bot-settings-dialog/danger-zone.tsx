"use client"

import { buttonVariants } from "@workspace/ui/components/button"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { Icons } from "@workspace/ui/components/icons"
import { DANGER_BLOCK_CLASS } from "@workspace/ui/components/settings-styles"

type DangerZoneProps = {
	deleteLabel: string
	description: string
	confirmTitle: string
	onDelete: () => void
	disabledReason?: string
	defaultConfirming?: boolean
}

const DangerZone = ({
	deleteLabel,
	description,
	confirmTitle,
	onDelete,
	disabledReason,
	defaultConfirming,
}: DangerZoneProps) => (
	<div className={DANGER_BLOCK_CLASS} data-slot="danger-zone">
		<div className="flex flex-col gap-1">
			<span className="font-medium text-destructive text-sm">
				{deleteLabel}
			</span>
			<p className="text-muted-foreground text-sm">
				{disabledReason ?? description}
			</p>
		</div>
		<ConfirmDialog
			confirmLabel={deleteLabel}
			defaultOpen={defaultConfirming}
			description={description}
			isTriggerDisabled={Boolean(disabledReason)}
			onConfirm={onDelete}
			title={confirmTitle}
			trigger={
				<>
					<Icons.Delete aria-hidden="true" className="size-3.5" />
					{deleteLabel}
				</>
			}
			triggerClassName={buttonVariants({
				variant: "destructive",
				size: "sm",
			})}
		/>
	</div>
)

export { DangerZone, type DangerZoneProps }
