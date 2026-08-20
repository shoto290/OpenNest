import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { contrastRatio, type Rgb } from "@workspace/ui/lib/contrast"
import {
	DEFAULT_PALETTE,
	PALETTE_IDS,
	PALETTES,
} from "@workspace/ui/lib/palettes"

const AA_TEXT_RATIO = 4.5

const EXEMPT_TOKENS =
	/^--(bot-blot-|bot-avatar-ink$|diagram-scheme$|radius$|sidebar-width)/

const STYLESHEET = readFileSync(
	fileURLToPath(new URL("../styles/globals.css", import.meta.url)),
	"utf8",
)

const colorTokensOf = (selector: string) => {
	const block = STYLESHEET.match(
		new RegExp(`^${selector.replace(/[[\]".]/g, "\\$&")} \\{$([^}]*)^\\}$`, "m"),
	)
	if (!block) {
		throw new Error(`Missing token block for ${selector}.`)
	}
	return new Map(
		[...block[1].matchAll(/^\t(--[\w-]+): (.+);$/gm)]
			.filter(([, token]) => !EXEMPT_TOKENS.test(token))
			.map(([, token, value]) => [token, value]),
	)
}

const REQUIRED_TOKENS = [...colorTokensOf(":root").keys()]

const selectorsOf = (palette: string) => [
	`[data-theme="${palette}"]`,
	`.dark[data-theme="${palette}"]`,
]

const PALETTE_SELECTORS = PALETTE_IDS.flatMap(selectorsOf)

const toSrgb = (channel: number) => {
	const encoded =
		channel <= 0.0031308
			? 12.92 * channel
			: 1.055 * channel ** (1 / 2.4) - 0.055
	return Math.round(255 * Math.min(1, Math.max(0, encoded)))
}

const oklabToRgb = (lightness: number, a: number, b: number): Rgb => {
	const long = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
	const medium = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
	const short = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
	return [
		4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
		-1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
		-0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
	].map(toSrgb) as Rgb
}

const parseOklch = (value: string | undefined): Rgb => {
	const match = value?.match(/^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/)
	if (!match) {
		throw new Error(`Token value ${value} is not a plain oklch colour.`)
	}
	const [lightness, chroma, hue] = match.slice(1).map(Number)
	const radians = (hue * Math.PI) / 180
	return oklabToRgb(
		lightness,
		chroma * Math.cos(radians),
		chroma * Math.sin(radians),
	)
}

const mutedRatioOf = (selector: string) => {
	const tokens = colorTokensOf(selector)
	return contrastRatio(
		parseOklch(tokens.get("--muted")),
		parseOklch(tokens.get("--muted-foreground")),
	)
}

describe("palettes", () => {
	it("lists the six palettes in order, amber first", () => {
		expect(PALETTE_IDS).toEqual([
			"amber",
			"slate",
			"water",
			"moss",
			"coral",
			"lavender",
		])
		expect(DEFAULT_PALETTE).toBe("amber")
		expect(Object.values(PALETTES)).toEqual([
			"Amber",
			"Slate",
			"Water",
			"Moss",
			"Coral",
			"Lavender",
		])
	})

	it.each(PALETTE_SELECTORS)(
		"%s declares every colour token :root declares",
		(selector) => {
			expect([...colorTokensOf(selector).keys()]).toEqual(REQUIRED_TOKENS)
		},
	)

	it.each([":root", ".dark", ...PALETTE_SELECTORS])(
		"%s keeps the muted foreground readable on the muted surface",
		(selector) => {
			expect(mutedRatioOf(selector)).toBeGreaterThanOrEqual(AA_TEXT_RATIO)
		},
	)
})
