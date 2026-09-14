import type { ReactNode } from "react"

import { Notice } from "@workspace/ui/components/notice"
import type { RosterBot } from "@workspace/ui/components/roster"
import { useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import { describeTransportError } from "@/lib/agent/messages"
import { describeAttachmentError } from "@/lib/chat/attachments"
import type { AttachmentStoreError } from "@/lib/chat/attachments-contract"
import type { ChatError } from "@/lib/chat/chat-state"
import {
	isSignedOut,
	needsFreshSession,
	noticeTitleFor,
} from "@/lib/chat/screen-model"

type ThreadNoticeProps = {
	refusal: AttachmentStoreError | null
	onDismissRefusal: () => void
	children?: ReactNode
}

export const ThreadNotice = ({
	refusal,
	onDismissRefusal,
	children,
}: ThreadNoticeProps) => {
	const t = useChatCopy()

	if (!refusal) {
		return <>{children}</>
	}

	return (
		<Notice
			description={describeAttachmentError(t, refusal)}
			onDismiss={onDismissRefusal}
			title={t("screen.attachmentsRefused")}
			tone="warning"
		/>
	)
}

type PinsNoticeProps = {
	onDismiss: () => void
}

export const PinsNotice = ({ onDismiss }: PinsNoticeProps) => {
	const t = useChatCopy()

	return (
		<Notice
			description={t("pinned.unavailable.description")}
			onDismiss={onDismiss}
			title={t("pinned.unavailable.title")}
			tone="warning"
		/>
	)
}

type TransportNoticeProps = {
	error: ChatError
	onDismiss: (id: string) => void
	onRestart?: (id: string) => void
	onSignIn?: () => void
}

export const TransportNotice = ({
	error,
	onDismiss,
	onRestart,
	onSignIn,
}: TransportNoticeProps) => {
	const t = useChatCopy()
	const stale = needsFreshSession(error.error)
	const signIn =
		isSignedOut(error.error) && onSignIn
			? { label: t("emptyState.signIn"), onRetry: onSignIn }
			: undefined
	const restart =
		stale && onRestart
			? { label: t("screen.restart"), onRetry: () => onRestart(error.id) }
			: undefined

	return (
		<Notice
			description={
				signIn
					? t("screen.transport.notConnected")
					: describeTransportError(t, error.error)
			}
			onDismiss={() => onDismiss(error.id)}
			retry={signIn ?? restart}
			title={noticeTitleFor(t, error.error)}
			tone={stale ? "error" : "warning"}
		/>
	)
}

type ConnectorSessionNoticeProps = {
	name: string
	onOpen: () => void
	onDismiss: () => void
}

export const ConnectorSessionNotice = ({
	name,
	onOpen,
	onDismiss,
}: ConnectorSessionNoticeProps) => {
	const t = useChatCopy()

	return (
		<Notice
			action={{
				label: t("connectors.connection.session.action", { ns: "bots" }),
				onClick: onOpen,
			}}
			description={t("connectors.connection.session.description", {
				ns: "bots",
			})}
			onDismiss={onDismiss}
			title={t("connectors.connection.session.title", { ns: "bots", name })}
			tone="warning"
		/>
	)
}

type HandoverNoticeProps = {
	pair: [RosterBot, RosterBot]
	onStop: () => void
}

export const HandoverNotice = ({ pair, onStop }: HandoverNoticeProps) => {
	const t = useChatCopy()
	const named = { first: pair[0].name, second: pair[1].name }

	return (
		<Notice
			action={{ label: t("screen.handoff.stop"), onClick: onStop }}
			description={t("screen.handoff.description")}
			title={t("screen.handoff.title", named)}
			tone="warning"
		/>
	)
}
