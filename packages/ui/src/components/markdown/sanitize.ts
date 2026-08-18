import { defaultSchema, type Options } from "rehype-sanitize"

/** Allowlist: anything absent is dropped, whoever authored the markdown. `script`,
 * `style` and `iframe` are not allowed tags, `on*` is not an allowed attribute and
 * `javascript:` is not an allowed protocol, so none of them can reach the DOM.
 * Ids are left alone: this schema would prefix them without touching the `href`
 * pointing at them, which breaks every footnote anchor. `rehypeScopeIds` owns
 * uniqueness instead, and rewrites the ids and their references together. */
export const MARKDOWN_SANITIZE_SCHEMA: Options = {
	...defaultSchema,
	clobber: [],
}
