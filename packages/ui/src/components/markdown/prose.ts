const INLINE_PROSE =
	"[&_a]:font-medium [&_a]:underline [&_a]:underline-offset-4 [&_code]:rounded [&_code]:bg-background/60 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] [&_del]:text-foreground/70 [&_strong]:font-semibold"

const BLOCK_PROSE =
	"[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_blockquote]:my-2 [&_blockquote]:border-border [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-foreground/70 [&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:font-heading [&_h1]:font-semibold [&_h1]:text-lg [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:font-heading [&_h2]:font-semibold [&_h2]:text-base [&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:font-semibold [&_h3]:text-sm [&_h4]:mt-3 [&_h4]:mb-1.5 [&_h4]:font-medium [&_h4]:text-sm [&_h5]:mt-3 [&_h5]:mb-1.5 [&_h5]:font-medium [&_h5]:text-foreground/70 [&_h5]:text-sm [&_h6]:mt-3 [&_h6]:mb-1.5 [&_h6]:font-semibold [&_h6]:text-foreground/70 [&_h6]:text-xs [&_h6]:uppercase [&_h6]:tracking-wide [&_hr]:my-4 [&_hr]:border-border [&_p+p]:mt-2 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-background/60 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0"

const LIST_PROSE =
	"[&_li>ol]:my-1 [&_li>ul]:my-1 [&_li]:my-0.5 [&_li_input]:mr-1.5 [&_li_input]:align-[-0.1em] [&_li_input]:accent-primary [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul_ul]:list-[circle] [&_ul_ul_ul]:list-[square] [&_.task-list-item]:list-none"

const FOOTNOTE_PROSE =
	"[&_.footnotes]:mt-4 [&_.footnotes]:border-border [&_.footnotes]:border-t [&_.footnotes]:pt-2 [&_.footnotes]:text-foreground/70 [&_.footnotes]:text-xs [&_.footnotes_p]:inline"

export const MARKDOWN_PROSE_CLASS = `${INLINE_PROSE} ${BLOCK_PROSE} ${LIST_PROSE} ${FOOTNOTE_PROSE}`

export const MARKDOWN_WHITESPACE_CLASS =
	"whitespace-normal [&_:is(p,h1,h2,h3,h4,h5,h6,li,td,th)]:whitespace-pre-wrap [&_li:has(>:is(p,ul,ol,blockquote,div,hr))]:whitespace-normal"

export const MARKDOWN_CODE_SURFACE_CLASS =
	"[&_code]:bg-foreground/5 [&_code]:ring-1 [&_code]:ring-foreground/15 [&_pre]:my-0 [&_pre]:bg-foreground/5 [&_pre]:ring-1 [&_pre]:ring-foreground/10 [&_pre_code]:ring-0"
