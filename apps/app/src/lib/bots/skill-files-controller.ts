import type { BotSkill } from "../conversations/store-contract"

export type SkillFileFailure = "read" | "write" | "delete"

export type OpenedSkillFile = {
	skillId: string
	path: string
	text?: string
	failure?: SkillFileFailure
}

export type SkillFilesPort = {
	read: (skillId: string, path: string) => Promise<string>
	write: (skillId: string, path: string, text: string) => Promise<BotSkill>
	remove: (skillId: string, path: string) => Promise<void>
}

export type SkillFilesHost = {
	run: (task: () => Promise<void>) => void
	getFile: () => OpenedSkillFile | null
	setFile: (file: OpenedSkillFile | null) => void
	getSkills: () => BotSkill[]
	applySkill: (skillId: string, fields: Partial<BotSkill>) => void
}

export type SkillFilesController = {
	openFile: (skillId: string, path: string) => void
	closeFile: () => void
	addFile: (skillId: string, path: string) => void
	saveFile: (skillId: string, path: string, text: string) => void
	removeFile: (skillId: string, path: string) => void
}

export const createSkillFilesController = (
	port: SkillFilesPort,
	host: SkillFilesHost,
): SkillFilesController => {
	const applyToOpen = (
		skillId: string,
		path: string,
		fields: Partial<OpenedSkillFile>,
	) => {
		const open = host.getFile()
		if (open?.skillId === skillId && open.path === path) {
			host.setFile({ ...open, ...fields })
		}
	}

	const closeOpen = (skillId: string, path: string) => {
		const open = host.getFile()
		if (open?.skillId === skillId && open.path === path) {
			host.setFile(null)
		}
	}

	const keepPaths = (skill: BotSkill) =>
		host.applySkill(skill.id, { files: skill.files })

	const heldPaths = (skillId: string) =>
		host.getSkills().find((skill) => skill.id === skillId)?.files ?? []

	return {
		openFile: (skillId: string, path: string) => {
			host.setFile({ skillId, path })
			host.run(async () => {
				try {
					applyToOpen(skillId, path, { text: await port.read(skillId, path) })
				} catch {
					applyToOpen(skillId, path, { failure: "read" })
				}
			})
		},

		closeFile: () => host.setFile(null),

		addFile: (skillId: string, path: string) => {
			host.setFile({ skillId, path })
			host.run(async () => {
				try {
					keepPaths(await port.write(skillId, path, ""))
					applyToOpen(skillId, path, { text: "" })
				} catch {
					applyToOpen(skillId, path, { failure: "write" })
				}
			})
		},

		saveFile: (skillId: string, path: string, text: string) =>
			host.run(async () => {
				try {
					keepPaths(await port.write(skillId, path, text))
					applyToOpen(skillId, path, { text, failure: undefined })
				} catch {
					applyToOpen(skillId, path, { failure: "write" })
				}
			}),

		removeFile: (skillId: string, path: string) =>
			host.run(async () => {
				try {
					await port.remove(skillId, path)
					host.applySkill(skillId, {
						files: heldPaths(skillId).filter((held) => held !== path),
					})
					closeOpen(skillId, path)
				} catch {
					applyToOpen(skillId, path, { failure: "delete" })
				}
			}),
	}
}
