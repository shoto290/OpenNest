import type { ComponentProps } from "react"

import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

type ConnectionStatusState = "checking" | "ready" | "unavailable" | "crashed"

interface ConnectionStatusProps
	extends Omit<ComponentProps<"div">, "children"> {
	state: ConnectionStatusState
	/** Version of the local CLI, shown once it has answered. */
	version?: string | null
}

const CONNECTION_STATUS_COPY = {
	checking: "Checking Claude Code…",
	ready: "Claude Code ready",
	unavailable: "Claude Code unavailable",
	crashed: "Claude Code stopped",
} satisfies Record<ConnectionStatusState, string>

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
	return (
		<div
			data-slot="connection-status"
			data-state={state}
			className={cn(
				"flex items-center gap-2 text-muted-foreground text-xs",
				className,
			)}
			{...props}
		>
			<Icons.Claude aria-hidden="true" className="size-4" />
			<span
				aria-hidden="true"
				className={cn("size-1.5 rounded-full", CONNECTION_STATUS_DOT[state])}
			/>
			<span role="status">{CONNECTION_STATUS_COPY[state]}</span>
			{version ? <span className="font-mono">v{version}</span> : null}
		</div>
	)
}

export {
	ConnectionStatus,
	type ConnectionStatusProps,
	type ConnectionStatusState,
}
