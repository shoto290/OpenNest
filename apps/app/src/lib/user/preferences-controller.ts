import type { Language } from "@workspace/ui/lib/i18n"
import type { Palette } from "@workspace/ui/lib/palettes"

import type { ColorScheme, UserPreferences } from "./preferences-contract"
import {
	applyLanguage,
	isMirrorKey,
	type MirroredPreferences,
	mirrorOf,
	readMirror,
	sameMirror,
	writeMirror,
} from "./preferences-mirror"
import {
	changePreferences,
	changeProfilePicture,
	readPreferences,
} from "./preferences-queue"

type NotificationField = Extract<keyof UserPreferences, `notify${string}`>

export type NotificationChange = {
	field: NotificationField
	isEnabled: boolean
}

export type ReaderPreferences = UserPreferences & MirroredPreferences

export type UserState = {
	preferences: ReaderPreferences
	isSettingsOpen: boolean
}

export type UserController = {
	getState: () => UserState
	subscribe: (listener: () => void) => () => void
	followOtherWindows: () => () => void
	load: () => Promise<void>
	setSettingsOpen: (isSettingsOpen: boolean) => void
	rename: (displayName: string) => void
	setNotification: (change: NotificationChange) => Promise<void>
	setColorScheme: (colorScheme: ColorScheme) => Promise<void>
	setPalette: (palette: Palette) => Promise<void>
	setLanguage: (language: Language | null) => Promise<void>
	setSidebarWidth: (sidebarWidth: number) => Promise<void>
	setLastBot: (lastBotId: string) => Promise<void>
	uploadPicture: (file: File) => Promise<void>
	removePicture: () => Promise<void>
}

const UNMIRRORED_DEFAULTS = {
	displayName: "",
	profilePicturePath: null,
	notifyOnQuestion: true,
	notifyOnPermission: true,
	notifyOnFinishedTurn: true,
	notifyWithSound: true,
} satisfies Omit<UserPreferences, keyof MirroredPreferences>

const openingPreferences = (): ReaderPreferences => ({
	...UNMIRRORED_DEFAULTS,
	...readMirror(),
})

const recordOf = (record: UserPreferences): ReaderPreferences => ({
	...UNMIRRORED_DEFAULTS,
	...record,
	...mirrorOf(record),
})

export const createUserController = (): UserController => {
	let state: UserState = {
		preferences: openingPreferences(),
		isSettingsOpen: false,
	}
	const listeners = new Set<() => void>()

	let answered = state.preferences

	let pendingName: string | null = null
	let isWriting = false

	const publish = () => {
		for (const listener of listeners) {
			listener()
		}
	}

	const set = (fields: Partial<UserState>) => {
		state = { ...state, ...fields }
		publish()
	}

	const show = (preferences: ReaderPreferences) => set({ preferences })

	const mirror = (mirrored: MirroredPreferences) => {
		if (sameMirror(mirrored, readMirror())) {
			return
		}
		writeMirror(mirrored)
		applyLanguage(mirrored.language)
	}

	const apply = (record: UserPreferences) => {
		answered = recordOf(record)
		mirror(answered)
		show(answered)
	}

	const restore = () => apply(answered)

	const flush = async (): Promise<void> => {
		const displayName = pendingName
		if (displayName === null) {
			return
		}
		pendingName = null
		const written = await changePreferences((record) => ({
			...record,
			displayName,
		}))
		if (pendingName === null) {
			apply(written)
		}
		return flush()
	}

	const changeMirrored = (fields: Partial<MirroredPreferences>) => {
		const preferences = { ...state.preferences, ...fields }
		if (sameMirror(preferences, state.preferences)) {
			return Promise.resolve()
		}
		show(preferences)
		mirror(preferences)
		return changePreferences((record) => ({ ...record, ...fields }))
			.then(apply)
			.catch(restore)
	}

	return {
		getState: () => state,

		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},

		followOtherWindows: () => {
			const follow = (event: StorageEvent) => {
				if (!isMirrorKey(event.key)) {
					return
				}
				const mirrored = readMirror()
				applyLanguage(mirrored.language)
				answered = { ...answered, ...mirrored }
				show({ ...state.preferences, ...mirrored })
			}

			window.addEventListener("storage", follow)

			return () => {
				window.removeEventListener("storage", follow)
			}
		},

		load: () => readPreferences().then(apply).catch(restore),

		setSettingsOpen: (isSettingsOpen: boolean) => set({ isSettingsOpen }),

		rename: (displayName: string) => {
			show({ ...state.preferences, displayName })
			pendingName = displayName
			if (isWriting) {
				return
			}
			isWriting = true
			void flush()
				.catch(restore)
				.finally(() => {
					isWriting = false
				})
		},

		setNotification: ({ field, isEnabled }: NotificationChange) => {
			show({ ...state.preferences, [field]: isEnabled })
			return changePreferences((record) => ({ ...record, [field]: isEnabled }))
				.then(apply)
				.catch(restore)
		},

		setColorScheme: (colorScheme: ColorScheme) =>
			changeMirrored({ colorScheme }),

		setPalette: (palette: Palette) => changeMirrored({ palette }),

		setLanguage: (language: Language | null) => changeMirrored({ language }),

		setSidebarWidth: (sidebarWidth: number) => changeMirrored({ sidebarWidth }),

		setLastBot: (lastBotId: string) => changeMirrored({ lastBotId }),

		uploadPicture: async (file: File) => {
			const bytes = new Uint8Array(await file.arrayBuffer())
			return changeProfilePicture(bytes).then(apply).catch(restore)
		},

		removePicture: () =>
			changePreferences((record) => ({
				...record,
				profilePicturePath: null,
			}))
				.then(apply)
				.catch(restore),
	}
}
