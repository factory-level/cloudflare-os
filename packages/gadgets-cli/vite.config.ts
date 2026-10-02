// Vite+ per-package settings. Tasks and scripts cannot share a name, so package.json declares
// neither `build` nor `test`.
import { withVitestTask } from "@gadgets/scripts/vitest-task";

export default withVitestTask({
  run: {
    tasks: {
      build: { command: "tsc --noEmit" },
    },
  },
}, ["vitest run"]);
