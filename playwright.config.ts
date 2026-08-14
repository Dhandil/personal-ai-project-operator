import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "off",
  },
  webServer: [
    {
      command:
        "npm exec --workspace apps/server -- tsc -p tsconfig.json && node apps/server/dist/main.js",
      url: "http://127.0.0.1:4300/health",
      reuseExistingServer: true,
    },
    {
      command: "npm run dev --workspace apps/web",
      url: "http://127.0.0.1:5173/",
      reuseExistingServer: true,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
