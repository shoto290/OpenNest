import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { App } from "./App"

import { ThemeProvider } from "@/components/theme-provider"
import { revealWindow } from "@/lib/host"

// Before the tree rather than after it: a render that throws would otherwise leave
// the window hidden, which is an app that never opens at all.
revealWindow()

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<ThemeProvider>
			<App />
		</ThemeProvider>
	</StrictMode>,
)
