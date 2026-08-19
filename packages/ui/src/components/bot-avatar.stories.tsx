import type { ReactNode } from "react"
import { useArgs } from "storybook/preview-api"
import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotsIn } from "@workspace/storybook/story-utils"
import { BLOT_TINTS, BotAvatar } from "@workspace/ui/components/bot-avatar"
import {
	ANIMALS,
	type BotAvatarAnimal,
} from "@workspace/ui/components/bot-avatar-animals"
import {
	type BotAvatarState,
	STATE_GROUPS,
	STATE_POOLS,
	STATE_POSES,
} from "@workspace/ui/components/bot-avatar-data"

const BOT_AVATAR_ANIMALS = Object.keys(ANIMALS) as BotAvatarAnimal[]
const BOT_AVATAR_STATES = Object.keys(STATE_POOLS) as BotAvatarState[]
const YAW_SWEEP = [-60, -40, -20, 0, 20, 40, 60]
const PITCH_SWEEP = [-40, -25, -12, 0, 12, 25, 40]
const WELD_SIZE = 88
/** Eight bot ids, one per pose a blot can be laid down in. */
const BLOT_SEEDS = [
	"bot-1",
	"bot-2",
	"bot-7",
	"bot-8",
	"bot-5",
	"bot-6",
	"bot-3",
	"bot-4",
]
const STRESS_COUNT = 60

const GROUPED_STATES = Object.entries(STATE_GROUPS).flatMap(([group, states]) =>
	states.map((state) => ({ group, state })),
)

const STATE_OPTIONS = [
	...GROUPED_STATES.map((entry) => entry.state),
	...BOT_AVATAR_STATES.filter(
		(state) => !GROUPED_STATES.some((entry) => entry.state === state),
	),
]

const STATE_LABELS = Object.fromEntries(
	STATE_OPTIONS.map((state) => [
		state,
		`${GROUPED_STATES.find((entry) => entry.state === state)?.group ?? "Other"} · ${state}`,
	]),
)

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

type SweepRowProps = {
	animal: BotAvatarAnimal
	axis: "yaw" | "pitch"
	angles: number[]
	debug: boolean
}

function SweepRow({ animal, axis, angles, debug }: SweepRowProps) {
	return (
		<div className="flex items-end gap-2">
			{angles.map((angle) => (
				<LabeledCell key={angle} label={`${angle}°`}>
					<BotAvatar
						animal={animal}
						animated={false}
						pitch={axis === "pitch" ? angle : 0}
						roll={0}
						size={WELD_SIZE}
						wireframe={debug}
						yaw={axis === "yaw" ? angle : 0}
					/>
				</LabeledCell>
			))}
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
		perspective: 0.55,
		ink: "bold",
		wireframe: false,
		interactive: false,
	},
	argTypes: {
		animal: { control: "select", options: BOT_AVATAR_ANIMALS },
		state: {
			control: "select",
			options: STATE_OPTIONS,
			labels: STATE_LABELS,
		},
		size: { control: { type: "range", min: 48, max: 480, step: 8 } },
		yaw: { control: { type: "range", min: -70, max: 70, step: 1 } },
		pitch: { control: { type: "range", min: -50, max: 50, step: 1 } },
		roll: { control: { type: "range", min: -60, max: 60, step: 1 } },
		perspective: { control: { type: "range", min: 0, max: 1, step: 0.05 } },
		ink: {
			control: "inline-radio",
			options: ["regular", "bold", "heavy"],
		},
		blot: { control: "select", options: [undefined, ...BLOT_TINTS] },
		seed: { control: "text" },
		animated: { control: "boolean" },
		wireframe: { control: "boolean" },
		interactive: { control: "boolean" },
	},
})

