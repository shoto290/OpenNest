import { chat } from "@workspace/ui/lib/i18n-en/chat"
import { settings } from "@workspace/ui/lib/i18n-en/settings"

/** The en catalogue, one file per namespace so two surfaces never share one. */
const en = { chat, settings } as const

export { en }
