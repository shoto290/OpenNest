export const PALETTES = {
	amber: "Amber",
	slate: "Slate",
	water: "Water",
	moss: "Moss",
	coral: "Coral",
	lavender: "Lavender",
} as const satisfies Record<string, string>

export type Palette = keyof typeof PALETTES

export const PALETTE_IDS = Object.keys(PALETTES) as Palette[]

export const DEFAULT_PALETTE: Palette = "amber"
