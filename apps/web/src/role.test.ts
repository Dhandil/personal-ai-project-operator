import { describe, expect, it } from "vitest";

import { parseRolesPayload } from "./role";

const role = {
  key: "reviewer",
  title: "Reviewer",
  responsibilities: ["inspect evidence"],
  mustRead: ["task card"],
  onDemandRead: ["decision records"],
  allowedActions: ["read repository", "write review report"],
  forbiddenActions: ["modify implementation"],
  handoff: ["findings"],
};

describe("role API contract", () => {
  it("keeps reviewer read-only metadata and context status", () => {
    const value = parseRolesPayload({
      projectKey: "a".repeat(64),
      projectRoot: "D:\\project",
      roles: [
        {
          role,
          source: "default",
          relativePath: ".personal-workspace/roles/reviewer.md",
          fileState: "missing",
          context: {
            mustRead: [
              {
                name: "task card",
                required: true,
                paths: [".personal-workspace/tasks"],
                state: "available",
              },
            ],
            onDemandRead: [],
          },
          canModifyProjectFiles: false,
          revision: null,
          hash: null,
        },
      ],
    });
    expect(value?.roles[0]?.canModifyProjectFiles).toBe(false);
    expect(value?.roles[0]?.context.mustRead[0]?.state).toBe("available");
  });
});
