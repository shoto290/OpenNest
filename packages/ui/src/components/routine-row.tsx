"use client"

import { useId } from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "@workspace/ui/components/badge"
import { buttonVariants } from "@workspace/ui/components/button"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { Icons } from "@workspace/ui/components/icons"
import { Switch } from "@workspace/ui/components/switch"

type RoutineRowModel = {
	id: string
	title: string
	triggerSourceTitle: string
	isEnabled: boolean
	hasStoppedItself: boolean
}

type RoutineRowProps = RoutineRowModel & {
	onEnabledChange: (isEnabled: boolean) => void
	onDelete: () => void | Promise<void>
	onOpen?: () => void
}

const RoutineRow = ({
	id,
	title,
	triggerSourceTitle,
	isEnabled,
	hasStoppedItself,
	onEnabledChange,
	onDelete,
	onOpen,
}: RoutineRowProps) => {
	const { t } = useTranslation("chat")
	const titleId = useId()

	const identity = (
		<>
			<span className="truncate font-medium text-sm" id={titleId}>
				{title}
			</span>
			<span className="flex min-w-0 items-center gap-1.5">
				<span className="truncate text-muted-foreground text-xs">
					{triggerSourceTitle}
				</span>
				{hasStoppedItself ? (
					<Badge data-slot="routine-stopped" variant="destructive">
						{t("routines.row.stopped")}
					</Badge>
				) : null}
			</span>
		</>
	)

	return (
		<li
			className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 p-2.5"
			data-slot="routine-row"
		>
			{onOpen ? (
				<button
					className="flex min-w-0 flex-1 flex-col gap-1 rounded-lg text-start outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
					data-opens={id}
					onClick={onOpen}
					type="button"
				>
					{identity}
				</button>
			) : (
				<div className="flex min-w-0 flex-1 flex-col gap-1">{identity}</div>
			)}
			<Switch
				aria-labelledby={titleId}
				checked={isEnabled}
				onCheckedChange={onEnabledChange}
			/>
			<ConfirmDialog
				confirmLabel={t("routines.confirm.label")}
				description={t("routines.confirm.description")}
				failureLabel={t("routines.confirm.failure")}
				onConfirm={onDelete}
				title={t("routines.confirm.title", { title })}
				trigger={
					<>
						<Icons.Delete aria-hidden="true" className="size-4" />
						<span className="sr-only">
							{t("routines.row.delete", { title })}
						</span>
					</>
				}
				triggerClassName={buttonVariants({ variant: "ghost", size: "icon-sm" })}
			/>
		</li>
	)
}

export { RoutineRow, type RoutineRowModel, type RoutineRowProps }
