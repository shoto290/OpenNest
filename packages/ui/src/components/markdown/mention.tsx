import type { ComponentPropsWithoutRef } from "react"
import type { ExtraProps } from "react-markdown"

import { BotMention } from "@workspace/ui/components/bot-mention"
import { BOT_MENTION_ATTRIBUTE } from "@workspace/ui/components/markdown/bot-mentions"

export type MarkdownSpanProps = ComponentPropsWithoutRef<"span"> &
	ExtraProps & { [BOT_MENTION_ATTRIBUTE]?: string }

export const MarkdownSpan = ({
	node,
	children,
	...props
}: MarkdownSpanProps) => {
	const botId = props[BOT_MENTION_ATTRIBUTE]

	if (botId) return <BotMention botId={botId} />

	return <span {...props}>{children}</span>
}
