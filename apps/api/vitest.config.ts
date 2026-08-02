import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    hookTimeout: 600_000,
    testTimeout: 30_000,
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
