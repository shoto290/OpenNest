/** How far a download has come and how far it has to go. `total` is null until the
 * release answers with a length, which it does before the first chunk lands. */
export type UpdateProgress = {
	downloaded: number
	total: number | null
}

/** What a newer release says about itself. This is what a reader is shown before
 * they decide to take it. */
export type UpdateRelease = {
	version: string
	notes: string | null
}

/** A release the host has found and can fetch. `install` downloads it and hands it
 * to the platform installer, reporting every chunk on the way. */
export type AvailableUpdate = UpdateRelease & {
	install: (onProgress: (progress: UpdateProgress) => void) => Promise<void>
}

/** Asking the release endpoint whether this build is the current one. `null` is the
 * answer for a build that is. */
export type UpdaterPort = {
	check: () => Promise<AvailableUpdate | null>
}
