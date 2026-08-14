import {
  createDefaultWorkflow,
  type DomainError,
  type DomainResult,
  type Workflow,
} from "./workflow.js";

export type ProjectInput = Readonly<{
  readonly name: string;
  readonly idea: string;
}>;

export type Project = Readonly<{
  readonly name: string;
  readonly idea: string;
  readonly workflow: Workflow;
}>;

function invalidProjectField(field: "name" | "idea"): DomainResult<Project> {
  const error: DomainError = {
    code: "reason_required",
    message: `项目${field === "name" ? "名称" : "想法"}不能为空`,
  };

  return { ok: false, error };
}

export function createProject(input: ProjectInput): DomainResult<Project> {
  const name = input.name.trim();
  if (name.length === 0) {
    return invalidProjectField("name");
  }

  const idea = input.idea.trim();
  if (idea.length === 0) {
    return invalidProjectField("idea");
  }

  return {
    ok: true,
    value: {
      name,
      idea,
      workflow: createDefaultWorkflow(),
    },
  };
}
