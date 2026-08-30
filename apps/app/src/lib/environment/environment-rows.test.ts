import { describe, expect, it } from "vitest"

import { toEnvironmentRows } from "./environment-rows"

import type { EnvScope } from "../conversations/store-contract"

const SPACE: EnvScope = { kind: "space", id: "s-1" }

const BOT: EnvScope = { kind: "bot", id: "b-1", spaceId: "s-1" }

describe("toEnvironmentRows", () => {
	it("reads a name the space defines as defined in the space", () => {
		expect(
			toEnvironmentRows([
				{ name: "ATLAS_TOKEN", definedIn: SPACE, servedFrom: SPACE },
			]),
		).toEqual([
			{ name: "ATLAS_TOKEN", definedIn: "space", servedFrom: "space" },
		])
	})

	it("folds a name two scopes define into the narrower one overriding the wider", () => {
		expect(
			toEnvironmentRows([
				{ name: "ATLAS_REGION", definedIn: BOT, servedFrom: BOT },
				{ name: "ATLAS_REGION", definedIn: SPACE, servedFrom: BOT },
			]),
		).toEqual([
			{
				name: "ATLAS_REGION",
				definedIn: "bot",
				servedFrom: "bot",
				overrides: "space",
			},
		])
	})

	it("keeps the order the scope listed its names in", () => {
		expect(
			toEnvironmentRows([
				{ name: "ATLAS_TOKEN", definedIn: SPACE, servedFrom: SPACE },
				{ name: "BOT_SEED", definedIn: BOT, servedFrom: BOT },
			]).map((row) => row.name),
		).toEqual(["ATLAS_TOKEN", "BOT_SEED"])
	})
})
