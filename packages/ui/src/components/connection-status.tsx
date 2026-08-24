import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

type ConnectionStatusState = "checking" | "ready" | "unavailable" | "crashed"

interface ConnectionStatusProps
	extends Omit<ComponentProps<"div">, "children"> {
	state: ConnectionStatusState
	version?: string | null
}

const CONNECTION_STATUS_DOT = {
	checking: "bg-muted-foreground motion-safe:animate-pulse",
	ready: "bg-emerald-500",
	unavailable: "bg-destructive",
	crashed: "bg-destructive",
} satisfies Record<ConnectionStatusState, string>

function ConnectionStatus({
	state,
	version,
	className,
	...props
}: ConnectionStatusProps) {
	const { t } = useTranslation("chat")

	return (
		<div
			data-slot="connection-status"
			data-state={state}
			className={cn(
				"flex items-center gap-1.5 text-muted-foreground",
				className,
			)}
			{...props}
		>
			<Icons.Claude aria-hidden="true" className="size-4" />
			<span
				aria-hidden="true"
				className={cn("size-1.5 rounded-full", CONNECTION_STATUS_DOT[state])}
			/>
			<span role="status" className="sr-only">
				{t(`connection.${state}`)}
				{version ? ` v${version}` : null}
			</span>
		</div>
	)
}

export {
	ConnectionStatus,
	type ConnectionStatusProps,
	type ConnectionStatusState,
}
