import { expect, fn, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	FRAME_POLL,
	slotsIn,
	UPLOADED_AVATAR_IMAGE,
} from "@workspace/storybook/story-utils"
import {
	AnimatedSidebar,
	AnimatedSidebarContent,
	AnimatedSidebarFooter,
} from "@workspace/ui/components/motion/animated-sidebar"
import {
	UserChip,
	type UserChipProps,
} from "@workspace/ui/components/user-chip"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"

const NAME = "Ada Martin"
const LONG_NAME = "Ada Martin-Vandersteen de la Fontaine"
const FALLBACK_NAME = "You"

const SINGLE_LINE_HEIGHT = 24
const FOOTER_INSET =
	"group-data-[state=collapsed]/sidebar:items-center group-data-[state=collapsed]/sidebar:px-0"

const renderShell = (defaultOpen: boolean) => (args: UserChipProps) => (
	<WorkspaceShell
		defaultOpen={defaultOpen}
		sidebar={
			<AnimatedSidebar ariaLabel="Workspace" collapsible="icon">
				<AnimatedSidebarContent />
				<AnimatedSidebarFooter className={FOOTER_INSET}>
					<UserChip {...args} />
				</AnimatedSidebarFooter>
			</AnimatedSidebar>
		}
	>
		{null}
	</WorkspaceShell>
)

const avatarIn = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "user-avatar")[0]

const panelIn = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "sidebar-panel")[0]

const horizontalCentreOf = (element: HTMLElement) => {
	const box = element.getBoundingClientRect()
	return box.left + box.width / 2
}

const avatarInsets = (chip: HTMLElement, avatar: HTMLElement) => {
	const chipBox = chip.getBoundingClientRect()
	const box = avatar.getBoundingClientRect()
	return [
		box.left - chipBox.left,
		box.top - chipBox.top,
		chipBox.bottom - box.bottom,
		chipBox.right - box.right,
	].map((inset) => Math.round(inset))
}

const uniqueCount = (values: number[]) => new Set(values).size

const meta = preview.meta({
	title: "Navigation/UserChip",
	component: UserChip,
	render: renderShell(true),
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The reader's own row, pinned under a sidebar list — the way into their settings and nothing else, so activating it fires one event and the host decides what opens. It draws the picture the reader uploaded, or the initials of their display name when there is none, and it reads `You` when the host has no name to give. The row follows the panel: expanded it is the picture and the name clipped to one line, on the rail it is the picture alone, centred, with the name still the button's accessible name. Everything comes from props — it never reads an account and never opens anything itself.",
			},
		},
	},
	args: {
		name: NAME,
		image: UPLOADED_AVATAR_IMAGE,
		onOpen: fn(),
	},
	argTypes: {
		name: { control: "text" },
		image: { control: "text" },
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A reader with a name and a picture, in an expanded panel — the nominal row. Check that the picture is inset from the leading edge by exactly what the row leaves above and below it — one spacing on the three edges it is against — that the picture and the name sit on one line with the picture leading, that Tab reaches the row with a visible ring, and that a click and a keyboard press each fire the open event exactly once: the chip is the only way into the settings, so a doubled event would open them twice. Pick `WithoutPicture` for a reader who uploaded nothing.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const chip = canvas.getByRole("button", { name: NAME })

		const avatar = avatarIn(canvasElement)

		await expect(chip).toBeVisible()
		await expect(avatar).toBeVisible()
		await expect(uniqueCount(avatarInsets(chip, avatar).slice(0, 3))).toBe(1)

		await userEvent.tab()
		await expect(chip).toHaveFocus()
		await expect(chip.matches(":focus-visible")).toBe(true)

		await userEvent.click(chip)
		await expect(args.onOpen).toHaveBeenCalledTimes(1)

		await userEvent.keyboard("{Enter}")
		await expect(args.onOpen).toHaveBeenCalledTimes(2)
	},
})

export const WithoutPicture = meta.story({
	args: { image: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"A reader who never uploaded a picture, which is most of them on the first run. Check that the initials of the display name fill the same circle the picture would have — so the name beside it lands on the same column either way — and that the row keeps one accessible name rather than announcing the initials as well. Pick `Default` for the same reader with a picture.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const avatar = avatarIn(canvasElement)

		await expect(avatar).toHaveTextContent("AM")
		await expect(canvas.getByRole("button", { name: NAME })).toBeVisible()
	},
})

export const WithoutName = meta.story({
	args: { name: "", image: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"A host with no display name to give — a local account, or a profile that has not been filled in. Check that the row reads `You` rather than an empty target, that the circle carries its initial, and that the row is still named for assistive technology: a reader with no name still has to find the way into their own settings. Pick `WithoutPicture` for a named reader with no picture.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvas.getByRole("button", { name: FALLBACK_NAME }),
		).toBeVisible()
		await expect(avatarIn(canvasElement)).toHaveTextContent("Y")
	},
})

export const LongContent = meta.story({
	args: { name: LONG_NAME },
	parameters: {
		docs: {
			description: {
				story:
					"A display name wider than the panel — a double-barrelled name, or a full legal one. Check that it is clipped on one line with an ellipsis instead of wrapping onto a second, that the row keeps the height it has in `Default` so the region under the list never grows, and that nothing spills past the edge of the panel. The accessible name stays the whole name, only the drawing is cut.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const chip = canvas.getByRole("button", { name: LONG_NAME })
		const label = canvas.getByText(LONG_NAME)
		const panel = panelIn(canvasElement)

		await expect(label.scrollWidth).toBeGreaterThan(label.clientWidth)
		await expect(label.getBoundingClientRect().height).toBeLessThanOrEqual(
			SINGLE_LINE_HEIGHT,
		)
		await expect(chip.getBoundingClientRect().right).toBeLessThanOrEqual(
			panel.getBoundingClientRect().right,
		)
	},
})

export const OnRail = meta.story({
	render: renderShell(false),
	parameters: {
		docs: {
			description: {
				story:
					"The same row once the panel collapses to its rail, which is how a host restores a remembered choice through `defaultOpen`. Check that the target is a square the same inset on all four edges rather than a band across the rail — the name is gone, so the room it took goes with it — that the picture is left alone and centred on the rail, that the name is drawn nowhere yet still names the row — so the way into the settings survives the collapse — and that nothing is clipped against either edge. Pick `Default` for the expanded panel.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const chip = canvas.getByRole("button", { name: NAME })
		const avatar = avatarIn(canvasElement)

		await expect(chip).toHaveAttribute("aria-label", NAME)
		await expect(canvas.getByText(NAME)).toHaveAttribute("aria-hidden", "true")

		const chipBox = chip.getBoundingClientRect()
		await expect(chipBox.width).toBeCloseTo(chipBox.height, 0)
		await expect(uniqueCount(avatarInsets(chip, avatar))).toBe(1)

		await waitFor(async () => {
			await expect(horizontalCentreOf(avatar)).toBeCloseTo(
				horizontalCentreOf(chip),
				0,
			)
		}, FRAME_POLL)

		const panelBox = panelIn(canvasElement).getBoundingClientRect()
		const avatarBox = avatar.getBoundingClientRect()
		await expect(avatarBox.left).toBeGreaterThanOrEqual(panelBox.left)
		await expect(avatarBox.right).toBeLessThanOrEqual(panelBox.right)
	},
})
