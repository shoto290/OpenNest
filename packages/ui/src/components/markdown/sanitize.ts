import { defaultSchema, type Options } from "rehype-sanitize"

import { BOT_MENTION_ATTRIBUTE } from "@workspace/ui/components/markdown/bot-mentions"

export const MARKDOWN_SANITIZE_SCHEMA: Options = {
	...defaultSchema,
	clobber: [],
	attributes: {
		...defaultSchema.attributes,
		span: [...(defaultSchema.attributes?.span ?? []), BOT_MENTION_ATTRIBUTE],
	},
}
