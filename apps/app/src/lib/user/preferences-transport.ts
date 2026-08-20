import { invoke } from "@tauri-apps/api/core"

import type { UserPreferences } from "./preferences-contract"

/** The one record, read and written over IPC. The host owns the record and the
 * failure: nothing here reshapes what came back and nothing catches, so a
 * `UserPreferencesError` reaches the caller as sent. */
export const userPreferencesStore = {
	read: () => invoke<UserPreferences>("user_preferences"),

	write: (preferences: UserPreferences) =>
		invoke<UserPreferences>("user_set_preferences", { preferences }),

	setProfilePicture: (bytes: Uint8Array) =>
		invoke<UserPreferences>("user_set_profile_picture", { bytes }),
}
