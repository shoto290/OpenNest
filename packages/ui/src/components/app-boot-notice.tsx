import { BOOT_MARK_SIZE } from "@workspace/ui/components/app-boot-screen"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { Notice } from "@workspace/ui/components/notice"

type AppBootNoticeProps = {
	title: string
	description: string
	onRetry: () => void
}

const AppBootNotice = ({ title, description, onRetry }: AppBootNoticeProps) => (
	<div
		data-slot="app-boot-notice"
		className="flex h-svh w-full flex-col items-center justify-center gap-6 bg-background p-6"
	>
		<BotIdentityAvatar animal="rabbit" size={BOOT_MARK_SIZE} />
		<div className="w-full max-w-sm">
			<Notice description={description} retry={{ onRetry }} title={title} />
		</div>
	</div>
)

export { AppBootNotice, type AppBootNoticeProps }
