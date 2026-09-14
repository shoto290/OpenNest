"use client"

import { useTranslation } from "react-i18next"

import { type Icon, Icons } from "@workspace/ui/components/icons"
import { Button } from "@workspace/ui/components/ui/button"
import {
	createToastManager,
	Toast,
	ToastAction,
	ToastClose,
	ToastContent,
	ToastDescription,
	ToastPortal,
	ToastProvider,
	ToastTitle,
	ToastViewport,
	useToastManager,
} from "@workspace/ui/components/ui/toast"
import { cn } from "@workspace/ui/lib/utils"

const TRANSIENT_NOTICE_DELAY = 5000
const NOTICE_LIMIT = 3

const noticeManager = createToastManager()

type NoticeType = "error" | "info" | "loading" | "success" | "warning"

type TransientNoticeType = Exclude<NoticeType, "error">

type NoticeAction = {
	label: string
	onPress: () => void
}

type NoticeMessage = {
	title: string
	description?: string
	action?: NoticeAction
}

type TransientNotice = NoticeMessage & {
	type?: TransientNoticeType
}

type FailureNotice = NoticeMessage & {
	onClose?: () => void
}

type RaisedNotice = FailureNotice & {
	type: NoticeType
	priority: "high" | "low"
	timeout?: number
}

let raisedNoticeCount = 0

const raiseNotice = ({ action, ...notice }: RaisedNotice) => {
	raisedNoticeCount += 1
	const id = `notice-${raisedNoticeCount}`

	return noticeManager.add({
		...notice,
		actionProps: action && {
			children: action.label,
			onClick: () => {
				action.onPress()
				endNotice(id)
			},
		},
		id,
	})
}

const raiseTransientNotice = ({
	type = "success",
	...message
}: TransientNotice) => raiseNotice({ ...message, priority: "low", type })

const raiseFailureNotice = (message: FailureNotice) =>
	raiseNotice({ ...message, priority: "high", timeout: 0, type: "error" })

const endNotice = (id: string) => noticeManager.close(id)

const NOTICE_MARKS = {
	error: Icons.Error,
	info: Icons.Info,
	loading: Icons.Loading,
	success: Icons.Success,
	warning: Icons.Alert,
} satisfies Record<NoticeType, Icon>

const TOP_CENTRED_VIEWPORT =
	"top-4 bottom-auto z-100 sm:inset-x-4 sm:mx-auto sm:w-auto"

const TOP_ANCHORED_NOTICE = [
	"top-0 bottom-auto origin-top",
	"[--offset-y:calc(var(--toast-offset-y)+calc(var(--toast-index)*var(--gap))+var(--toast-swipe-movement-y))]",
	"[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)+(var(--toast-index)*var(--peek))+(var(--shrink)*var(--height))))_scale(var(--scale))]",
	"data-starting-style:[transform:translateY(-150%)]",
	"[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(-150%)]",
].join(" ")

const FADE_ONLY_UNDER_REDUCED_MOTION =
	"motion-reduce:[transition:opacity_150ms]! motion-reduce:data-starting-style:[transform:none]! motion-reduce:data-starting-style:opacity-0 motion-reduce:data-ending-style:[transform:none]! motion-reduce:data-ending-style:opacity-0"

type NoticeMarkProps = {
	type: string | undefined
}

const NoticeMark = ({ type }: NoticeMarkProps) => {
	const Mark = NOTICE_MARKS[type as NoticeType]

	if (!Mark) {
		return null
	}

	return (
		<Mark
			className={cn(
				"pointer-events-none size-4 shrink-0",
				type === "error" && "text-destructive",
				type === "loading" && "animate-spin motion-reduce:animate-none",
			)}
		/>
	)
}

const NoticeList = () => {
	const { t } = useTranslation("common")
	const { toasts } = useToastManager()

	return toasts.map((notice) => (
		<Toast
			className={cn(
				"pointer-events-auto",
				TOP_ANCHORED_NOTICE,
				FADE_ONLY_UNDER_REDUCED_MOTION,
			)}
			key={notice.id}
			swipeDirection={["up"]}
			toast={notice}
		>
			<ToastContent>
				<NoticeMark type={notice.type} />
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<ToastTitle className="break-words" />
					<ToastDescription className="break-words" />
				</div>
				<ToastAction />
				<ToastClose
					render={
						<Button
							aria-label={t("notice.close")}
							size="icon-sm"
							variant="ghost"
						/>
					}
				/>
			</ToastContent>
		</Toast>
	))
}

type NoticeSurfaceProps = {
	transientDelay?: number
}

const NoticeSurface = ({
	transientDelay = TRANSIENT_NOTICE_DELAY,
}: NoticeSurfaceProps) => {
	const { t } = useTranslation("common")

	return (
		<ToastProvider
			limit={NOTICE_LIMIT}
			timeout={transientDelay}
			toastManager={noticeManager}
		>
			<ToastPortal>
				<ToastViewport
					aria-label={t("notice.label")}
					className={TOP_CENTRED_VIEWPORT}
				>
					<NoticeList />
				</ToastViewport>
			</ToastPortal>
		</ToastProvider>
	)
}

export {
	endNotice,
	type NoticeMessage,
	NoticeSurface,
	type NoticeSurfaceProps,
	raiseFailureNotice,
	raiseTransientNotice,
	TRANSIENT_NOTICE_DELAY,
	type TransientNoticeType,
}