export const Lab3D = meta.story({
	name: "Lab 3D",
	args: {
		...STATE_POSES.waiting,
		size: 360,
		interactive: true,
		perspective: 0,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Opens on the locked reference pose — cat, waiting, orthographic. The bench for the whole rig: pick an animal, switch to any engine state, dial the `ink` weight, then drive the head with the yaw / pitch / roll sliders or by dragging the avatar itself — the sliders follow the drag. Each orientation prop overrides that axis of the state's own rest pose; leave it unset and the state decides, as it does everywhere else in the system. `perspective` blends from a flat orthographic projection (0) to a full weak-perspective one (1); `wireframe` overlays the head volume, its silhouette conic, the parallels culled to the near sheet and the resolved ear anchors. Check that eyes slide along the surface instead of sliding flat, and that each ear stays welded to the skull outline while the part of it that crosses behind the head plane is cut away by the head rather than the whole ear jumping layers.",
			},
		},
	},
	render: (args) => {
		const [, updateArgs] = useArgs()
		return <BotAvatar {...args} onOrientationChange={updateArgs} />
	},
})

export const Playground = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to audition any animal in any engine state with live animation. Check that eyes, ears and head move as one group, that the head keeps breathing with about a degree of ambient drift, and that the sketch line only boils on active states.",
			},
		},
	},
})

export const Rotation = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The same avatar swept across yaw, frozen at each angle. Reach for this to prove the rig is a real volume: the silhouette narrows, the eyes travel along the head's surface and foreshorten near the edge, and the ears swap sides as they cross the head plane.",
			},
		},
	},
	render: (args) => (
		<div className="flex items-end gap-2">
			{YAW_SWEEP.map((yaw) => (
				<LabeledCell key={yaw} label={`${yaw}°`}>
					<BotAvatar
						{...args}
						animated={false}
						pitch={0}
						roll={0}
						size={120}
						yaw={yaw}
					/>
				</LabeledCell>
			))}
		</div>
	),
})

export const EarWeld = meta.story({
	name: "Ear Weld",
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				story:
					"The ear-to-skull joint under review, swept across yaw then pitch at chip size on a dark panel — the size and contrast where a floating ear used to be most obvious. Each sweep is shown twice: clean, then with `wireframe` on as the debug pass, where the orange dots mark the ear anchors resolved against the head silhouette as it is actually drawn that frame. Check that no dot ever leaves the outline, that the ear base shows no gap and no second stroke against the skull, and that the anchors slide around the skull as the head turns rather than sitting at a fixed spot on the drawing.",
			},
		},
	},
	render: (args) => (
		<div className="dark flex flex-col gap-6 bg-background p-8 text-foreground">
			{(["yaw", "pitch"] as const).map((axis) => (
				<div className="flex flex-col gap-2" key={axis}>
					<h3 className="font-medium text-muted-foreground text-sm">{axis}</h3>
					{[false, true].map((debug) => (
						<SweepRow
							angles={axis === "yaw" ? YAW_SWEEP : PITCH_SWEEP}
							animal={args.animal ?? "cat"}
							axis={axis}
							debug={debug}
							key={String(debug)}
						/>
					))}
				</div>
			))}
		</div>
	),
})

export const Wireframe = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Every animal with its head volume exposed, turned three quarters. The volume is solved from the drawn head path itself rather than from its control points, so the conic must hug the silhouette on every animal. Reach for this when authoring a new animal: the grid must stop exactly where the surface turns away from the viewer, and the two orange dots — the resolved ear anchors — must sit on the outline, not beside it.",
			},
		},
	},
	render: () => (
		<div className="grid grid-cols-4 gap-4">
			{BOT_AVATAR_ANIMALS.map((animal) => (
				<LabeledCell key={animal} label={animal}>
					<BotAvatar
						animal={animal}
						animated={false}
						pitch={12}
						roll={0}
						size={150}
						wireframe
						yaw={28}
					/>
				</LabeledCell>
			))}
		</div>
	),
})

export const AllStates = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Every engine state running live, side by side and grouped as in the engine's lifecycle tables. Reach for this to compare expressions, ear poses and cadences at a glance — States covers the same matrix as frozen poses when you need a stable reference.",
			},
		},
	},
	render: (args) => (
		<div className="flex flex-col gap-8">
			{Object.entries(STATE_GROUPS).map(([group, states]) => (
				<div key={group}>
					<h3 className="mb-3 font-medium text-muted-foreground text-sm">
						{group}
					</h3>
					<div className="grid grid-cols-7 gap-4">
						{states.map((state) => (
							<LabeledCell key={state} label={state}>
								<BotAvatar {...args} size={96} state={state} />
							</LabeledCell>
						))}
					</div>
				</div>
			))}
		</div>
	),
})

