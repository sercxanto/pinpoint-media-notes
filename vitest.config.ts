import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The `obsidian` package ships type definitions only, no runtime code, so
// tests resolve it to a small hand-written fake instead.
export default defineConfig({
	resolve: {
		alias: {
			obsidian: fileURLToPath(new URL("./tests/__mocks__/obsidian.ts", import.meta.url)),
		},
	},
	test: {
		// Obsidian runs in a browser context; the book importer uses its
		// DOMParser for MARC-XML and blurb HTML.
		environment: "jsdom",
		include: ["tests/**/*.test.ts"],
		// Live-API checks only run via `npm run test:contract`.
		exclude: ["tests/contract/**", "node_modules/**"],
		// Only via `npm run test:coverage`. CI turns the json-summary into
		// the README badge.
		coverage: {
			provider: "v8",
			include: ["src/**"],
			reporter: ["text", "html", "json-summary"],
		},
	},
});
