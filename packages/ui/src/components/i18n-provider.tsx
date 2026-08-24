"use client"

import type { ReactNode } from "react"
import { I18nextProvider } from "react-i18next"

import { i18n } from "@workspace/ui/lib/i18n"

interface I18nProviderProps {
	children: ReactNode
}

const I18nProvider = ({ children }: I18nProviderProps) => (
	<I18nextProvider i18n={i18n}>{children}</I18nextProvider>
)

export { I18nProvider, type I18nProviderProps }
