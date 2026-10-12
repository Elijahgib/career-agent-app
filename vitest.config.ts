import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    reporters: ["default"],
    // Real-DB integration and pdf.js extraction are slow on Windows and get much slower under
    // parallel load, where they starve each other's CPU. Give generous ceilings AND cap
    // concurrency so the heavy suites don't collide. Unit tests remain sub-second.
    testTimeout: 45_000,
    hookTimeout: 240_000,
    pool: "forks",
    poolOptions: { forks: { maxForks: 2 } },
  },
});
