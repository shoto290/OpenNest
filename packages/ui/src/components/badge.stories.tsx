import type { VariantProps } from "class-variance-authority"
import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	listExhaustively,
	Row,
	slotsIn,
} from "@workspace/storybook/story-utils"
import {
	Badge,
	BOT_BADGES,
	BotBadgeDot,
	BotTitleBadge,
	type badgeVariants,
} from "@workspace/ui/components/badge"

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>
const BADGE_VARIANTS = listExhaustively<BadgeVariant>({
	default: true,
	secondary: true,
	destructive: true,
	outline: true,
	ghost: true,
	link: true,
	dot: true,
})

const HOST_SIZES = [24, 40, 96]

const AVATAR_HOST = "relative block rounded-full bg-muted"

const SWITCHER_HOST =
	"group/sidebar flex h-7 items-center gap-1 rounded-2xl bg-sidebar px-2 text-sm"

const RAIL_HOST =
	"group/sidebar relative flex size-7 items-center justify-center rounded-2xl bg-sidebar"

const ROW_HOST = "relative flex h-9 w-40 flex-col justify-center text-sm"

const TITLE_HOST = "flex w-40 items-center gap-1.5 text-sm"

const BOT_TITLES = ["Ops", "Release manager for the platform", ""]

const CARD_HOST =
	"relative block size-10 rounded-full bg-card [--badge-ring:var(--color-card)]"

const dotsIn = (root: HTMLElement) => slotsIn(root, "bot-badge-dot")

const boxOf = (element: HTMLElement) => element.getBoundingClientRect()

const centerOf = (element: HTMLElement) =>
	boxOf(element).top + boxOf(element).height / 2

const meta = preview.meta({
	title: "Primitives/Badge",
	component: Badge,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The one badge in the system: a label with a variant API, and the `dot` variant every bot badge is drawn through. `BotBadgeDot` binds a tint — attention, done, failed — to a placement, and owns the mark's size, its ring and where it lands, so no call site writes badge geometry of its own.",
			},
		},
	},
	args: { children: "Badge" },
	argTypes: {
		variant: { control: "select", options: BADGE_VARIANTS },
		children: { control: "text" },
	},
})

export const Default = meta.story({})

export const Variants = meta.story({
	render: (args) => (
		<Row>
			{BADGE_VARIANTS.map((variant) => (
				<Badge {...args} key={variant} variant={variant}>
					{variant}
				</Badge>
			))}
		</Row>
	),
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"Every variant the badge carries, the label ones next to `dot`. Check that `dot` drops the label chrome entirely — no border, no padding, no text box, a round 8px mark — while the others keep the pill they are. Pick `BotBadges` for the tints the dot is drawn in.",
			},
		},
	},
})

export const BotBadges = meta.story({
	render: () => (
		<Row>
			{BOT_BADGES.map((badge) => (
				<span
					className={AVATAR_HOST}
					key={badge}
					style={{ width: 40, height: 40 }}
				>
					<BotBadgeDot badge={badge} placement="avatar" />
				</span>
			))}
		</Row>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The three things a bot badge can mean, on their own tokens: attention is orange and breathes because it is the only one asking the reader for something, done is green and failed is red and both hold still. Check the three colours hold across themes and across light and dark — they are fixed on purpose — and that only attention pulses, and only while motion is allowed. Pick `Placements` for where the mark lands.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const dots = dotsIn(canvasElement)

		await expect(dots.map((dot) => dot.dataset.badge)).toEqual([...BOT_BADGES])
		await expect(
			dots.map((dot) => dot.classList.contains("motion-safe:animate-pulse")),
		).toEqual([true, false, false])
		await expect(dots.map((dot) => dot.getAttribute("aria-hidden"))).toEqual([
			"true",
			"true",
			"true",
		])
	},
})

