import { describe, expect, it } from "vitest";

import {
  requestProjectInitialization,
  requestProjectDirectorySelection,
  requestProjectPreview,
  validateProjectCreationForm,
  type JsonFetcher,
  type ProjectPreview,
} from "./project-initialization";

const preview: ProjectPreview = {
  projectRoot: "D:\\Projects\\demo",
  projectName: "demo",
  idea: "A governed project",
  plannedFiles: [
    {
      relativePath: ".personal-workspace/project.md",
      action: "create",
      reason: "governance_template",
    },
  ],
  conflicts: [],
  defaultWorkflow: [{ key: "idea-clarification" }],
  defaultRoles: [{ key: "project-lead" }],
  defaultSettings: [{ key: "git.default_branch", value: "main" }],
  git: {
    detected: { state: "no_repository" },
    planned: {
      action: "initialize_local_repository",
      commands: ["git init --initial-branch=main"],
      approvalRequired: true,
    },
  },
};

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("project creation form", () => {
  it("requires a directory and an idea", () => {
    expect(
      validateProjectCreationForm({
        projectRoot: " ",
        projectName: "",
        idea: "",
      }),
    ).toEqual({
      projectRoot: "请选择或输入项目目录。",
      idea: "请输入项目想法。",
    });
    expect(
      validateProjectCreationForm({
        projectRoot: "D:\\Projects\\demo",
        projectName: "",
        idea: "An idea",
      }),
    ).toEqual({});
  });
});

describe("project creation API client", () => {
  it("requests a local directory without changing project state", async () => {
    let requestBody = "";
    const fetcher: JsonFetcher = async (_input, init) => {
      requestBody = String(init?.body);
      return response({
        ok: true,
        value: { projectRoot: "D:\\Projects\\selected" },
      });
    };

    const result = await requestProjectDirectorySelection(fetcher);

    expect(result).toEqual({
      ok: true,
      value: { projectRoot: "D:\\Projects\\selected" },
    });
    expect(JSON.parse(requestBody)).toEqual({});
  });

  it("posts the form and accepts a preview response", async () => {
    let requestBody = "";
    const fetcher: JsonFetcher = async (_input, init) => {
      requestBody = String(init?.body);
      return response({ ok: true, value: preview });
    };

    const result = await requestProjectPreview(
      {
        projectRoot: " D:\\Projects\\demo ",
        projectName: "",
        idea: " An idea ",
      },
      fetcher,
    );

    expect(result).toEqual({ ok: true, value: preview });
    expect(JSON.parse(requestBody)).toEqual({
      projectRoot: "D:\\Projects\\demo",
      idea: "An idea",
    });
  });

  it("returns recovery information from a failed initialization", async () => {
    const fetcher: JsonFetcher = async () =>
      response(
        {
          ok: false,
          error: {
            code: "git_failed",
            message: "Git baseline failed.",
            details: ["commit failed"],
            recovery: {
              nextStep: "inspect_and_retry",
              createdFiles: ["project.md"],
            },
          },
        },
        400,
      );

    const result = await requestProjectInitialization(
      preview,
      "APPROVAL-001",
      fetcher,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("git_failed");
      expect(result.error.recovery).toEqual({
        nextStep: "inspect_and_retry",
        createdFiles: ["project.md"],
      });
    }
  });

  it("returns a structured picker error when the local service cannot be used", async () => {
    const result = await requestProjectDirectorySelection(async () =>
      response(
        {
          ok: false,
          error: {
            code: "unsupported_platform",
            message: "本机目录选择器目前只支持 Windows。",
            details: [],
          },
        },
        400,
      ),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "unsupported_platform",
        message: "本机目录选择器目前只支持 Windows。",
        details: [],
      },
    });
  });
});
