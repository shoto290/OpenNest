const FIELD_LABEL_CLASS = "font-medium text-foreground text-xs"

const FIELD_CONTROL_CLASS =
	"w-full rounded-xl border border-input bg-background px-3 py-2 text-foreground text-sm outline-none transition-[color,box-shadow,border-color] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 motion-reduce:transition-none"

/** The surface every popup in the panel shares — the popover, the model list and
 * the delete dialog. Size, radius and padding stay with each one. */
const POPUP_CLASS =
	"border border-border bg-popover text-popover-foreground shadow-xl outline-none transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 motion-reduce:transition-none"

export { FIELD_CONTROL_CLASS, FIELD_LABEL_CLASS, POPUP_CLASS }
