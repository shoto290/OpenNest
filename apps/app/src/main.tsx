import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { I18nProvider } from "@workspace/ui/components/i18n-provider"

import { App } from "./App"

import { exposeLiveSessions } from "@/lib/agent/live-sessions-devtools"
import { revealWindow } from "@/lib/host"
import { applyLanguage, readMirror } from "@/lib/user/preferences-mirror"
import { warmCodeHighlighter } from "@/lib/warm-highlighter"

revealWindow().catch((reason) => {
	console.error("reveal at start failed", reason)
})

exposeLiveSessions()

applyLanguage(readMirror().language)

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<I18nProvider>
			<App />
		</I18nProvider>
	</StrictMode>,
)

warmCodeHighlighter()
