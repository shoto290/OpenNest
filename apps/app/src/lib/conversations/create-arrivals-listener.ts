import type { CompanionArrivalListener } from "./conversation-controller"
import { arrivalsTransport } from "./store-transport"

import { isDesktopHost } from "../host"

export const createArrivalsListener = (): CompanionArrivalListener =>
	isDesktopHost()
		? arrivalsTransport.onCompanionArrived
		: async () => () => undefined
