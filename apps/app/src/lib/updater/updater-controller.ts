import type {
	AvailableUpdate,
	UpdateProgress,
	UpdateRelease,
	UpdaterPort,
} from "./updater-port"

/** Long enough that a machine left running for a week asks a handful of times,
 * short enough that a reader who never quits still learns about a release the day
 * it lands. */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

/** Everything the window may show about the release it is not running yet. The
 * update itself is not here: what installs it is a handle the host owns, and a
 * handle is not something a view can render. */
export type UpdaterState = {
	available: UpdateRelease | null
	/** How far the download has come, in whole percent, and null while none is
	 * running. Whole percent because it is already finer than a bar can move: a
	 * reading per chunk would re-render the window thousands of times for one
	 * download and show the reader nothing more. */
	progress: number | null
	/** Whether the install is done and the new build is waiting for the app to be
	 * started again. Nothing else finishes an update: the download alone leaves the
	 * reader on the release they launched. */
	isRestartPending: boolean
	error: string | null
}

export type UpdaterController = {
	getState: () => UpdaterState
	subscribe: (listener: () => void) => () => void
	/** Asks once, then every six hours, and answers with the stop. */
	start: () => () => void
	check: () => Promise<void>
	/** Takes the release the last check found. Nothing to take is not a failure. */
	install: () => Promise<void>
	/** Starts the installed build. Nothing installed is not a failure. */
	restart: () => Promise<void>
}

const EMPTY: UpdaterState = {
	available: null,
	progress: null,
	isRestartPending: false,
	error: null,
}

const messageOf = (error: unknown): string =>
	error instanceof Error ? error.message : String(error)

const isSameState = (left: UpdaterState, right: UpdaterState): boolean =>
	left.error === right.error &&
	left.progress === right.progress &&
	left.isRestartPending === right.isRestartPending &&
	left.available?.version === right.available?.version &&
	left.available?.notes === right.available?.notes

/** A download the endpoint gave no length for has nothing to be a fraction of, and
 * reads as started until it lands. Every GitHub asset comes with one. */
const percentOf = ({ downloaded, total }: UpdateProgress): number =>
	total ? Math.floor((downloaded / total) * 100) : 0

export const createUpdaterController = (
	port: UpdaterPort,
): UpdaterController => {
	let state = EMPTY
	let pending: AvailableUpdate | null = null
	const listeners = new Set<() => void>()

	// A check that answers the same thing as the last one moves nothing on the
	// screen, and six hours of unchanged answers should not re-render the window.
	const publish = (next: UpdaterState) => {
		if (isSameState(state, next)) {
			return
		}
		state = next
		for (const listener of listeners) {
			listener()
		}
	}

	// An unreachable endpoint is a state, not a failure to start: the launch goes on
	// and the next check is six hours away. What an earlier check found stands — the
	// release did not stop existing because the network did.
	const check = async () => {
		try {
			const update = await port.check()
			pending = update
			publish({
				...state,
				available: update && { version: update.version, notes: update.notes },
				error: null,
			})
		} catch (error) {
			publish({ ...state, error: messageOf(error) })
		}
	}

	const install = async () => {
		const update = pending
		if (!update) {
			return
		}
		publish({ ...state, progress: 0, error: null })
		try {
			await update.install((progress) =>
				publish({ ...state, progress: percentOf(progress) }),
			)
			publish({ ...state, progress: null, isRestartPending: true })
		} catch (error) {
			publish({ ...state, progress: null, error: messageOf(error) })
		}
	}

	// Asked before an install landed there is nothing to start: the build on disk is
	// the one already running.
	const restart = async () => {
		if (!state.isRestartPending) {
			return
		}
		await port.restart()
	}

	return {
		getState: () => state,

		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},

		start: () => {
			void check()
			const timer = setInterval(() => {
				void check()
			}, CHECK_INTERVAL_MS)
			return () => clearInterval(timer)
		},

		check,
		install,
		restart,
	}
}
