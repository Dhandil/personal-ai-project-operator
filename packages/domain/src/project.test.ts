import { describe, expect, it } from "vitest";

import { createProject } from "./project.js";

describe("createProject", () => {
  it("creates a project with the default workflow", () => {
    const result = createProject({
      name: "  我的项目  ",
      idea: "  验证一个想法  ",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("我的项目");
      expect(result.value.idea).toBe("验证一个想法");
      expect(result.value.workflow.currentStage).toBe("idea-clarification");
    }
  });

  it("rejects a missing project name or idea", () => {
    expect(createProject({ name: " ", idea: "有效想法" }).ok).toBe(false);
    expect(createProject({ name: "有效名称", idea: " " }).ok).toBe(false);
  });
});
