import type { ComponentProps, ReactNode } from "react"

import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

type EmptyStateDataAttributes = {
	"data-slot": string
	[attribute: `data-${string}`]: string
}

type EmptyStateShellProps = Omit<
	ComponentProps<"div">,
	"children" | "title"
> & {
	mark: ReactNode
	title: string
	description: string
	action?: ReactNode
	hint?: string
} & EmptyStateDataAttributes

const EmptyStateShell = ({
	mark,
	title,
	description,
	action,
	hint,
	className,
	...props
}: EmptyStateShellProps) => (
	<div
		className={cn(
			"flex w-full flex-col items-center gap-5 px-6 py-12 text-center",
			className,
		)}
		{...props}
	>
		{mark}

		<div className="flex max-w-md flex-col gap-2">
			<h2 className="font-heading font-medium text-foreground text-lg">
				{title}
			</h2>
			<p className="text-muted-foreground text-sm">{description}</p>
		</div>

		{action}

		{hint ? (
			<p className="flex items-center gap-1.5 text-muted-foreground text-xs">
				{hint}
				<Icons.ArrowDown aria-hidden="true" className="size-3.5" />
			</p>
		) : null}
	</div>
)

export { EmptyStateShell, type EmptyStateShellProps }