export const Placements = meta.story({
	render: () => (
		<Row>
			{HOST_SIZES.map((size) => (
				<span
					className={AVATAR_HOST}
					key={size}
					style={{ width: size, height: size }}
				>
					<BotBadgeDot badge="failed" placement="avatar" />
				</span>
			))}
			<span className={SWITCHER_HOST} data-state="expanded">
				<span>Perso</span>
				<BotBadgeDot badge="attention" placement="switcher" />
			</span>
			<span className={RAIL_HOST} data-state="collapsed">
				<span className="size-2.5 rounded-full bg-sidebar-foreground/30" />
				<BotBadgeDot badge="attention" placement="switcher" />
			</span>
			<span className={ROW_HOST}>
				<span className="h-5 leading-5">Atlas</span>
				<span className="h-4 text-xs leading-4">Pulled the papers</span>
				<BotBadgeDot badge="done" placement="row" />
			</span>
		</Row>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The three placements the component owns, each on the host it was drawn for. `avatar` pins the mark to the bottom corner and scales it with the avatar, capped at 16px, so it lands the same on a 24px reply as on a 96px preview — the roster keeps it for the collapsed rail, where the avatar is the whole row. `switcher` sits in the flow, on the name's line and level with the letters, and only jumps to the button's top corner once the sidebar collapses to its rail and there is no line left to sit on. `row` leaves the flow at the trailing edge of an open roster row, under the timestamp and level with the preview line, so the mark reads on the column the eye already scans instead of hiding on a 40px avatar. Check both corner forms keep the ring that lifts them off the surface, and that the inline one and the row one do not — they sit on the panel itself, with nothing behind them to punch through.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [small, medium, large, inline, rail, row] = dotsIn(canvasElement)

		await expect(boxOf(small).width).toBeCloseTo(24 * 0.34, 0)
		await expect(boxOf(medium).width).toBeCloseTo(40 * 0.34, 0)
		await expect(boxOf(large).width).toBeCloseTo(16, 0)

		const line = inline.previousElementSibling as HTMLElement
		await expect(boxOf(inline).width).toBeCloseTo(8, 0)
		await expect(centerOf(inline)).toBeCloseTo(centerOf(line), 0)

		const railHost = rail.parentElement as HTMLElement
		await expect(boxOf(rail).right).toBeLessThan(boxOf(railHost).right)
		await expect(boxOf(rail).top).toBeLessThan(
			boxOf(railHost).top + boxOf(railHost).height / 2,
		)

		const rowHost = row.parentElement as HTMLElement
		const preview = row.previousElementSibling as HTMLElement
		await expect(boxOf(row).right).toBeCloseTo(boxOf(rowHost).right, 0)
		await expect(centerOf(row)).toBeCloseTo(centerOf(preview), 0)
	},
})

export const OnAnotherSurface = meta.story({
	render: () => (
		<Row>
			<span className={CARD_HOST}>
				<BotBadgeDot badge="done" placement="avatar" />
			</span>
		</Row>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The same mark on a card rather than in the sidebar. The ring is a hole punched in whatever is behind the dot, so the surface names its own colour with `--badge-ring` and the badge takes it; left unset, it falls back to the sidebar it is drawn on most. Reach for this whenever a badge lands outside the sidebar — a dialog header, a card, a popover — and check the ring disappears into the surface instead of drawing a pale sidebar halo on it.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [dot] = dotsIn(canvasElement)
		const surface = dot.parentElement as HTMLElement

		await expect(getComputedStyle(dot).boxShadow).toContain(
			getComputedStyle(surface).backgroundColor,
		)
	},
})

export const BotTitles = meta.story({
	render: () => (
		<Row>
			{BOT_TITLES.map((title) => (
				<span className={TITLE_HOST} key={title || "untitled"}>
					<span className="truncate font-medium">Atlas</span>
					<BotTitleBadge className="max-w-16" title={title} />
				</span>
			))}
		</Row>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The one pill a bot title is drawn in, worn by the roster row and by the message header alike. It holds its width against a name that grows, cuts a title longer than the width its caller allows with an ellipsis, and disappears node and all when a bot carries no title, so a name without one keeps the line it always had. The maximum width comes from the caller: the roster row holds it at 64px, shown here, while the message header gives it more. Check the three cases read as one component, and that the pill stays legible on both themes.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const badges = slotsIn(canvasElement, "bot-title-badge")

		const [short, cut] = badges

		await expect(badges).toHaveLength(2)
		await expect(short.scrollWidth).toBe(short.clientWidth)
		await expect(cut.scrollWidth).toBeGreaterThan(cut.clientWidth)
		await expect(boxOf(short).width).toBeLessThan(boxOf(cut).width)
	},
})
