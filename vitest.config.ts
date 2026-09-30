import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Vitest config for the Velora HVAC safety-constraint suite.
// - node environment (we exercise domain services + SQLite, no DOM)
// - single setup file resets + re-seeds the DFW org before all tests
// - path alias `@/*` mirrors tsconfig.json so imports from src resolve
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    // Every test file uses the same isolated SQLite database and setup seed.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
