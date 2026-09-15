import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

type ApplicationMarkSize = "md" | "sm" | "xsm" | "xs"

type ApplicationMarkStyle = {
	slot: string
	glyph: string
}

const APPLICATION_MARK_STYLE = {
	md: { slot: "size-9 rounded-md", glyph: "size-4" },
	sm: { slot: "size-7 rounded-md", glyph: "size-3.5" },
	xsm: { slot: "size-6 rounded-sm", glyph: "size-3" },
	xs: { slot: "size-5 rounded-sm", glyph: "size-3" },
} as const satisfies Record<ApplicationMarkSize, ApplicationMarkStyle>

type ApplicationMarkProps = {
	mark?: string
	size?: ApplicationMarkSize
	isBlank?: boolean
}

const ApplicationMark = ({
	mark,
	size = "md",
	isBlank = false,
}: ApplicationMarkProps) => {
	const style = APPLICATION_MARK_STYLE[size]

	return (
		<span
			aria-hidden="true"
			className={cn(
				"flex shrink-0 items-center justify-center overflow-hidden border border-border",
				style.slot,
				!mark && "bg-muted text-muted-foreground",
			)}
			data-slot="application-mark"
		>
			{mark ? (
				<img alt="" className="size-full object-cover" src={mark} />
			) : (
				!isBlank && <Icons.Server className={style.glyph} />
			)}
		</span>
	)
}

export { ApplicationMark, type ApplicationMarkProps }
