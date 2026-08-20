import { createQueue } from "../queue"

import type { UserPreferences } from "./preferences-contract"
import { userPreferencesStore } from "./preferences-transport"

/** Every touch of the one record, in the order it was asked for. It is written
 * whole by two callers — the theme provider writes the scheme and the palette, the
 * reader's own settings write the name and the picture — and each of them reads it
 * back before replacing it. The name is written on every keystroke, so a palette
 * chosen between one keystroke's read and its write would take that keystroke
 * back. */
const enqueue = createQueue()

export const readPreferences = () => enqueue(() => userPreferencesStore.read())

/** The record the host holds, changed and written back in one turn of the queue.
 * What comes back is the host's own answer, and a refusal reaches the caller as
 * sent. */
export const changePreferences = (
	change: (record: UserPreferences) => UserPreferences,
): Promise<UserPreferences> =>
	enqueue(async () =>
		userPreferencesStore.write(change(await userPreferencesStore.read())),
	)

/** The bytes of a picture the reader handed over. The host stores them and answers
 * with the record pointing at what it kept. */
export const changeProfilePicture = (
	bytes: Uint8Array,
): Promise<UserPreferences> =>
	enqueue(() => userPreferencesStore.setProfilePicture(bytes))
