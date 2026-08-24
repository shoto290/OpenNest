export type UpdateProgress = {
	downloaded: number
	total: number | null
}

export type UpdateRelease = {
	version: string
	notes: string | null
}

export type AvailableUpdate = UpdateRelease & {
	install: (onProgress: (progress: UpdateProgress) => void) => Promise<void>
}

export type UpdaterPort = {
	check: () => Promise<AvailableUpdate | null>
	restart: () => Promise<void>
}
