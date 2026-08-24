const FIELD_LABEL_CLASS = "font-medium text-foreground text-xs"

const FIELD_CONTROL_CLASS =
	"w-full rounded-xl border border-input bg-background px-3 py-2 text-foreground text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"

const FIELD_CONTROL_INVALID_CLASS =
	"border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30"

const FIELD_CONTROL_READONLY_CLASS = "cursor-default bg-muted"

const FIELD_OPTION_MARKS_CLASS =
	"cursor-pointer rounded-xl text-muted-foreground hover:bg-muted has-[:checked]:bg-muted has-[:checked]:font-medium has-[:checked]:text-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"

const FIELD_OPTION_CLASS = `${FIELD_OPTION_MARKS_CLASS} flex flex-col items-center gap-1 p-1.5`

const PICTURE_TARGET_CLASS =
	"cursor-pointer border border-border outline-none hover:border-primary/50 hover:bg-muted focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/30 data-dragging:border-primary data-dragging:bg-primary/10"

const SETTINGS_TAG_CLASS =
	"shrink-0 rounded-full bg-muted px-2 py-0.5 font-medium text-xs"

const SETTINGS_HEADER_CLASS =
	"flex shrink-0 items-center gap-2.5 border-border border-b py-4 pr-14 pl-4"

const BACKDROP_CLASS =
	"fixed inset-0 z-50 bg-black/50 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none"

const POPUP_CLASS =
	"border border-border bg-popover text-popover-foreground shadow-xl outline-none"

const DIALOG_POPUP_CLASS = `${POPUP_CLASS} transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 motion-reduce:transition-none`

const POPUP_DROP_SHADOW_CLASS =
	"[filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.10))_drop-shadow(0_10px_18px_rgba(0,0,0,0.16))] dark:[filter:drop-shadow(0_0_1px_rgba(255,255,255,0.16))_drop-shadow(0_12px_28px_rgba(0,0,0,0.7))]"

const SETTINGS_EMPTY_CLASS =
	"flex flex-1 flex-col items-center justify-center gap-3 text-center"

export {
	BACKDROP_CLASS,
	DIALOG_POPUP_CLASS,
	FIELD_CONTROL_CLASS,
	FIELD_CONTROL_INVALID_CLASS,
	FIELD_CONTROL_READONLY_CLASS,
	FIELD_LABEL_CLASS,
	FIELD_OPTION_CLASS,
	FIELD_OPTION_MARKS_CLASS,
	PICTURE_TARGET_CLASS,
	POPUP_CLASS,
	POPUP_DROP_SHADOW_CLASS,
	SETTINGS_EMPTY_CLASS,
	SETTINGS_HEADER_CLASS,
	SETTINGS_TAG_CLASS,
}
