import { AppBootNotice } from "@workspace/ui/components/app-boot-notice"
import { AppBootScreen } from "@workspace/ui/components/app-boot-screen"
import { useCommonCopy } from "@workspace/ui/hooks/use-common-copy"

type StartupState = {
	hasLoaded: boolean
	haveSpacesFailed: boolean
}

export const isStarting = ({ hasLoaded, haveSpacesFailed }: StartupState) =>
	haveSpacesFailed || !hasLoaded

type StartupScreenProps = {
	haveSpacesFailed: boolean
	onRetrySpaces: () => void
}

export const StartupScreen = ({
	haveSpacesFailed,
	onRetrySpaces,
}: StartupScreenProps) => {
	const t = useCommonCopy()

	if (haveSpacesFailed) {
		return (
			<AppBootNotice
				description={t("spaces.unavailable.description")}
				onRetry={onRetrySpaces}
				title={t("spaces.unavailable.title")}
			/>
		)
	}

	return <AppBootScreen data-tauri-drag-region="deep" />
}
