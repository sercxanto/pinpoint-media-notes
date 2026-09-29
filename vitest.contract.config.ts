import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

// Opt-in checks against the live DNB and TMDB APIs. They assert the shape of
// responses (fields present, types as expected), never their text content.
export default mergeConfig(
	base,
	defineConfig({
		test: {
			include: ["tests/contract/**/*.contract.test.ts"],
			exclude: ["node_modules/**"],
			testTimeout: 30_000,
		},
	}),
);
