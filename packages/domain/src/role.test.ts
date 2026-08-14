import { describe, expect, it } from "vitest";

import { createDefaultRoles, getRole, roleKeys } from "./role.js";

describe("role model", () => {
  it("provides the five stable role templates", () => {
    const roles = createDefaultRoles();

    expect(roles.map((role) => role.key)).toEqual(roleKeys);
    expect(roles.every((role) => role.responsibilities.length > 0)).toBe(true);
    expect(roles.every((role) => role.allowedActions.length > 0)).toBe(true);
  });

  it("keeps roles independent from Agent and CLI session bindings", () => {
    const executor = getRole("executor");

    expect(executor).toBeDefined();
    expect(executor).not.toHaveProperty("agent");
    expect(executor).not.toHaveProperty("sessionId");
  });
});
