export type BotAvatarShape =
	| {
			kind: "path"
			role: "outline" | "accent" | "line"
			d: string
			strokeWidth?: number
	  }
	| {
			kind: "circle"
			role: "outline" | "accent"
			cx: number
			cy: number
			r: number
	  }
	| {
			kind: "ellipse"
			role: "outline" | "accent"
			cx: number
			cy: number
			rx: number
			ry: number
	  }

export type BotAvatarVolume = {
	center: [number, number]
	radii: [number, number, number]
}

export type BotAvatarEar = {
	pivot: [number, number]
	side: 1 | -1
	depth: number
	volume: BotAvatarVolume
	shapes: BotAvatarShape[]
}

export type BotAvatarAnimalDefinition = {
	faceY: number
	scale: number
	head: string
	headDepth: number
	ears: BotAvatarEar[]
	extras: BotAvatarShape[]
}

export const ANIMALS = {
	cat: {
		faceY: 122,
		scale: 0.52,
		head: "M58,92 C64,64 88,48 120,48 C152,48 176,64 182,92 C192,108 194,126 186,140 C192,145 190,153 182,155 C172,176 150,188 120,188 C90,188 68,176 58,155 C50,153 48,145 54,140 C46,126 48,108 58,92 Z",
		headDepth: 68,
		ears: [
			{
				pivot: [72, 72],
				side: -1,
				depth: -14,
				volume: { center: [67, 61], radii: [27, 35, 10] },
				shapes: [
					{
						kind: "path",
						role: "outline",
						d: "M56,96 C44,72 40,44 46,26 C64,32 82,46 94,58 C78,64 64,78 56,96 Z",
					},
					{ kind: "path", role: "accent", d: "M60,74 L56,42 L82,58 Z" },
				],
			},
			{
				pivot: [168, 72],
				side: 1,
				depth: -14,
				volume: { center: [173, 61], radii: [27, 35, 10] },
				shapes: [
					{
						kind: "path",
						role: "outline",
						d: "M184,96 C196,72 200,44 194,26 C176,32 158,46 146,58 C162,64 176,78 184,96 Z",
					},
					{ kind: "path", role: "accent", d: "M180,74 L184,42 L158,58 Z" },
				],
			},
		],
		extras: [],
	},
	rabbit: {
		faceY: 148,
		scale: 0.42,
		head: "M120,92 C154,92 178,116 178,148 C178,181 153,204 120,204 C87,204 62,181 62,148 C62,116 86,92 120,92 Z",
		headDepth: 56,
		ears: [
			{
				pivot: [96, 98],
				side: -1,
				depth: -10,
				volume: { center: [86, 61], radii: [20, 41, 8] },
				shapes: [
					{
						kind: "path",
						role: "outline",
						d: "M90,102 C74,84 66,46 76,20 C93,26 104,60 106,94 C100,96 94,98 90,102 Z",
					},
					{
						kind: "path",
						role: "accent",
						d: "M88,78 C83,62 82,44 86,34 C94,44 97,62 97,78 Z",
					},
				],
			},
			{
				pivot: [144, 98],
				side: 1,
				depth: -10,
				volume: { center: [154, 61], radii: [20, 41, 8] },
				shapes: [
					{
						kind: "path",
						role: "outline",
						d: "M150,102 C166,84 174,46 164,20 C147,26 136,60 134,94 C140,96 146,98 150,102 Z",
					},
					{
						kind: "path",
						role: "accent",
						d: "M152,78 C157,62 158,44 154,34 C146,44 143,62 143,78 Z",
					},
				],
			},
		],
		extras: [],
	},
	bear: {
		faceY: 130,
		scale: 0.52,
		head: "M120,74 C158,74 186,102 186,144 C186,178 158,198 120,198 C82,198 54,178 54,144 C54,102 82,74 120,74 Z",
		headDepth: 62,
		ears: [
			{
				pivot: [84, 72],
				side: -1,
				depth: -16,
				volume: { center: [84, 68], radii: [18, 18, 8] },
				shapes: [
					{ kind: "circle", role: "outline", cx: 84, cy: 68, r: 18 },
					{ kind: "circle", role: "accent", cx: 84, cy: 68, r: 8 },
				],
			},
			{
				pivot: [156, 72],
				side: 1,
				depth: -16,
				volume: { center: [156, 68], radii: [18, 18, 8] },
				shapes: [
					{ kind: "circle", role: "outline", cx: 156, cy: 68, r: 18 },
					{ kind: "circle", role: "accent", cx: 156, cy: 68, r: 8 },
				],
			},
		],
		extras: [],
	},
	chick: {
		faceY: 128,
		scale: 0.46,
		head: "M102,64 C108,60 116,60 122,64 C152,72 178,98 178,136 C178,172 152,198 120,198 C88,198 62,172 62,136 C62,98 76,72 102,64 Z",
		headDepth: 58,
		ears: [
			{
				pivot: [114, 62],
				side: 1,
				depth: -8,
				volume: { center: [119, 52], radii: [19, 14, 8] },
				shapes: [
					{
						kind: "path",
						role: "outline",
						d: "M100,66 C102,56 108,48 112,38 C116,46 117,54 116,60 C122,52 130,47 138,48 C134,56 128,62 122,66 C115,62 107,62 100,66 Z",
					},
				],
			},
		],
		extras: [],
	},
	dog: {
		faceY: 126,
		scale: 0.48,
		head: "M120,68 C148,68 168,86 172,112 C175,134 172,154 162,168 C152,182 138,190 120,190 C102,190 88,182 78,168 C68,154 65,134 68,112 C72,86 92,68 120,68 Z",
		headDepth: 55,
		ears: [
			{
				pivot: [88, 74],
				side: -1,
				depth: -12,
				volume: { center: [68, 113], radii: [22, 49, 9] },
				shapes: [
					{
						kind: "path",
						role: "outline",
						d: "M90,70 C70,64 54,76 50,98 C46,124 52,150 64,162 C76,154 84,132 86,106 C87,92 88,80 90,70 Z",
					},
					{
						kind: "path",
						role: "accent",
						d: "M64,104 C58,118 58,136 63,148 C71,140 75,124 75,110 Z",
					},
				],
			},
			{
				pivot: [152, 74],
				side: 1,
				depth: -12,
				volume: { center: [172, 113], radii: [22, 49, 9] },
				shapes: [
					{
						kind: "path",
						role: "outline",
						d: "M150,70 C170,64 186,76 190,98 C194,124 188,150 176,162 C164,154 156,132 154,106 C153,92 152,80 150,70 Z",
					},
					{
						kind: "path",
						role: "accent",
						d: "M176,104 C182,118 182,136 177,148 C169,140 165,124 165,110 Z",
					},
				],
			},
		],
		extras: [],
	},
	mouse: {
		faceY: 130,
		scale: 0.46,
		head: "M120,76 C144,76 166,98 170,132 C173,166 150,192 120,192 C90,192 67,166 70,132 C74,98 96,76 120,76 Z",
		headDepth: 53,
		ears: [
			{
				pivot: [86, 74],
				side: -1,
				depth: -14,
				volume: { center: [80, 56], radii: [24, 24, 10] },
				shapes: [
					{ kind: "circle", role: "outline", cx: 80, cy: 56, r: 24 },
					{ kind: "circle", role: "accent", cx: 80, cy: 56, r: 12 },
				],
			},
			{
				pivot: [154, 74],
				side: 1,
				depth: -14,
				volume: { center: [160, 56], radii: [24, 24, 10] },
				shapes: [
					{ kind: "circle", role: "outline", cx: 160, cy: 56, r: 24 },
					{ kind: "circle", role: "accent", cx: 160, cy: 56, r: 12 },
				],
			},
		],
		extras: [],
	},
	owl: {
		faceY: 122,
		scale: 0.48,
		head: "M120,72 C154,72 180,94 180,132 C180,168 154,190 120,190 C86,190 60,168 60,132 C60,94 86,72 120,72 Z",
		headDepth: 58,
		ears: [
			{
				pivot: [84, 80],
				side: -1,
				depth: -10,
				volume: { center: [80, 59], radii: [18, 25, 8] },
				shapes: [
					{
						kind: "path",
						role: "outline",
						d: "M78,84 C68,70 62,52 62,34 C76,44 90,60 98,74 C90,76 83,79 78,84 Z",
					},
					{ kind: "path", role: "accent", d: "M74,66 L70,46 L86,62 Z" },
				],
			},
			{
				pivot: [156, 80],
				side: 1,
				depth: -10,
				volume: { center: [160, 59], radii: [18, 25, 8] },
				shapes: [
					{
						kind: "path",
						role: "outline",
						d: "M162,84 C172,70 178,52 178,34 C164,44 150,60 142,74 C150,76 157,79 162,84 Z",
					},
					{ kind: "path", role: "accent", d: "M166,66 L170,46 L154,62 Z" },
				],
			},
		],
		extras: [
			{
				kind: "path",
				role: "line",
				strokeWidth: 4,
				d: "M120,92 C102,76 78,88 76,112 C74,136 94,152 120,158 C146,152 166,136 164,112 C162,88 138,76 120,92 Z",
			},
		],
	},
	koala: {
		faceY: 132,
		scale: 0.46,
		head: "M120,82 C154,82 182,104 184,140 C185,172 156,194 120,194 C84,194 55,172 56,140 C58,104 86,82 120,82 Z",
		headDepth: 60,
		ears: [
			{
				pivot: [78, 76],
				side: -1,
				depth: -14,
				volume: { center: [69, 59], radii: [31, 33, 12] },
				shapes: [
					{
						kind: "path",
						role: "outline",
						d: "M76,92 C54,92 38,74 40,52 C42,34 60,26 76,31 C92,37 100,52 97,68 C95,82 86,92 76,92 Z",
					},
					{ kind: "ellipse", role: "accent", cx: 66, cy: 58, rx: 13, ry: 15 },
				],
			},
			{
				pivot: [162, 76],
				side: 1,
				depth: -14,
				volume: { center: [171, 59], radii: [31, 33, 12] },
				shapes: [
					{
						kind: "path",
						role: "outline",
						d: "M164,92 C186,92 202,74 200,52 C198,34 180,26 164,31 C148,37 140,52 143,68 C145,82 154,92 164,92 Z",
					},
					{ kind: "ellipse", role: "accent", cx: 174, cy: 58, rx: 13, ry: 15 },
				],
			},
		],
		extras: [],
	},
} as const satisfies Record<string, BotAvatarAnimalDefinition>

export type BotAvatarAnimal = keyof typeof ANIMALS
