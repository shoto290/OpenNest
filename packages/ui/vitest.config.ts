import { fileURLToPath } from "node:url"

import babel from "@rolldown/plugin-babel"
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"
import { reactCompilerPreset } from "@vitejs/plugin-react"
import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		projects: [
			{
				plugins: [babel({ presets: [reactCompilerPreset().preset] })],
				resolve: {
					alias: {
						"@workspace/ui": fileURLToPath(new URL("./src", import.meta.url)),
					},
				},
				test: {
					name: "unit",
					environment: "node",
					include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
				},
			},
			{
				plugins: [storybookTest({ configDir: ".storybook" })],
				test: {
					name: "storybook",
					setupFiles: [".storybook/vitest.setup.ts"],
					isolate: false,
					retry: 2,
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
