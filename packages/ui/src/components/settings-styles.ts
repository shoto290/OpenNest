const FIELD_LABEL_CLASS = "font-medium text-foreground text-xs"

const FIELD_CONTROL_CLASS =
	"w-full rounded-xl border border-input bg-background px-3 py-2 text-foreground text-sm outline-none transition-[color,box-shadow,border-color] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 motion-reduce:transition-none"

/** The dimmed page behind every overlay — the settings dialog, the model list's
 * own popup and the delete confirmation standing over either. */
const BACKDROP_CLASS =
	"fixed inset-0 z-50 bg-foreground/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none"

/** The surface every popup shares — the settings dialog, the model list and the
 * delete confirmation. Size, radius and padding stay with each one. */
const POPUP_CLASS =
	"border border-border bg-popover text-popover-foreground shadow-xl outline-none transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 motion-reduce:transition-none"

/** The same elevation as `POPUP_CLASS`, expressed as a filter. What a popup
 * whose shape is clipped has to use: a box-shadow is cut away with the clip, and
 * a shadow drawn under a goo filter is hardened into a slab by it. */
const POPUP_DROP_SHADOW_CLASS =
	"[filter:drop-shadow(0_10px_18px_rgba(0,0,0,0.14))]"

export {
	BACKDROP_CLASS,
	FIELD_CONTROL_CLASS,
	FIELD_LABEL_CLASS,
	POPUP_CLASS,
	POPUP_DROP_SHADOW_CLASS,
}
