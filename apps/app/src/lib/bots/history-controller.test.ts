import { describe, expect, it, vi } from "vitest"

import { createHistoryController } from "./history-controller"
import { UNDONE_TITLE_PREFIX } from "./history-runs"

import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import type { TranscriptStore } from "../conversations/store-port"

const A_SKILL = {
	name: "Release notes",
	description: "How this project words a changelog entry",
	body: "One line per change.",
}

const written = async (store: TranscriptStore) => {
	await store.createBotSkill("default", A_SKILL)
	const controller = createHistoryController(store)
	await controller.open("default")
	return controller
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("history controller", () => {
	it("opens on every write the bundle already holds", async () => {
		const store = createFakeTranscriptStore()
		const controller = await written(store)

		expect(controller.getState().commits).toMatchObject([
			{ author: "user", title: `Skill "${A_SKILL.name}" saved from settings` },
		])
	})

	it("reports a history it could not read instead of an empty panel", async () => {
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "botHistory").mockRejectedValue(new Error("no bundle"))

		const controller = await written(store)

		expect(controller.getState().hasFailedToLoad).toBe(true)
	})

	it("clears the reported failure once the history reads again", async () => {
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "botHistory").mockRejectedValueOnce(new Error("no bundle"))
		const controller = await written(store)

		await controller.open("default")

		expect(controller.getState().hasFailedToLoad).toBe(false)
	})

	it("reads the files of the run it was asked for", async () => {
		const store = createFakeTranscriptStore()
		const controller = await written(store)
		const [commit] = controller.getState().commits

		controller.openFiles(commit.id, commit.id)
		await settled()

		expect(controller.getState().files).toEqual(
			await store.botHistoryDiff("default", commit.id, commit.id),
		)
		expect(controller.getState().areFilesReading).toBe(false)
	})

	it("reports the files as reading while the read is in flight", async () => {
		const store = createFakeTranscriptStore()
		const controller = await written(store)
		const [commit] = controller.getState().commits

		controller.openFiles(commit.id, commit.id)

		expect(controller.getState().areFilesReading).toBe(true)
		expect(controller.getState().haveFilesFailedToRead).toBe(false)
	})

	it("reports the files it could not read", async () => {
		const store = createFakeTranscriptStore()
		const refusing: TranscriptStore = {
			...store,
			botHistoryDiff: () => Promise.reject({ kind: "unwritableBundle" }),
		}
		const controller = await written(refusing)
		const [commit] = controller.getState().commits

		controller.openFiles(commit.id, commit.id)
		await settled()

		expect(controller.getState().haveFilesFailedToRead).toBe(true)
		expect(controller.getState().areFilesReading).toBe(false)
	})

	it("reads the files of an open run once", async () => {
		const store = createFakeTranscriptStore()
		const asked: string[] = []
		const counted: TranscriptStore = {
			...store,
			botHistoryDiff: (botId, oldestCommitId, newestCommitId) => {
				asked.push(newestCommitId)
				return store.botHistoryDiff(botId, oldestCommitId, newestCommitId)
			},
		}
		const controller = await written(counted)
		const [commit] = controller.getState().commits

		controller.openFiles(commit.id, commit.id)
		await settled()
		controller.openFiles(commit.id, commit.id)
		await settled()

		expect(asked).toEqual([commit.id])
	})

	it("shows the history the undo answered with", async () => {
		const store = createFakeTranscriptStore()
		const controller = await written(store)
		const [commit] = controller.getState().commits

		controller.revert(commit.id, commit.id)
		await settled()

		expect(controller.getState().commits).toMatchObject([
			{ title: `${UNDONE_TITLE_PREFIX}${commit.title}` },
			{ id: commit.id },
		])
	})

	it("puts the reader back on what the bundle holds when an undo is refused", async () => {
		const store = createFakeTranscriptStore()
		const refusing: TranscriptStore = {
			...store,
			revertBot: () => Promise.reject({ kind: "unwritableBundle" }),
		}
		const controller = await written(refusing)
		const [commit] = controller.getState().commits

		controller.revert(commit.id, commit.id)
		await settled()

		expect(controller.getState().commits).toMatchObject([{ id: commit.id }])
	})

	it("reads nothing while no companion is open", async () => {
		const store = createFakeTranscriptStore()
		await store.createBotSkill("default", A_SKILL)
		const asked: string[] = []
		const counted: TranscriptStore = {
			...store,
			botHistoryDiff: (botId, oldestCommitId, newestCommitId) => {
				asked.push(newestCommitId)
				return store.botHistoryDiff(botId, oldestCommitId, newestCommitId)
			},
		}
		const controller = createHistoryController(counted)

		controller.openFiles("commit-1", "commit-1")
		controller.revert("commit-1", "commit-1")
		await settled()

		expect(asked).toEqual([])
		expect(await store.botHistory("default")).toHaveLength(1)
	})
})
