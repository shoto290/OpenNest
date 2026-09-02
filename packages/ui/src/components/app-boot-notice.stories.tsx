import { expect, fn, userEvent } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { botIdentityAvatars, slotIn } from "@workspace/storybook/story-utils"
import { AppBootNotice } from "@workspace/ui/components/app-boot-notice"

const meta = preview.meta({
	title: "Feedback/AppBootNotice",
	component: AppBootNotice,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"What a desktop window shows when its first read fails: the same window-filling surface as the boot screen, holding a single notice and the one action that can still help. It takes the window because there is no shell to put it in yet — the record never answered, so there is nothing to draw a sidebar from. Once the app is running, a failed read belongs to a notice inside the screen it broke, not to this one.",
			},
		},
	},
	args: {
		title: "Spaces could not be read",
		description:
			"Your bots are safe on the record. Try again to open your spaces.",
		onRetry: fn(),
	},
	argTypes: {
		title: { control: "text" },
		description: { control: "text" },
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The launch failure. Check that the notice sits centred in the window with no shell around it, that it stops growing on a wide window, and that Retry is the first stop on Tab.",
			},
		},
	},
	play: async ({ canvas, canvasElement, args }) => {
		const surface = slotIn(canvasElement, "app-boot-notice")

		await expect(surface.clientHeight).toBe(window.innerHeight)
		await expect(botIdentityAvatars(canvasElement)).toHaveLength(1)

		await userEvent.tab()

		const retry = canvas.getByRole("button", { name: "Retry" })

		await expect(retry).toHaveFocus()

		await userEvent.click(retry)

		await expect(args.onRetry).toHaveBeenCalled()
	},
})
