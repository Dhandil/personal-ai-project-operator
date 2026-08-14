import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/contracts", "apps/server", "apps/web"],
  },
});
