import { defineConfig } from "vitest/config";

/**
 * Skill tests exercise each skill's pure `lib/` modules against fixed fixtures, so they run in node.
 * `__tests__/` holds checks across skills, such as the shared pentacles theme.
 */
export default defineConfig({
  test: {
    include: ["skills/*/__tests__/**/*.test.ts", "__tests__/*.test.ts"],
    environment: "node",
  },
});
