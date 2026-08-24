import { relaunch } from "@tauri-apps/plugin-process"
import { check, type DownloadEvent } from "@tauri-apps/plugin-updater"

import type { UpdateProgress, UpdaterPort } from "./updater-port"

const accumulate = (onProgress: (progress: UpdateProgress) => void) => {
	let downloaded = 0
	let total: number | null = null

	return (event: DownloadEvent) => {
		if (event.event === "Started") {
			total = event.data.contentLength ?? null
		}
		if (event.event === "Progress") {
			downloaded += event.data.chunkLength
		}
		onProgress({ downloaded, total })
	}
}

export const updaterTransport: UpdaterPort = {
	check: async () => {
		const update = await check()
		if (!update) {
			return null
		}
		return {
			version: update.version,
			notes: update.body ?? null,
			install: (onProgress) =>
				update.downloadAndInstall(accumulate(onProgress)),
		}
	},

	restart: () => relaunch(),
}
