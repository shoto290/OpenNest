import type { UserPreferences } from "./preferences-contract"
import {
	changePreferences,
	changeProfilePicture,
	readPreferences,
} from "./preferences-queue"

export type UserProfile = Pick<
	UserPreferences,
	| "displayName"
	| "profilePicturePath"
	| "notifyOnQuestion"
	| "notifyOnPermission"
	| "notifyOnFinishedTurn"
>

type NotificationField = Extract<keyof UserProfile, `notifyOn${string}`>

export type NotificationChange = {
	field: NotificationField
	isEnabled: boolean
}

export type UserState = {
	profile: UserProfile
	isSettingsOpen: boolean
}

export type UserController = {
	getState: () => UserState
	subscribe: (listener: () => void) => () => void
	load: () => Promise<void>
	setSettingsOpen: (isSettingsOpen: boolean) => void
	rename: (displayName: string) => void
	setNotification: (change: NotificationChange) => Promise<void>
	uploadPicture: (file: File) => Promise<void>
	removePicture: () => Promise<void>
}

export const initialUserState: UserState = {
	profile: {
		displayName: "",
		profilePicturePath: null,
		notifyOnQuestion: true,
		notifyOnPermission: true,
		notifyOnFinishedTurn: true,
	},
	isSettingsOpen: false,
}

export const createUserController = (): UserController => {
	let state = initialUserState
	const listeners = new Set<() => void>()

	let answered = initialUserState.profile

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

	const apply = (record: UserPreferences) => {
		answered = {
			displayName: record.displayName,
			profilePicturePath: record.profilePicturePath,
			notifyOnQuestion: record.notifyOnQuestion,
			notifyOnPermission: record.notifyOnPermission,
			notifyOnFinishedTurn: record.notifyOnFinishedTurn,
		}
		set({ profile: answered })
	}

	const restore = () => set({ profile: answered })

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

	return {
		getState: () => state,

		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},

		load: () => readPreferences().then(apply).catch(restore),

		setSettingsOpen: (isSettingsOpen: boolean) => set({ isSettingsOpen }),

		rename: (displayName: string) => {
			set({ profile: { ...state.profile, displayName } })
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
			set({ profile: { ...state.profile, [field]: isEnabled } })
			return changePreferences((record) => ({ ...record, [field]: isEnabled }))
				.then(apply)
				.catch(restore)
		},

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
