import type { UserSettingsValue } from "@workspace/ui/components/user-settings"

import type { ThemePreferences } from "./theme-mirror"
import type { UserProfile } from "./user-controller"

import { avatarSrc } from "../host"

/** The whole of what the reader is, from the two halves that hold it: the name and
 * the picture from the record, the scheme and the palette from the provider
 * painting the window. It is what the settings edit and what the chip wears.
 *
 * The stored path never reaches an `img` — what a webview may load is the asset
 * protocol the host scoped to the one directory pictures live in. */
export const toUserSettingsValue = (
	profile: UserProfile,
	theme: ThemePreferences,
): UserSettingsValue => ({
	name: profile.displayName,
	image: avatarSrc(profile.profilePicturePath),
	colorScheme: theme.colorScheme,
	palette: theme.palette,
})
