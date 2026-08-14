import { defineConfig } from "vitest/config";

export default defineConfig({
  root: "./packages/domain",
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
