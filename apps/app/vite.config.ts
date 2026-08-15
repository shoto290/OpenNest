import { resolve } from "node:path"

import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// biome-ignore lint/style/noDefaultExport: Vite requires a default export
export default defineConfig({
	clearScreen: false,
	plugins: [react(), tailwindcss()],
	server: {
		port: 1420,
		strictPort: true,
		host: "127.0.0.1",
		watch: { ignored: ["**/src-tauri/**"] },
	},
	build: {
		target: "safari13",
		minify: !process.env.TAURI_ENV_DEBUG,
		sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
	},
	resolve: {
		alias: {
			"@": resolve(__dirname, "./src"),
		},
	},
})
