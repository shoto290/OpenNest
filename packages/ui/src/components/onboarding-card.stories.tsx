import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import {
	OnboardingAction,
	OnboardingActions,
	OnboardingCard,
} from "@workspace/ui/components/onboarding-card"

const LONG_TITLE =
	"Ready when you are, and ready to keep going for as long as this first run of yours takes"

const EXITS = (
	<OnboardingActions>
		<OnboardingAction emphasis="primary">Start</OnboardingAction>
		<OnboardingAction emphasis="secondary">Tell me more first</OnboardingAction>
	</OnboardingActions>
)

const meta = preview.meta({
	title: "Conversation/Onboarding/OnboardingCard",
	component: OnboardingCard,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The shell every onboarding card is drawn on: the surface, its title line with the step counter trailing, and the rhythm its blocks stack on. Reach for it when a new onboarding step needs a card; reach for `OnboardingPickerCard` or `OnboardingHandoffCard` for the steps that already exist.",
			},
		},
	},
	args: {
		title: "Ready when you are",
		counter: "3 steps",
		children: EXITS,
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A card whose title fits its line. Check that the counter sits at the trailing edge of that line, in the muted foreground, and that the action row keeps a primary and a secondary exit side by side. Pick `LongContent` for the title that has to wrap.",
			},
		},
	},
})

export const LongContent = meta.story({
	args: { title: LONG_TITLE },
	parameters: {
		docs: {
			description: {
				story:
					"A title longer than its line, in a container squeezed under the card's measured width. Check that the title wraps while the counter stays whole on the first line, that the card fits the container instead of overflowing it, and that nothing scrolls sideways.",
			},
		},
	},
	render: (args) => (
		<div className="w-80 max-w-full">
			<OnboardingCard {...args} />
		</div>
	),
	play: async ({ canvasElement }) => {
		const card = slotIn(canvasElement, "onboarding-card")
		const title = slotIn(canvasElement, "onboarding-card-title")
		const counter = slotIn(canvasElement, "onboarding-card-counter")

		const titleBox = title.getBoundingClientRect()
		const counterBox = counter.getBoundingClientRect()

		await expect(titleBox.height).toBeGreaterThan(counterBox.height)
		await expect(counterBox.top).toBeLessThan(titleBox.top + counterBox.height)
		await expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth)
	},
})
