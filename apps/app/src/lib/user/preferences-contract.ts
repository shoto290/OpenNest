import type {
	AvatarRejection,
	StorageFailure,
} from "../conversations/store-contract"

export type ColorScheme = "system" | "light" | "dark"

export type Palette = string

export type Language = string | null

export type WindowBounds = {
	x: number
	y: number
	width: number
	height: number
}

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
	windowBounds: WindowBounds | null
	lastBotId: string | null
}

export type UserPreferencesError =
	| { kind: "unavailable"; failure: StorageFailure }
	| { kind: "storage"; failure: StorageFailure }
	| { kind: "rejectedProfilePicture"; reason: AvatarRejection }
