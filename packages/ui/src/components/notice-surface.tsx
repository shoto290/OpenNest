"use client"

import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import {
	Close,
	createToastManager,
	Description,
	Portal,
	Provider,
	Root,
	Title,
	useToastManager,
	Viewport,
} from "@workspace/ui/components/toast"

const TRANSIENT_NOTICE_DELAY = 5000
const NOTICE_LIMIT = 3

const noticeManager = createToastManager()

type NoticeMessage = {
	title: string
	description?: string
}

const raiseTransientNotice = (message: NoticeMessage) => {
	noticeManager.add({ ...message, type: "transient", priority: "low" })
}

const raiseFailureNotice = (message: NoticeMessage) => {
	noticeManager.add({
		...message,
		type: "failure",
		priority: "high",
		timeout: 0,
	})
}

const NoticeList = () => {
	const { toasts } = useToastManager()

	return toasts.map((notice) => {
		const hasFailed = notice.type === "failure"

		return (
			<Root
				className={hasFailed ? "border-destructive" : undefined}
				key={notice.id}
				toast={notice}
			>
				{hasFailed ? (
					<Icons.Alert
						aria-hidden="true"
						className="mt-0.5 size-4 shrink-0 text-destructive"
					/>
				) : null}
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<Title />
					<Description />
				</div>
				<Close />
			</Root>
		)
	})
}

type NoticeSurfaceProps = {
	transientDelay?: number
}

const NoticeSurface = ({
	transientDelay = TRANSIENT_NOTICE_DELAY,
}: NoticeSurfaceProps) => {
	const { t } = useTranslation("common")

	return (
		<Provider
			limit={NOTICE_LIMIT}
			timeout={transientDelay}
			toastManager={noticeManager}
		>
			<Portal>
				<Viewport aria-label={t("notice.label")}>
					<NoticeList />
				</Viewport>
			</Portal>
		</Provider>
	)
}

export {
	type NoticeMessage,
	NoticeSurface,
	type NoticeSurfaceProps,
	raiseFailureNotice,
	raiseTransientNotice,
	TRANSIENT_NOTICE_DELAY,
}
