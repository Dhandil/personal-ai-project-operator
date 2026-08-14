import { describe, expect, it } from "vitest";

import { resolveRoute } from "./app";

describe("resolveRoute", () => {
  it("keeps the home route as the default", () => {
    expect(resolveRoute("/")).toBe("home");
    expect(resolveRoute("/unknown")).toBe("home");
  });

  it("recognizes the health route", () => {
    expect(resolveRoute("/health")).toBe("health");
  });

  it("recognizes the project creation route", () => {
    expect(resolveRoute("/projects/new")).toBe("create");
  });

  it("recognizes the workflow route", () => {
    expect(resolveRoute("/projects/workflow")).toBe("workflow");
  });

  it("recognizes the goals route", () => {
    expect(resolveRoute("/projects/goals")).toBe("goals");
  });

  it("recognizes the roles route", () => {
    expect(resolveRoute("/projects/roles")).toBe("roles");
  });

  it("recognizes the issues route", () => {
    expect(resolveRoute("/projects/issues")).toBe("issues");
  });
});
