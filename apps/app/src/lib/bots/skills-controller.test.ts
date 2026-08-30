import { describe, expect, it } from "vitest"

import { createSkillsController } from "./skills-controller"

import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import type { BotSkill, BotSkillDraft } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

const A_SKILL = {
	name: "Release notes",
	description: "How this project words a changelog entry",
	body: "One line per change.",
}

const opened = async (store: TranscriptStore, botId = "default") => {
	const controller = createSkillsController(store)
	await controller.open(botId)
	return controller
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

const readers = (skills: BotSkill[]) =>
	skills.filter((skill) => !skill.isSystem)

const readerSkills = async (store: TranscriptStore) =>
	readers(await store.botSkills("default"))

const movingSkill = (store: TranscriptStore, id: string): TranscriptStore => ({
	...store,
	updateBotSkill: async (botId, skillId, draft) => ({
		...(await store.updateBotSkill(botId, skillId, draft)),
		id,
	}),
})

describe("skills controller", () => {
	it("opens on the skills the bundle already holds", async () => {
		const store = createFakeTranscriptStore()
		await store.createBotSkill("default", A_SKILL)

		const controller = await opened(store)

		expect(readers(controller.getState().skills)).toMatchObject([A_SKILL])
	})

	it("creates a skill with everything the reader gave", async () => {
		const store = createFakeTranscriptStore()
		const controller = await opened(store)

		controller.create(A_SKILL, false)
		await settled()

		expect(await readerSkills(store)).toMatchObject([
			{ ...A_SKILL, isPreloaded: false },
		])
	})

	it("creates a skill already carried, when that is what was asked for", async () => {
		const store = createFakeTranscriptStore()
		const controller = await opened(store)

		controller.create(A_SKILL, true)
		await settled()

		expect(readers(controller.getState().skills)).toMatchObject([
			{ isPreloaded: true },
		])
		expect((await readerSkills(store))[0].isPreloaded).toBe(true)
	})

	it("writes a save to the skill it was opened on, by id", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createBotSkill("default", A_SKILL)
		const controller = await opened(store)

		controller.save(written.id, { ...A_SKILL, name: "Changelog" })
		await settled()

		const [held] = await readerSkills(store)
		expect(held).toMatchObject({ id: written.id, name: "Changelog" })
	})

	it("writes every field the save carried, once", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createBotSkill("default", A_SKILL)
		const drafts: BotSkillDraft[] = []
		const counted: TranscriptStore = {
			...store,
			updateBotSkill: (botId, skillId, draft) => {
				drafts.push(draft)
				return store.updateBotSkill(botId, skillId, draft)
			},
		}
		const controller = await opened(counted)

		controller.save(written.id, {
			...A_SKILL,
			allowedTools: ["Read"],
			model: "",
			whenToUse: "Whenever a release is cut",
		})
		await settled()

		expect(drafts).toEqual([
			{
				...A_SKILL,
				allowedTools: ["Read"],
				model: "",
				whenToUse: "Whenever a release is cut",
			},
		])
		expect(readers(controller.getState().skills)[0]).toMatchObject({
			allowedTools: ["Read"],
			whenToUse: "Whenever a release is cut",
		})
	})

	it("puts the reader back on what the bundle holds when a save is refused", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createBotSkill("default", A_SKILL)
		const refusing: TranscriptStore = {
			...store,
			updateBotSkill: () => Promise.reject({ kind: "unwritableBundle" }),
		}
		const controller = await opened(refusing)

		controller.save(written.id, { ...A_SKILL, name: "Changelog" })
		await settled()

		expect(readers(controller.getState().skills)).toMatchObject([A_SKILL])
	})

	it("leaves the host's own skill as the bundle holds it when a save is refused", async () => {
		const store = createFakeTranscriptStore()
		const controller = await opened(store)

		controller.save("learn", A_SKILL)
		await settled()

		expect(controller.getState().skills).toMatchObject([
			{ id: "learn", name: "learn", isSystem: true },
		])
	})

	it("sets the preload mark on its own", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createBotSkill("default", A_SKILL)
		const controller = await opened(store)

		controller.setPreloaded(written.id, true)
		await settled()

		expect((await readerSkills(store))[0].isPreloaded).toBe(true)
	})

	it("takes a skill away", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createBotSkill("default", A_SKILL)
		const controller = await opened(store)

		controller.remove(written.id)
		await settled()

		expect(readers(controller.getState().skills)).toEqual([])
		expect(await readerSkills(store)).toEqual([])
	})

	it("writes nothing while no bot is open", async () => {
		const store = createFakeTranscriptStore()
		const controller = createSkillsController(store)

		controller.create(A_SKILL, false)
		await settled()

		expect(await readerSkills(store)).toEqual([])
	})

	it("opens a file the skill holds on its text", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createBotSkill("default", A_SKILL)
		await store.writeBotSkillFile(
			"default",
			written.id,
			"reference/api.md",
			"# API",
		)
		const controller = await opened(store)

		controller.openFile(written.id, "reference/api.md")
		await settled()

		expect(controller.getState().file).toMatchObject({
			path: "reference/api.md",
			text: "# API",
		})
		expect(readers(controller.getState().skills)[0].files).toEqual([
			"reference/api.md",
		])
	})

	it("adds a file empty and opens it", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createBotSkill("default", A_SKILL)
		const controller = await opened(store)

		controller.addFile(written.id, "examples/1.4.0.md")
		await settled()

		expect(controller.getState().file).toMatchObject({
			path: "examples/1.4.0.md",
			text: "",
		})
		expect(readers(controller.getState().skills)[0].files).toEqual([
			"examples/1.4.0.md",
		])
	})

	it("saves what the reader typed back to the file", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createBotSkill("default", A_SKILL)
		const controller = await opened(store)

		controller.addFile(written.id, "notes.md")
		await settled()
		controller.saveFile(written.id, "notes.md", "One line per change.")
		await settled()

		expect(await store.botSkillFile("default", written.id, "notes.md")).toBe(
			"One line per change.",
		)
	})

	it("takes a file out of the skill and closes it", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createBotSkill("default", A_SKILL)
		const controller = await opened(store)

		controller.addFile(written.id, "notes.md")
		await settled()
		controller.removeFile(written.id, "notes.md")
		await settled()

		expect(controller.getState().file).toBe(null)
		expect(readers(controller.getState().skills)[0].files).toEqual([])
	})

	it("keeps the file open with the failure when a save is refused", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createBotSkill("default", A_SKILL)
		await store.writeBotSkillFile("default", written.id, "notes.md", "One line")
		const refusing: TranscriptStore = {
			...store,
			writeBotSkillFile: () => Promise.reject({ kind: "unwritableBundle" }),
		}
		const controller = await opened(refusing)

		controller.openFile(written.id, "notes.md")
		await settled()
		controller.saveFile(written.id, "notes.md", "Another line")
		await settled()

		expect(controller.getState().file).toMatchObject({
			path: "notes.md",
			text: "One line",
			failure: "write",
		})
	})

	it("says so when a file cannot be read", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createBotSkill("default", A_SKILL)
		const controller = await opened(store)

		controller.openFile(written.id, "missing.md")
		await settled()

		expect(controller.getState().file).toMatchObject({
			path: "missing.md",
			failure: "read",
		})
	})

	it("carries an open file to the id a renamed skill comes back under", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createBotSkill("default", A_SKILL)
		await store.writeBotSkillFile("default", written.id, "notes.md", "One line")
		const renaming = movingSkill(store, "changelog")
		const controller = await opened(renaming)

		controller.openFile(written.id, "notes.md")
		await settled()
		controller.save(written.id, { ...A_SKILL, name: "changelog" })
		await settled()

		expect(controller.getState().file).toMatchObject({
			skillId: "changelog",
			path: "notes.md",
		})
	})

	it("leaves an open file of another skill where it is on a rename", async () => {
		const store = createFakeTranscriptStore()
		const kept = await store.createBotSkill("default", A_SKILL)
		const renamed = await store.createBotSkill("default", {
			...A_SKILL,
			name: "Commit style",
		})
		await store.writeBotSkillFile("default", kept.id, "notes.md", "One line")
		const renaming = movingSkill(store, "changelog")
		const controller = await opened(renaming)

		controller.openFile(kept.id, "notes.md")
		await settled()
		controller.save(renamed.id, { ...A_SKILL, name: "changelog" })
		await settled()

		expect(controller.getState().file).toMatchObject({ skillId: kept.id })
	})
})
