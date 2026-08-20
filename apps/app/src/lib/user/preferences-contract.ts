import type {
	AvatarRejection,
	StorageFailure,
} from "../conversations/store-contract"

/** Which of the two themes the app paints in, or that it follows the system. The
 * host holds the same three words and refuses a fourth at the boundary, so a value
 * outside this union never reaches the file. */
export type ColorScheme = "system" | "light" | "dark"

/** The palette the app is painted in. Free text, and deliberately not a union: the
 * list of palettes is this side's to change, and a name the host refused would be a
 * palette the UI could paint and the file could not remember. */
export type Palette = string

/** The language the app reads in. Free text for the reason `Palette` is, and `null`
 * for nobody having chosen: which catalogues exist is this side's to change, and a
 * record holding no name is one the machine's own language answers for. */
export type Language = string | null

/** The one record, in both directions: a write carries exactly what a read
 * answers, so a field left out is one the caller meant to clear rather than one it
 * meant to keep.
 *
 * `profilePicturePath` is the host's to hand out and never a caller's to invent —
 * the rule `avatarImagePath` already follows on a bot. It comes back as an absolute
 * path inside the one directory the host keeps pictures in, and only while the file
 * is still there; a picture that is gone reads as `null`. Echo it to keep the
 * picture, send `null` to take it off, and use `setProfilePicture` to put a new one
 * on. */
export type UserPreferences = {
	displayName: string
	profilePicturePath: string | null
	colorScheme: ColorScheme
	palette: Palette
	language: Language
}

/** Why a preferences call refused. `unavailable` says nothing is being stored this
 * whole run, `storage` says this one call did not land. A refused picture leaves the
 * record pointing at whatever it pointed at before. */
export type UserPreferencesError =
	| { kind: "unavailable"; failure: StorageFailure }
	| { kind: "storage"; failure: StorageFailure }
	| { kind: "rejectedProfilePicture"; reason: AvatarRejection }
