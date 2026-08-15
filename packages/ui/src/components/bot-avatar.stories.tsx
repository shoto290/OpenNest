import type { ReactNode } from "react"

import preview from "@workspace/storybook/preview"
import { BotAvatar } from "@workspace/ui/components/bot-avatar"
import {
	ANIMALS,
	type BotAvatarAnimal,
} from "@workspace/ui/components/bot-avatar-animals"
import {
	type BotAvatarState,
	STATE_GROUPS,
	STATE_POOLS,
} from "@workspace/ui/components/bot-avatar-data"

const BOT_AVATAR_ANIMALS = Object.keys(ANIMALS) as BotAvatarAnimal[]
const BOT_AVATAR_STATES = Object.keys(STATE_POOLS) as BotAvatarState[]

function LabeledCell({
	label,
	children,
}: {
	label: string
	children: ReactNode
}) {
	return (
		<div className="flex flex-col items-center gap-1">
			{children}
			<span className="text-muted-foreground text-xs">{label}</span>
		</div>
	)
}

const meta = preview.meta({
	title: "Branding/Bot Avatar",
	component: BotAvatar,
	parameters: { layout: "centered" },
	args: {
		animal: "cat",
		state: "waiting",
		size: 240,
		animated: true,
	},
	argTypes: {
		animal: { control: "select", options: BOT_AVATAR_ANIMALS },
		state: { control: "select", options: BOT_AVATAR_STATES },
		size: { control: { type: "range", min: 48, max: 480, step: 8 } },
		animated: { control: "boolean" },
	},
})

export const Playground = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to audition any animal in any engine state with live animation. Check that eyes, ears and head move as one group and that the sketch line only boils on active states.",
			},
		},
	},
})

export const Variants = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Every available animal at rest, side by side as static poses. Reach for this when picking which animal represents a given AI. Check that each silhouette stays recognisable at a glance and that ear shapes read distinctly from the neighbours — Playground covers live motion.",
			},
		},
	},
	render: () => (
		<div className="grid grid-cols-4 gap-6">
			{BOT_AVATAR_ANIMALS.map((animal) => (
				<LabeledCell key={animal} label={animal}>
					<BotAvatar animal={animal} animated={false} size={140} />
				</LabeledCell>
			))}
		</div>
	),
})

export const States = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Every engine state rendered as a static pose, grouped as in the engine's lifecycle tables. Reach for this to verify a state's expression and ear pose without waiting for random cadences — Playground covers the live motion.",
			},
		},
	},
	render: () => (
		<div className="flex flex-col gap-8">
			{Object.entries(STATE_GROUPS).map(([group, states]) => (
				<div key={group}>
					<h3 className="mb-3 font-medium text-muted-foreground text-sm">
						{group}
					</h3>
					<div className="grid grid-cols-7 gap-4">
						{states.map((state) => (
							<LabeledCell key={state} label={state}>
								<BotAvatar animated={false} size={88} state={state} />
							</LabeledCell>
						))}
					</div>
				</div>
			))}
		</div>
	),
})

export const Sizes = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The same avatar from chip to hero size, as static poses. Reach for this when embedding the avatar in a new surface: check the stroke keeps its hand-drawn feel when scaled down and that nothing clips at small sizes.",
			},
		},
	},
	render: () => (
		<div className="flex items-end gap-6">
			{[48, 88, 140, 240].map((size) => (
				<LabeledCell key={size} label={`${size}px`}>
					<BotAvatar animated={false} size={size} />
				</LabeledCell>
			))}
		</div>
	),
})
