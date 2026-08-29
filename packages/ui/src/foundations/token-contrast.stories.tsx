import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	ACTION_TOKENS,
	SIDEBAR_TOKENS,
	SURFACE_TOKENS,
} from "@workspace/ui/foundations/color-tokens"
import { contrastRatio, type Rgb } from "@workspace/ui/lib/contrast"

type TokenPair = { background: string; foreground: string }
type ThemeName = "light" | "dark"

const AA_TEXT_RATIO = 4.5
const FOREGROUND_SUFFIX = "-foreground"
const THEMES: ThemeName[] = ["light", "dark"]
const TRANSPARENT_COMPUTED_COLOR = "rgba(0, 0, 0, 0)"
const CANVAS_BASE: Rgb = [255, 255, 255]

const SEMANTIC_TOKENS = [...SURFACE_TOKENS, ...ACTION_TOKENS, ...SIDEBAR_TOKENS]

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

const CROSS_FAMILY_PAIRS: TokenPair[] = [
	{ background: "--sidebar", foreground: "--muted-foreground" },
	{ background: "--sidebar-accent", foreground: "--muted-foreground" },
]

const TOKEN_PAIRS = [ROOT_PAIR, ...SUFFIXED_PAIRS, ...CROSS_FAMILY_PAIRS]

const PAIRS_AWAITING_DESIGN_DECISION: Record<string, number> = {
	"light --sidebar-primary-foreground on --sidebar-primary": 2.6,
	"dark --sidebar-primary-foreground on --sidebar-primary": 1.7,
}

const pairKey = (scheme: ThemeName, pair: TokenPair) =>
	`${scheme} ${pair.foreground} on ${pair.background}`

const requiredRatio = (key: string) =>
	PAIRS_AWAITING_DESIGN_DECISION[key] ?? AA_TEXT_RATIO

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

type ThemeProbe = {
	scheme: ThemeName
	scope: HTMLElement
	surface: Rgb
}

const probeTheme = (
	pixel: CanvasRenderingContext2D,
	canvasElement: HTMLElement,
	scheme: ThemeName,
): ThemeProbe => {
	const scope = canvasElement.querySelector<HTMLElement>(
		`[data-scheme-scope="${scheme}"]`,
	)
	if (!scope) {
		throw new Error(`Missing theme scope for ${scheme}.`)
	}
	return {
		scheme,
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

type Measurement = { key: string; ratio: number }

const failuresIn = (measurements: Measurement[]) =>
	measurements
		.filter(({ key, ratio }) => ratio < requiredRatio(key))
		.map(
			({ key, ratio }) =>
				`${key}: measured ${ratio.toFixed(2)}:1, needs ${requiredRatio(key)}:1`,
		)

const settledExceptionsIn = (measurements: Measurement[]) =>
	Object.keys(PAIRS_AWAITING_DESIGN_DECISION)
		.filter((key) =>
			measurements.every(
				(measurement) =>
					measurement.key !== key || measurement.ratio >= AA_TEXT_RATIO,
			),
		)
		.map(
			(key) =>
				`${key}: now clears ${AA_TEXT_RATIO}:1, drop it from PAIRS_AWAITING_DESIGN_DECISION`,
		)

const meta = preview.meta({
	title: "Foundations/Token Contrast",
	tags: ["!dev", "!autodocs"],
	parameters: { layout: "fullscreen" },
	render: () => (
		<>
			{THEMES.map((scheme) => (
				<div key={scheme} className={scheme} data-scheme-scope={scheme} />
			))}
		</>
	),
})

export const SemanticPairsMeetAaText = meta.story({
	play: async ({ canvasElement }) => {
		const pixel = createPixel()
		const [light, dark] = THEMES.map((scheme) =>
			probeTheme(pixel, canvasElement, scheme),
		)

		await expect(
			light.surface,
			"Theme scopes resolve to the same surface, the theme class is not applied.",
		).not.toEqual(dark.surface)

		const measurements = [light, dark].flatMap((probe) =>
			TOKEN_PAIRS.map((pair) => ({
				key: pairKey(probe.scheme, pair),
				ratio: measurePair(pixel, probe, pair),
			})),
		)
		const problems = [
			...failuresIn(measurements),
			...settledExceptionsIn(measurements),
		]

		await expect(
			problems,
			`Semantic token pairs failing their contrast floor:\n${problems.join("\n")}`,
		).toEqual([])
	},
})
