import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

type ApplicationMarkSize = "md" | "sm"

type ApplicationMarkStyle = {
	slot: string
	glyph: string
}

const APPLICATION_MARK_STYLE = {
	md: { slot: "size-9", glyph: "size-4" },
	sm: { slot: "size-7", glyph: "size-3.5" },
} as const satisfies Record<ApplicationMarkSize, ApplicationMarkStyle>

type ApplicationMarkProps = {
	mark?: string
	size?: ApplicationMarkSize
}

const ApplicationMark = ({ mark, size = "md" }: ApplicationMarkProps) => {
	const style = APPLICATION_MARK_STYLE[size]

	return (
		<span
			aria-hidden="true"
			className={cn(
				"flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border",
				style.slot,
				!mark && "bg-muted text-muted-foreground",
			)}
			data-slot="application-mark"
		>
			{mark ? (
				<img alt="" className="size-full object-cover" src={mark} />
			) : (
				<Icons.Server className={style.glyph} />
			)}
		</span>
	)
}

export { ApplicationMark, type ApplicationMarkProps }
