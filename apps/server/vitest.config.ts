import { defineConfig } from "vitest/config";

export default defineConfig({
  root: "./apps/server",
  test: {
    environment: "node",
    include: ["test/**/*.unit.test.ts"],
  },
});
