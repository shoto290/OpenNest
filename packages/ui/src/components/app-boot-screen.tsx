import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"

import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { cn } from "@workspace/ui/lib/utils"

const MARK_SIZE = 64

type AppBootScreenProps = Omit<ComponentProps<"div">, "children">

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
