import { useEffect } from "react"

export const isSettingsShortcut = (event: KeyboardEvent) =>
	event.key === "," && event.metaKey

type SettingsShortcut = {
	isEnabled: boolean
	onToggle: () => void
}

export const useSettingsShortcut = ({
	isEnabled,
	onToggle,
}: SettingsShortcut) => {
	useEffect(() => {
		if (!isEnabled) return

		const toggle = (event: KeyboardEvent) => {
			if (!isSettingsShortcut(event)) return
			event.preventDefault()
			onToggle()
		}

		window.addEventListener("keydown", toggle, true)
		return () => window.removeEventListener("keydown", toggle, true)
	}, [isEnabled, onToggle])
}
