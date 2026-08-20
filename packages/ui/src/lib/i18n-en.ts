import { bots } from "@workspace/ui/lib/i18n-en/bots"
import { chat } from "@workspace/ui/lib/i18n-en/chat"
import { common } from "@workspace/ui/lib/i18n-en/common"
import { settings } from "@workspace/ui/lib/i18n-en/settings"

/** The en catalogue, one file per namespace so two surfaces never share one. */
const en = { bots, chat, common, settings } as const

export { en }
