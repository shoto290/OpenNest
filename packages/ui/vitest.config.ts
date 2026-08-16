import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"
import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		projects: [
			{
				resolve: {
					alias: {
						"@workspace/ui": new URL("./src", import.meta.url).pathname,
					},
				},
				test: {
					name: "unit",
					environment: "node",
					include: ["src/**/*.test.ts"],
				},
			},
			{
				plugins: [storybookTest({ configDir: ".storybook" })],
				test: {
					name: "storybook",
					isolate: false,
					browser: {
						enabled: true,
						headless: true,
						provider: playwright({
							contextOptions: { reducedMotion: "reduce" },
						}),
						instances: [{ browser: "chromium" }],
					},
				},
			},
		],
	},
})
