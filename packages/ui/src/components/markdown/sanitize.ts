import { defaultSchema, type Options } from "rehype-sanitize"

export const MARKDOWN_SANITIZE_SCHEMA: Options = {
	...defaultSchema,
	clobber: [],
}
