// Test worker for the workerd suite. Re-exports the production entrypoints so miniflare can bind the
// Durable Objects.

export { default } from "../src/lab.js";
export * from "../src/lab.js";
