import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { ApplicationMark } from "@workspace/ui/components/plugin-settings/application-mark"
import { CURATED_APPLICATIONS } from "@workspace/ui/components/plugin-settings/applications.fixtures"

const meta = preview.meta({
	title: "Settings/Plugins/ApplicationMark",
	component: ApplicationMark,
	parameters: {
		docs: {
			description: {
				component:
					"The slot an application's mark sits in. The mark comes from the application's data; without one, the slot shows the server glyph on the muted surface at the same size.",
			},
		},
	},
	args: { mark: CURATED_APPLICATIONS[0].mark },
})

export const WithMark = meta.story({
	play: async ({ canvasElement }) => {
		await expect(canvasElement.querySelector("img")).not.toBeNull()
	},
})

export const WithoutMark = meta.story({
	args: { mark: undefined },
	play: async ({ canvasElement }) => {
		await expect(canvasElement.querySelector("img")).toBeNull()
		await expect(canvasElement.querySelector("svg")).not.toBeNull()
	},
})

export const Small = meta.story({
	args: { size: "sm" },
})
