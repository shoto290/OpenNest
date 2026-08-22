import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

// biome-ignore lint/style/noDefaultExport: Vitest requires a default export
export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		environment: "node",
	},
	resolve: {
		alias: {
			"@workspace/ui": fileURLToPath(
				new URL("../../packages/ui/src", import.meta.url),
			),
		},
	},
})