export const Stress = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Sixty live avatars on one shared animation clock — every mounted engine subscribes to a single requestAnimationFrame loop rather than opening its own. Reach for this before shipping the avatar into a list or a transcript: scroll and watch for dropped frames, then flip `wireframe` on to see the per-frame geometry cost.",
			},
		},
	},
	render: (args) => (
		<div className="grid grid-cols-10 gap-1">
			{Array.from({ length: STRESS_COUNT }, (_, index) => (
				<BotAvatar
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed length stress grid
					key={index}
					{...args}
					animal={BOT_AVATAR_ANIMALS[index % BOT_AVATAR_ANIMALS.length]}
					size={64}
					state={BOT_AVATAR_STATES[index % BOT_AVATAR_STATES.length]}
				/>
			))}
		</div>
	),
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
					"Every engine state rendered as a static pose, grouped as in the engine's lifecycle tables. Reach for this to verify a state's expression and ear pose without waiting for random cadences — AllStates covers the same matrix live.",
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

export const Blots = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The eight tints a bot can be marked with, drawn once behind the whole animal, plus the avatar with no blot at all. The blot sits outside the sketch filter, so it never boils with the line and never animates — the ink is what moves, the mark is what stays. All eight are light on purpose: the line is near-black and the ear accent is coral, and neither reads over anything darker. Reach for this when adding a tint, and check on both themes — the tints do not flip under `.dark`, so a bot's mark is the same colour wherever it is shown. The first cell is the markup the avatar renders without a blot and must be untouched by any of this. Pick `BlotShapes` for the shapes one tint is laid down in.",
			},
		},
	},
	render: (args) => (
		<div className="grid grid-cols-3 gap-6">
			<LabeledCell label="none">
				<BotAvatar {...args} animated={false} blot={undefined} size={120} />
			</LabeledCell>
			{BLOT_TINTS.map((blot) => (
				<LabeledCell key={blot} label={blot}>
					<BotAvatar {...args} animated={false} blot={blot} size={120} />
				</LabeledCell>
			))}
		</div>
	),
})

export const BlotShapes = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Eight bots on one tint and one animal, told apart by nothing but their id. The blot is the one authored outline in all eight — the seed only decides which quarter turn it is laid down at and whether it is mirrored, so the silhouette a reader learns is never redrawn and never warped. These ids cover all eight poses, and the first is the pose the outline was authored in, which is what an avatar with no seed draws. Reach for this when the ink or the outline changes: check that every pose still fills the same square, that none of them clips the animal or the edge of the box, and that the tint is identical across the row. Pick `Blots` for the eight tints on one shape.",
			},
		},
	},
	render: (args) => (
		<div className="grid grid-cols-4 gap-6">
			{BLOT_SEEDS.map((seed) => (
				<LabeledCell key={seed} label={seed}>
					<BotAvatar
						{...args}
						animated={false}
						blot="sky"
						seed={seed}
						size={120}
					/>
				</LabeledCell>
			))}
		</div>
	),
	play: async ({ canvasElement }) => {
		const shapes = slotsIn(canvasElement, "bot-avatar-blot").map((blot) =>
			blot.getAttribute("transform"),
		)

		await expect(new Set(shapes).size).toBe(BLOT_SEEDS.length)
	},
})

export const Sizes = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The same avatar from chip to hero size, as static poses. The ink is authored in rendered pixels, so the outline holds a marker weight at 40px instead of thinning to a hairline, and the sketch displacement is retuned against it. Reach for this when embedding the avatar in a new surface: check the four sizes read as the same pen and that nothing clips at small sizes.",
			},
		},
	},
	render: () => (
		<div className="flex items-end gap-6">
			{[40, 88, 140, 240].map((size) => (
				<LabeledCell key={size} label={`${size}px`}>
					<BotAvatar animated={false} size={size} />
				</LabeledCell>
			))}
		</div>
	),
})
