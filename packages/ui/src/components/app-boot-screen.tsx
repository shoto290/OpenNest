import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"

import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { cn } from "@workspace/ui/lib/utils"

/** The scale the chat empty state settles into, so the window opens on the size the
 * mark keeps rather than on a splash that shrinks. */
const MARK_SIZE = 64

type AppBootScreenProps = Omit<ComponentProps<"div">, "children">

/**
 * What the window holds before the record has answered: the background of the
 * palette in force, and the product's own animal working on it — no bot has been
 * read yet, so there is no bot whose face this could be. No copy and no progress: a
 * launch that reads one file is over before a sentence about it could be, and the
 * mark moving is what says the app is doing something. Whoever is listening rather
 * than looking is told once, since nothing is drawn for them to read.
 *
 * It knows nothing about what it is waiting for: a host mounts it while its first
 * read is in flight and replaces it with the screen the answer calls for.
 */
function AppBootScreen({ className, ...props }: AppBootScreenProps) {
	const { t } = useTranslation("common")

	return (
		<div
			data-slot="app-boot-screen"
			className={cn(
				"flex h-svh w-full items-center justify-center bg-background",
				className,
			)}
			{...props}
		>
			<BotIdentityAvatar
				animal="rabbit"
				kind="working"
				size={MARK_SIZE}
				working
			/>
			<span className="sr-only" role="status">
				{t("boot.status")}
			</span>
		</div>
	)
}

export { AppBootScreen, type AppBootScreenProps }
