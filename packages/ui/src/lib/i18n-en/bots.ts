import type { BotAvatarBlot } from "@workspace/ui/components/bot-avatar"
import type { BotAvatarAnimal } from "@workspace/ui/components/bot-avatar-animals"

/** Every string a reader sees on the bots surface — the roster, the resource tree,
 * the settings dialog and the delete it guards. */
const bots = {
	roster: {
		label: "Conversations",
		create: "New bot",
		empty: "No bots yet",
		actions: "Actions for {{name}}",
		settings: "Settings",
		delete: "Delete",
		working: "{{pose}}…",
		pose: {
			thinking: "thinking",
			searching: "searching",
			working: "working",
			writing: "writing",
			waiting: "waiting",
		},
		idle: "idle",
		announcement: {
			none: "No bot selected",
			selected: "{{name}} selected, {{state}}",
		},
	},
	resources: {
		label: "Resources",
		actions: "Actions for {{name}}",
		rename: "Rename {{name}}",
		item: "item",
		itemLead: "Item",
		menu: {
			rename: "Rename",
		},
		position: {
			before: "before",
			inside: "inside",
			after: "after",
		},
		move: {
			toTopLevel: "Move to top level",
			busy: "Wait for the current move to finish.",
			done: "Moved {{name}} {{position}} {{target}}.",
			doneAtTopLevel: "Moved {{name}} to the top level.",
			failed: "Move failed. {{name}} was restored.",
		},
		renameFailed: "Rename failed. {{name}} was restored.",
	},
	dialog: {
		untitled: "Untitled bot",
		breadcrumb: "Settings",
		tab: {
			general: "General",
			appearance: "Appearance",
			instructions: "Instructions",
			runtime: "Runtime",
			danger: "Danger zone",
		},
		name: {
			label: "Name",
			placeholder: "No name",
		},
		title: {
			label: "Title",
			placeholder: "Short role label",
		},
		instructions: {
			label: "Instructions",
			placeholder: "The system prompt this bot always runs with",
		},
	},
	runtime: {
		model: {
			label: "Model",
			placeholder: "Choose a model",
		},
		directory: {
			label: "Working directory",
			placeholder: "Choose a folder",
			browse: "Change",
		},
	},
	identity: {
		avatar: "Avatar",
		uploadedImage: "Uploaded image",
		current: "{{animal}}, {{blot}}",
		animal: {
			label: "Animal",
			/** One key per animal, keyed by the id the identity carries, so an animal
			 * the engine gains and this catalogue has no name for fails the type check
			 * rather than rendering its id at a reader. */
			option: {
				rabbit: "Rabbit",
				cat: "Cat",
				bear: "Bear",
				chick: "Chick",
				dog: "Dog",
				mouse: "Mouse",
				owl: "Owl",
				koala: "Koala",
			} as const satisfies Record<BotAvatarAnimal, string>,
		},
		blot: {
			label: "Blot",
			none: "No blot",
			/** One key per tint, on the same terms as the animals above. */
			option: {
				coral: "Coral",
				amber: "Amber",
				moss: "Moss",
				water: "Water",
				sky: "Sky",
				lavender: "Lavender",
				rose: "Rose",
				slate: "Slate",
			} as const satisfies Record<BotAvatarBlot, string>,
		},
		picture: "Picture",
		pictureFile: "Avatar image file",
	},
	danger: {
		delete: "Delete bot",
		description:
			"Its avatar, instructions and working directory go with it. This cannot be undone.",
		confirm: {
			title: "Delete {{name}}?",
			cancel: "Cancel",
		},
	},
} as const

export { bots }
