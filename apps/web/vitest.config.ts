import { defineConfig } from "vitest/config";

export default defineConfig({
  root: "./apps/web",
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
