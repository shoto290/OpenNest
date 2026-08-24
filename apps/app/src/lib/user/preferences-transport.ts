import { invoke } from "@tauri-apps/api/core"

import type { UserPreferences } from "./preferences-contract"

export const userPreferencesStore = {
	read: () => invoke<UserPreferences>("user_preferences"),

	write: (preferences: UserPreferences) =>
		invoke<UserPreferences>("user_set_preferences", { preferences }),

	setProfilePicture: (bytes: Uint8Array) =>
		invoke<UserPreferences>("user_set_profile_picture", { bytes }),
}
