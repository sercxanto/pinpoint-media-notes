import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default defineConfig([
	globalIgnores(["node_modules/", "main.js", "docs/specs/", "coverage/"]),
	...obsidianmd.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ["eslint.config.mjs", "esbuild.config.mjs"],
				},
			},
		},
	},
	{
		// Build scripts and tests run in Node, not inside Obsidian.
		files: ["*.mjs", "*.config.ts", "tests/**/*.ts"],
		languageOptions: { globals: globals.node },
		rules: {
			"obsidianmd/no-nodejs-modules": "off",
		},
	},
	prettier,
]);
