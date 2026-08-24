import type { UserPreferences } from "./preferences-contract"
import { userPreferencesStore } from "./preferences-transport"

import { createQueue } from "../queue"

const enqueue = createQueue()

export const readPreferences = () => enqueue(() => userPreferencesStore.read())

export const changePreferences = (
	change: (record: UserPreferences) => UserPreferences,
): Promise<UserPreferences> =>
	enqueue(async () =>
		userPreferencesStore.write(change(await userPreferencesStore.read())),
	)

export const changeProfilePicture = (
	bytes: Uint8Array,
): Promise<UserPreferences> =>
	enqueue(() => userPreferencesStore.setProfilePicture(bytes))
