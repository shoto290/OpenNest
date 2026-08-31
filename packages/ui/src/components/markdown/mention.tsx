import type { ComponentPropsWithoutRef } from "react"
import type { ExtraProps } from "react-markdown"

import {
	BOT_MENTION_ATTRIBUTE,
	BOT_MENTION_COUNT_ATTRIBUTE,
} from "@workspace/ui/components/markdown/bot-mentions"
import { Mention } from "@workspace/ui/components/mention"

export type MarkdownSpanProps = ComponentPropsWithoutRef<"span"> &
	ExtraProps & {
		[BOT_MENTION_ATTRIBUTE]?: string
		[BOT_MENTION_COUNT_ATTRIBUTE]?: string | number
	}

export const MarkdownSpan = ({
	node,
	children,
	...props
}: MarkdownSpanProps) => {
	const botId = props[BOT_MENTION_ATTRIBUTE]

	if (botId)
		return (
			<Mention
				botId={botId}
				count={Number(props[BOT_MENTION_COUNT_ATTRIBUTE] ?? 1)}
			/>
		)

	return <span {...props}>{children}</span>
}
