import { AppHeader } from "@workspace/ui/components/app-header"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { ChatLayout } from "@workspace/ui/components/chat-layout"
import {
	AssistantTurn,
	ChatTurnGroup,
	UserTurn,
} from "@workspace/ui/components/chat-turn"
import { Markdown } from "@workspace/ui/components/markdown"
import { PINNED_AVATAR_SIZE } from "@workspace/ui/components/pinned-messages"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import { useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import {
	bubbleIdOf,
	type TranscriptRow,
	toRuns,
	toTranscriptRows,
} from "@/lib/chat/screen-model"
import { presentParticipants } from "@/lib/conversations/roster-conversations"
import type { Conversation } from "@/lib/conversations/store-contract"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import { useTranscript } from "@/lib/conversations/use-transcript"
import { avatarSrc, hasOverlayWindowControls } from "@/lib/host"

type ConversationScreenProps = {
	conversation: Conversation
	store: TranscriptStore
}

const ConversationTurn = ({ row }: { row: TranscriptRow }) => {
	const content = <Markdown>{row.text}</Markdown>
	const anchor = bubbleIdOf(row.messageId, row.blockIndex)

	return row.role === "user" ? (
		<UserTurn copyText={row.text} messageId={anchor} state={row.completion}>
			{content}
		</UserTurn>
	) : (
		<AssistantTurn
			copyText={row.text}
			messageId={anchor}
			state={row.completion}
		>
			{content}
		</AssistantTurn>
	)
}

export function ConversationScreen({
	conversation,
	store,
}: ConversationScreenProps) {
	const t = useChatCopy()
	const transcript = useTranscript(store, conversation.id)
	const runs = toRuns(toTranscriptRows(transcript.messages))

	return (
		<ChatLayout
			composer={<PromptInput disabled />}
			header={
				<AppHeader
					data-tauri-drag-region="deep"
					insetWindowControls={hasOverlayWindowControls()}
					leading={
						<>
							{presentParticipants(conversation).map((participant) => (
								<BotIdentityAvatar
									animal={participant.avatarAnimal}
									blot={participant.avatarBlot ?? undefined}
									image={avatarSrc(participant.avatarImagePath)}
									key={participant.botId}
									name={participant.name}
									seed={participant.botId}
									size={PINNED_AVATAR_SIZE}
								/>
							))}
							{conversation.title}
						</>
					}
				/>
			}
			label={t("screen.label")}
			older={
				transcript.messages.length > 0
					? { has: transcript.hasOlder, onLoad: transcript.loadOlder }
					: undefined
			}
			transcriptKey={conversation.id}
		>
			{runs.map((run) => (
				<ChatTurnGroup key={bubbleIdOf(run[0].messageId, run[0].blockIndex)}>
					{run.map((row) => (
						<ConversationTurn
							key={bubbleIdOf(row.messageId, row.blockIndex)}
							row={row}
						/>
					))}
				</ChatTurnGroup>
			))}
		</ChatLayout>
	)
}
