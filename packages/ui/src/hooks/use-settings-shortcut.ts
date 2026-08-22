import { useEffect } from "react"

/** The chord every desktop application opens its settings on. */
export const isSettingsShortcut = (event: KeyboardEvent) =>
	event.key === "," && event.metaKey

type SettingsShortcut = {
	/** Off while there is no conversation to open settings for: the chord belongs to
	 * the bot being read, and there is none. */
	isEnabled: boolean
	onToggle: () => void
}

/** The window-wide way in and out of a bot's settings. It listens on the capture
 * phase and takes the event: the dialog holds text fields, and a chord typed into
 * one of them must close the dialog rather than write a comma into the name.
 *
 * The way in and the way out are two readers of it, never both at once: the surface
 * that opens the dialog listens while it is closed, and the dialog listens while it
 * is open, so the chord leaves by the same door as Escape and the backdrop and asks
 * whatever they ask. */
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
