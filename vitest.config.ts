import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/contracts",
      "packages/domain",
      "apps/server",
      "apps/web",
    ],
  },
});
