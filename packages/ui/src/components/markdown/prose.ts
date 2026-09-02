export const MARKDOWN_TYPESET_CLASS = "typeset typeset-chat"

export const MARKDOWN_ESCAPED_BLOCK_CLASS = "not-typeset first:mt-0 last:mb-0"

export const MARKDOWN_WHITESPACE_CLASS =
	"whitespace-normal [&_:is(p,h1,h2,h3,h4,h5,h6,li,td,th)]:whitespace-pre-wrap [&_li:has(>:is(p,ul,ol,blockquote,div,hr))]:whitespace-normal"

export const MARKDOWN_CODE_SURFACE_CLASS =
	"[&_code]:bg-foreground/5 [&_code]:ring-1 [&_code]:ring-foreground/15 [&_pre]:my-0 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-foreground/5 [&_pre]:p-3 [&_pre]:ring-1 [&_pre]:ring-foreground/10 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:ring-0"
