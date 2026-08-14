import { defineConfig } from "vitest/config";

export default defineConfig({
  root: "./packages/contracts",
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
