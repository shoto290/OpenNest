import type { UserPreferences } from "./preferences-contract"
import {
	changePreferences,
	changeProfilePicture,
	readPreferences,
} from "./preferences-queue"

/** The half of the record the reader is: their name, the picture the host stored
 * for them and the events they are told about. The other half is the theme, which
 * the provider holds. */
export type UserProfile = Pick<
	UserPreferences,
	| "displayName"
	| "profilePicturePath"
	| "notifyOnQuestion"
	| "notifyOnPermission"
	| "notifyOnFinishedTurn"
>

/** Which of the three switches a write flips. They are the record's own names, so
 * the record is what the controller writes and the dialog's shape is the settings'
 * to translate. */
type NotificationField = Extract<keyof UserProfile, `notifyOn${string}`>

/** One switch, as the record names it, and where the reader just put it. */
export type NotificationChange = {
	field: NotificationField
	isEnabled: boolean
}

export type UserState = {
	/** Who the reader is, as the chip and the settings draw them. */
	profile: UserProfile
	/** Whether the reader's own settings stand open. They are an overlay rather than
	 * a column, so nothing about the conversation underneath moves while they are. */
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

/** What the window opens on before the host has answered: a reader with no name
 * reads as `You`, one with no picture wears their initials, and all three switches
 * stand on — the host answers them on until they are written, and a question
 * nobody heard is what that default is against. */
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

	/** The record as the host last answered it. A write the host refused leaves the
	 * reader on this rather than on a value that never landed. */
	let answered = initialUserState.profile

	/** The newest name waiting to be written, and whether a loop is already writing
	 * them. Typing is faster than a round trip: only the last name of a burst is
	 * worth writing, the ones before it spell the same name on the way there. */
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

	/** The name that is still waiting, and then whatever was typed while it was on
	 * its way. The host's answer is applied only once nothing is queued behind it: an
	 * answer to a name the reader has already typed past would rewind the field. */
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

		/** The record, read and shown. A read the host refused leaves the chip on the
		 * fallback name — there is nowhere here to say a read did not land. */
		load: () => readPreferences().then(apply).catch(restore),

		setSettingsOpen: (isSettingsOpen: boolean) => set({ isSettingsOpen }),

		/** What the reader sees while the write is on its way. The field is controlled
		 * by this state, so the name has to move on the keystroke rather than on the
		 * answer — one that waited for the host would drop characters. */
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

		/** The switch moves under the finger and the record is written whole behind it.
		 * A refused write puts the switch back on what the host last answered, so what
		 * the reader reads is never a choice that did not land. */
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

		/** The record with the picture taken off. `null` is what the contract reads as
		 * no picture, so the host drops the file it was keeping and the chip falls back
		 * to the initials. */
		removePicture: () =>
			changePreferences((record) => ({
				...record,
				profilePicturePath: null,
			}))
				.then(apply)
				.catch(restore),
	}
}
