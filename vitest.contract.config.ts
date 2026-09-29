import { defineConfig } from "vitest/config";
import base from "./vitest.config";

// Opt-in checks against the live DNB and TMDB APIs. They assert the shape of
// responses (fields present, types as expected), never their text content.
// Not `mergeConfig`: it concatenates arrays, so the base config's exclusion
// of `tests/contract/**` would survive and no contract test would run.
export default defineConfig({
	...base,
	test: {
		...base.test,
		include: ["tests/contract/**/*.contract.test.ts"],
		exclude: ["node_modules/**"],
		testTimeout: 30_000,
	},
});
