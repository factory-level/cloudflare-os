// Vite+ per-package settings. Tasks and scripts cannot share a name, so package.json declares
// neither `build` nor `test`.
import { withVitestTask } from "@gadgets/scripts/vitest-task";

export default withVitestTask({
  run: {
    tasks: {
      /** One type-check program per set of globals, as in `@gadgets/bundled-blueprints`. */
      build: {
        command: [
          "tsc --project tsconfig.client.json",
          "tsc --project tsconfig.server.json",
          "tsc --project tsconfig.tests.json",
        ],
      },
    },
  },
}, ["vitest run"]);
