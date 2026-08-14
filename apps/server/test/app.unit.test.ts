import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";

describe("buildApp", () => {
  it("registers the stable health response", async () => {
    const app = buildApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: "ok",
        service: "@personal-ai-operator/server",
      });
    } finally {
      await app.close();
    }
  });
});
