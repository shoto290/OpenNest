import { routinesTransport } from "./routines-transport"
import type { ReportedRunsReader, RunPort } from "./run-port"

import { isDesktopHost } from "../host"

export const createRunPort = (): RunPort =>
	isDesktopHost()
		? routinesTransport
		: {
				onRunRequested: async () => () => undefined,
				renewLease: async () => undefined,
				closeRun: async () => undefined,
			}

export const createReportedRunsReader = (): ReportedRunsReader =>
	isDesktopHost() ? routinesTransport.reportedRuns : async () => []
