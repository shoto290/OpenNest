const FIELD_LABEL_CLASS = "font-medium text-foreground text-xs"

const FIELD_CONTROL_CLASS =
	"w-full rounded-xl border border-input bg-background px-3 py-2 text-foreground text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"

/** The chosen option is the filled tile, the way a selected row in the system's
 * select is: one neutral surface and a name that stops being muted. No outline
 * around it — a ring on a round swatch reads as a second, competing edge, and a
 * tint would fight the colours the swatches are there to show. */
const FIELD_OPTION_CLASS =
	"flex cursor-pointer flex-col items-center gap-1 rounded-xl p-1.5 text-muted-foreground hover:bg-muted has-[:checked]:bg-muted has-[:checked]:font-medium has-[:checked]:text-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"

/** What a picture is dropped on, pasted into or pressed to browse from, whatever
 * shape it wears: the dashed zone a bot's picture takes and the round control the
 * reader's own picture is. Shape, size and padding stay with each one, and
 * `data-dragging` is the file held over it. */
const PICTURE_TARGET_CLASS =
	"cursor-pointer border border-border outline-none hover:border-primary/50 hover:bg-muted focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/30 data-dragging:border-primary data-dragging:bg-primary/10"

/** The bar every settings dialog opens with: the reader's or the bot's face, then
 * its name. Its leading inset is the face's own — `(header - face) / 2` — while the
 * trailing side leaves room for the close button pinned over it. */
const SETTINGS_HEADER_CLASS =
	"flex shrink-0 items-center gap-2.5 border-border border-b py-4 pr-14 pl-4"

/** The dimmed page behind every overlay — the settings dialog, the model list's
 * own popup and the delete confirmation standing over either. */
const BACKDROP_CLASS =
	"fixed inset-0 z-50 bg-foreground/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none"

/** The surface every popup shares — the settings dialog, the model list and the
 * delete confirmation. Size, radius and padding stay with each one. It draws
 * only the surface: a menu opening off a control appears outright. */
const POPUP_CLASS =
	"border border-border bg-popover text-popover-foreground shadow-xl outline-none"

/** `POPUP_CLASS` for a modal — the settings dialog and the delete confirmation.
 * A modal is the one surface that still animates in: it takes the whole screen
 * away, and growing into place is what says so. A menu hanging off a button is
 * not a modal and does not take this. */
const DIALOG_POPUP_CLASS = `${POPUP_CLASS} transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 motion-reduce:transition-none`

/** The same elevation as `POPUP_CLASS`, expressed as a filter. What a popup
 * whose shape is clipped has to use: a box-shadow is cut away with the clip. */
const POPUP_DROP_SHADOW_CLASS =
	"[filter:drop-shadow(0_10px_18px_rgba(0,0,0,0.14))]"

export {
	BACKDROP_CLASS,
	DIALOG_POPUP_CLASS,
	FIELD_CONTROL_CLASS,
	FIELD_LABEL_CLASS,
	FIELD_OPTION_CLASS,
	PICTURE_TARGET_CLASS,
	POPUP_CLASS,
	POPUP_DROP_SHADOW_CLASS,
	SETTINGS_HEADER_CLASS,
}
