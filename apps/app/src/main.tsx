import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { I18nProvider } from "@workspace/ui/components/i18n-provider"

import { App } from "./App"

import { ThemeProvider } from "@/components/theme-provider"
import { revealWindow } from "@/lib/host"
import { startLanguage } from "@/lib/user/language-mirror"

// Before the tree rather than after it: a render that throws would otherwise leave
// the window hidden, which is an app that never opens at all.
revealWindow()

// Before the tree so the first string painted is already in the language that was
// chosen: the mirror is read from storage and has nothing to wait for. The record it
// is a copy of catches up once the host answers.
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
