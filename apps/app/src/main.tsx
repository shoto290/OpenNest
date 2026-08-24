import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { I18nProvider } from "@workspace/ui/components/i18n-provider"

import { App } from "./App"

import { ThemeProvider } from "@/components/theme-provider"
import { revealWindow } from "@/lib/host"
import { startLanguage } from "@/lib/user/language-mirror"

revealWindow()

void startLanguage()

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<I18nProvider>
			<ThemeProvider>
				<App />
			</ThemeProvider>
		</I18nProvider>
	</StrictMode>,
)
