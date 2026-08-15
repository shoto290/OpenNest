import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	ACTION_TOKENS,
	SIDEBAR_TOKENS,
	SURFACE_TOKENS,
} from "@workspace/ui/foundations/color-tokens"

type Rgb = [number, number, number]
type TokenPair = { background: string; foreground: string }
type ThemeName = "light" | "dark"

const AA_TEXT_RATIO = 4.5
const FOREGROUND_SUFFIX = "-foreground"
const THEMES: ThemeName[] = ["light", "dark"]
const TRANSPARENT_COMPUTED_COLOR = "rgba(0, 0, 0, 0)"
const CANVAS_BASE: Rgb = [255, 255, 255]

const SEMANTIC_TOKENS = [
	...SURFACE_TOKENS,
	...ACTION_TOKENS,
	...SIDEBAR_TOKENS,
]

const ROOT_PAIR: TokenPair = {
	background: "--background",
	foreground: "--foreground",
}

const SUFFIXED_PAIRS: TokenPair[] = SEMANTIC_TOKENS.filter((token) =>
	SEMANTIC_TOKENS.includes(`${token}${FOREGROUND_SUFFIX}`),
).map((background) => ({
	background,
	foreground: `${background}${FOREGROUND_SUFFIX}`,
}))

const TOKEN_PAIRS = [ROOT_PAIR, ...SUFFIXED_PAIRS]

const PAIRS_AWAITING_DESIGN_DECISION: Record<string, number> = {
	"light --muted": 4.3,
	"light --sidebar-primary": 2.8,
	"dark --sidebar-primary": 1.8,
}

const requiredRatio = (theme: ThemeName, pair: TokenPair) =>
	PAIRS_AWAITING_DESIGN_DECISION[`${theme} ${pair.background}`] ?? AA_TEXT_RATIO

const toLinear = (channel: number) =>
	channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4

const relativeLuminance = ([red, green, blue]: Rgb) =>
	0.2126 * toLinear(red / 255) +
	0.7152 * toLinear(green / 255) +
	0.0722 * toLinear(blue / 255)

const contrastRatio = (a: Rgb, b: Rgb) => {
	const luminances = [relativeLuminance(a), relativeLuminance(b)]
	return (Math.max(...luminances) + 0.05) / (Math.min(...luminances) + 0.05)
}

const createPixel = () => {
	const canvas = document.createElement("canvas")
	canvas.width = 1
	canvas.height = 1
	const pixel = canvas.getContext("2d", { willReadFrequently: true })
	if (!pixel) {
		throw new Error("2D canvas context unavailable, cannot rasterise tokens.")
	}
	return pixel
}

const readComputedColor = (scope: HTMLElement, token: string) => {
	const probe = document.createElement("div")
	probe.style.backgroundColor = `var(${token})`
	scope.append(probe)
	const color = getComputedStyle(probe).backgroundColor
	probe.remove()
	if (color === TRANSPARENT_COMPUTED_COLOR) {
		throw new Error(`Token ${token} resolves to nothing, it no longer exists.`)
	}
	return color
}

const paintOver = (
	pixel: CanvasRenderingContext2D,
	base: Rgb,
	color: string,
): Rgb => {
	pixel.fillStyle = `rgb(${base[0]} ${base[1]} ${base[2]})`
	pixel.fillRect(0, 0, 1, 1)
	pixel.fillStyle = color
	pixel.fillRect(0, 0, 1, 1)
	const [red, green, blue] = pixel.getImageData(0, 0, 1, 1).data
	return [red, green, blue]
}

type ThemeProbe = { name: ThemeName; scope: HTMLElement; surface: Rgb }

const probeTheme = (
	pixel: CanvasRenderingContext2D,
	canvasElement: HTMLElement,
	name: ThemeName,
): ThemeProbe => {
	const scope = canvasElement.querySelector<HTMLElement>(
		`[data-theme-scope="${name}"]`,
	)
	if (!scope) {
		throw new Error(`Missing theme scope for ${name}.`)
	}
	return {
		name,
		scope,
		surface: paintOver(
			pixel,
			CANVAS_BASE,
			readComputedColor(scope, ROOT_PAIR.background),
		),
	}
}

const measurePair = (
	pixel: CanvasRenderingContext2D,
	theme: ThemeProbe,
	pair: TokenPair,
) => {
	const background = paintOver(
		pixel,
		theme.surface,
		readComputedColor(theme.scope, pair.background),
	)
	const foreground = paintOver(
		pixel,
		background,
		readComputedColor(theme.scope, pair.foreground),
	)
	return contrastRatio(background, foreground)
}

const auditPair = (
	pixel: CanvasRenderingContext2D,
	theme: ThemeProbe,
	pair: TokenPair,
) => {
	const ratio = measurePair(pixel, theme, pair)
	const required = requiredRatio(theme.name, pair)
	const label = `${theme.name} ${pair.foreground} on ${pair.background}`

	if (ratio < required) {
		return `${label}: measured ${ratio.toFixed(2)}:1, needs ${required}:1`
	}
	if (required < AA_TEXT_RATIO && ratio >= AA_TEXT_RATIO) {
		return `${label}: now ${ratio.toFixed(2)}:1, drop it from PAIRS_AWAITING_DESIGN_DECISION`
	}
	return null
}

const meta = preview.meta({
	title: "Foundations/Token Contrast",
	tags: ["!dev", "!autodocs"],
	parameters: { layout: "fullscreen" },
	render: () => (
		<>
			{THEMES.map((theme) => (
				<div key={theme} className={theme} data-theme-scope={theme} />
			))}
		</>
	),
})

export const SemanticPairsMeetAaText = meta.story({
	play: async ({ canvasElement }) => {
		const pixel = createPixel()
		const themes = THEMES.map((name) => probeTheme(pixel, canvasElement, name))
		const [light, dark] = themes

		await expect(
			light.surface,
			"Theme scopes resolve to the same surface, the theme class is not applied.",
		).not.toEqual(dark.surface)

		const problems = themes
			.flatMap((theme) =>
				TOKEN_PAIRS.map((pair) => auditPair(pixel, theme, pair)),
			)
			.filter((problem) => problem !== null)

		await expect(
			problems,
			`Semantic token pairs failing their contrast floor:\n${problems.join("\n")}`,
		).toEqual([])
	},
})
