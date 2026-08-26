import type {
	AvatarRejection,
	StorageFailure,
} from "../conversations/store-contract"

export type ColorScheme = "system" | "light" | "dark"

export type Palette = string

export type Language = string | null

export type BotIdBySpace = Record<string, string>

export type UserPreferences = {
	displayName: string
	profilePicturePath: string | null
	colorScheme: ColorScheme
	palette: Palette
	language: Language
	notifyOnQuestion: boolean
	notifyOnPermission: boolean
	notifyOnFinishedTurn: boolean
	notifyWithSound: boolean
	sidebarWidth: number | null
	lastBotId: string | null
	lastSpaceId: string | null
	lastBotIdBySpace: BotIdBySpace
}

export type UserPreferencesError =
	| { kind: "unavailable"; failure: StorageFailure }
	| { kind: "storage"; failure: StorageFailure }
	| { kind: "rejectedProfilePicture"; reason: AvatarRejection }
