import type { Components } from "react-markdown"

import {
	MarkdownCode,
	MarkdownPre,
} from "@workspace/ui/components/markdown/code"
import { MarkdownLink } from "@workspace/ui/components/markdown/link"
import { MarkdownTable } from "@workspace/ui/components/markdown/table"
import { MarkdownTaskCheckbox } from "@workspace/ui/components/markdown/task-list"

/** Every element that owns a dedicated renderer module; the rest keeps the parser default. */
export const MARKDOWN_COMPONENTS: Components = {
	a: MarkdownLink,
	code: MarkdownCode,
	input: MarkdownTaskCheckbox,
	pre: MarkdownPre,
	table: MarkdownTable,
}
