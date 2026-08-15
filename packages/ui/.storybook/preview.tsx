import "./styles.css"

import addonA11y from "@storybook/addon-a11y"
import addonDocs from "@storybook/addon-docs"
import addonThemes, { withThemeByClassName } from "@storybook/addon-themes"
import {
	type Decorator,
	definePreview,
	type ReactRenderer,
} from "@storybook/react-vite"

import { THEME_CLASS_NAMES, ThemedDocsContainer } from "./themed-docs-container"

const SIDE_BY_SIDE_THEMES = ["light", "dark"]

const withThemeLayout: Decorator = (Story, context) => {
	if (context.globals.theme_layout !== "side-by-side") {
		return <Story />
	}

	return (
		<div className="grid grid-cols-2 gap-px bg-border">
			{SIDE_BY_SIDE_THEMES.map((theme) => (
				<div
					key={theme}
					className={`${theme} bg-background p-6 text-foreground`}
				>
					<Story />
				</div>
			))}
		</div>
	)
}

export default definePreview({
	addons: [addonDocs(), addonA11y(), addonThemes()],
	tags: ["autodocs"],
	decorators: [
		withThemeByClassName<ReactRenderer>({
			themes: THEME_CLASS_NAMES,
			defaultTheme: "light",
		}),
		withThemeLayout,
	],
	globalTypes: {
		theme_layout: {
			description: "Render the story in one theme or in both at once",
			toolbar: {
				title: "Theme layout",
				icon: "mirror",
				items: [
					{ value: "single", title: "Single" },
					{ value: "side-by-side", title: "Side by side" },
				],
				dynamicTitle: true,
			},
		},
	},
	initialGlobals: {
		theme_layout: "single",
	},
	parameters: {
		a11y: { test: "error" },
		docs: { container: ThemedDocsContainer },
		options: {
			storySort: (a, b) => {
				const SECTIONS = [
					"Foundations",
					"Primitives",
					"Forms",
					"Overlays",
					"Feedback",
					"Navigation",
					"Data",
					"Display",
					"Layout",
					"Patterns",
					"Branding",
					"AI",
				]
				const FOUNDATIONS = [
					"Introduction",
					"Colors",
					"Typography",
					"Spacing",
					"Radius & Shadows",
					"Motion",
					"Icons",
				]

				const [sectionA, ...pathA] = a.title.split("/")
				const [sectionB, ...pathB] = b.title.split("/")

				const sectionRankA = SECTIONS.indexOf(sectionA)
				const sectionRankB = SECTIONS.indexOf(sectionB)
				if (sectionRankA === -1 || sectionRankB === -1) {
					const unknown = sectionRankA === -1 ? sectionA : sectionB
					throw new Error(
						`Unknown top-level story section "${unknown}". Allowed: ${SECTIONS.join(", ")}.`,
					)
				}
				if (sectionRankA !== sectionRankB) {
					return sectionRankA - sectionRankB
				}

				if (sectionA === "Foundations") {
					const foundationRankA = FOUNDATIONS.indexOf(pathA[0] ?? "")
					const foundationRankB = FOUNDATIONS.indexOf(pathB[0] ?? "")
					if (foundationRankA !== foundationRankB) {
						const fallback = FOUNDATIONS.length
						return (
							(foundationRankA === -1 ? fallback : foundationRankA) -
							(foundationRankB === -1 ? fallback : foundationRankB)
						)
					}
				}

				const deprecatedA = a.tags?.includes("deprecated") ? 1 : 0
				const deprecatedB = b.tags?.includes("deprecated") ? 1 : 0
				if (deprecatedA !== deprecatedB) {
					return deprecatedA - deprecatedB
				}

				const depth = Math.max(pathA.length, pathB.length)
				for (let level = 0; level < depth; level += 1) {
					const segmentA = pathA[level] ?? ""
					const segmentB = pathB[level] ?? ""
					if (segmentA !== segmentB) {
						return segmentA.localeCompare(segmentB)
					}
				}

				if (a.title !== b.title) {
					return a.title.localeCompare(b.title)
				}

				return (a.type === "docs" ? 0 : 1) - (b.type === "docs" ? 0 : 1)
			},
		},
		viewport: {
			options: {
				mobile: { name: "Mobile", styles: { width: "390px", height: "844px" } },
				tablet: {
					name: "Tablet",
					styles: { width: "768px", height: "1024px" },
				},
				laptop: {
					name: "Laptop",
					styles: { width: "1280px", height: "800px" },
				},
				desktop: {
					name: "Desktop",
					styles: { width: "1536px", height: "960px" },
				},
			},
		},
	},
})
