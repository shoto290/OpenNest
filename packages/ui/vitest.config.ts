import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"
import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		projects: [
			{
				plugins: [storybookTest({ configDir: ".storybook" })],
				test: {
					name: "storybook",
					isolate: false,
					browser: {
						enabled: true,
						headless: true,
						provider: playwright({}),
						instances: [{ browser: "chromium" }],
					},
				},
			},
		],
	},
})
