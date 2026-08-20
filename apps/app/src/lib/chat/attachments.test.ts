import { describe, expect, it, vi } from "vitest"

import { i18n } from "@workspace/ui/lib/i18n"

import {
	describeAttachmentError,
	promptWithAttachments,
	releasePreviews,
	stagedFrom,
	submittedFrom,
	toAttachmentStoreError,
	withoutStaged,
} from "./attachments"

const t = i18n.getFixedT(null, "chat")

const fileNamed = (name: string, type: string, bytes = [1, 2, 3]) =>
	new File([new Uint8Array(bytes)], name, { type })

describe("staging", () => {
	it("stages every file it is handed, in the order they arrived", () => {
		const staged = stagedFrom([
			fileNamed("notes.md", "text/markdown"),
			fileNamed("build.log", "text/plain", [1]),
		])

		expect(staged.map((item) => item.name)).toEqual(["notes.md", "build.log"])
		expect(staged.map((item) => item.size)).toEqual([3, 1])
		expect(new Set(staged.map((item) => item.id)).size).toBe(2)
		releasePreviews(staged)
	})

	it("gives an image a preview and everything else none", () => {
		const [image, archive] = stagedFrom([
			fileNamed("shot.png", "image/png"),
			fileNamed("logs.zip", "application/zip"),
		])

		expect(image?.previewUrl).toMatch(/^blob:/)
		expect(archive?.previewUrl).toBeUndefined()
		releasePreviews([image, archive].filter((item) => item !== undefined))
	})
})

describe("removal", () => {
	it("drops the named file and keeps the rest", () => {
		const staged = stagedFrom([
			fileNamed("notes.md", "text/markdown"),
			fileNamed("shot.png", "image/png"),
		])

		const kept = withoutStaged(staged, staged[1]?.id ?? "")

		expect(kept.map((item) => item.name)).toEqual(["notes.md"])
		releasePreviews(kept)
	})

	it("releases the preview of the file it dropped", () => {
		const released = vi.spyOn(URL, "revokeObjectURL")
		const staged = stagedFrom([fileNamed("shot.png", "image/png")])

		withoutStaged(staged, staged[0]?.id ?? "")

		expect(released).toHaveBeenCalledWith(staged[0]?.previewUrl)
		released.mockRestore()
	})

	it("keeps the list whole when the id is not on it", () => {
		const staged = stagedFrom([fileNamed("notes.md", "text/markdown")])

		expect(withoutStaged(staged, "gone")).toHaveLength(1)
	})
})

describe("the submitted prompt", () => {
	it("hands over the bytes of every staged file under its own name", async () => {
		const staged = stagedFrom([fileNamed("notes.md", "text/markdown", [7, 8])])

		expect(await submittedFrom(staged)).toEqual([
			{ name: "notes.md", bytes: new Uint8Array([7, 8]) },
		])
	})

	it("names one stored path per line under what was typed", () => {
		expect(
			promptWithAttachments("look at these", [
				"/data/attachments/c1/a.png",
				"/data/attachments/c1/b.pdf",
			]),
		).toBe(
			"look at these\n/data/attachments/c1/a.png\n/data/attachments/c1/b.pdf",
		)
	})

	it("is the paths alone when nothing was typed", () => {
		expect(promptWithAttachments("   ", ["/data/attachments/c1/a.png"])).toBe(
			"/data/attachments/c1/a.png",
		)
	})

	it("is the text alone when nothing was attached", () => {
		expect(promptWithAttachments("hello", [])).toBe("hello")
	})
})

describe("a refused store", () => {
	it("names the count limit the call was refused on", () => {
		expect(
			describeAttachmentError(t, { kind: "tooMany", count: 21, limit: 20 }),
		).toBe("A prompt carries 20 files at most, and 21 are staged.")
	})

	it("names the total size limit the call was refused on", () => {
		expect(
			describeAttachmentError(t, {
				kind: "tooLargeTogether",
				bytes: 210 * 1024 * 1024,
				limit: 100 * 1024 * 1024,
			}),
		).toBe(
			"The staged files come to 210 MB, over the 100 MB one prompt may carry.",
		)
	})

	it("names the file that was too big on its own", () => {
		expect(
			describeAttachmentError(t, {
				kind: "tooLarge",
				name: "huge.bin",
				bytes: 21 * 1024 * 1024,
				limit: 20 * 1024 * 1024,
			}),
		).toBe("huge.bin is over the 20 MB a single file may weigh.")
	})

	it("reads a refusal the host sent as it was sent", () => {
		expect(
			toAttachmentStoreError({ kind: "tooMany", count: 21, limit: 20 }),
		).toEqual({ kind: "tooMany", count: 21, limit: 20 })
	})

	it("reads anything else as a write that could not land", () => {
		expect(toAttachmentStoreError("the bridge is gone")).toEqual({
			kind: "unwritable",
			detail: "the bridge is gone",
		})
	})
})
