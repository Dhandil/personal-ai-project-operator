import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { requestProjectList } from "./project-overview";
import {
  createTask,
  requestTasks,
  updateTask,
  type Task,
  type TaskApiError,
  type TaskSnapshot,
  type TasksPayload,
} from "./task";

type FormState = Readonly<{
  title: string;
  purpose: string;
  scope: string;
  outputs: string;
  acceptanceCriteria: string;
  requiredFiles: string;
  onDemandFiles: string;
  allowedPaths: string;
  forbiddenPaths: string;
  verificationCommands: string;
  evidence: string;
  dependencies: string;
  role: string;
  priority: string;
}>;
const initialForm: FormState = {
  title: "",
  purpose: "",
  scope: "",
  outputs: "",
  acceptanceCriteria: "",
  requiredFiles: "",
  onDemandFiles: "",
  allowedPaths: "",
  forbiddenPaths: ".git",
  verificationCommands: "npm run verify",
  evidence: "integration test",
  dependencies: "",
  role: "executor",
  priority: "high",
};
type State = Readonly<
  | { status: "loading" }
  | { status: "error"; error: TaskApiError }
  | { status: "ready"; projectKey: string; value: TasksPayload }
>;
function lines(value: string): readonly string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}
function errorText(error: TaskApiError): string {
  return error.details.length === 0
    ? error.message
    : `${error.message} (${error.details.join(", ")})`;
}
function defaultForm(task?: Task): FormState {
  return task === undefined
    ? initialForm
    : {
        title: task.title,
        purpose: task.purpose,
        scope: task.scope.join("\n"),
        outputs: task.outputs.join("\n"),
        acceptanceCriteria: task.acceptanceCriteria.join("\n"),
        requiredFiles: task.requiredFiles.join("\n"),
        onDemandFiles: task.onDemandFiles.join("\n"),
        allowedPaths: task.allowedPaths.join("\n"),
        forbiddenPaths: task.forbiddenPaths.join("\n"),
        verificationCommands: String(
          task.run.verificationCommands ?? "npm run verify",
        ),
        evidence: task.evidence.join("\n"),
        dependencies: task.dependencies.join("\n"),
        role: task.currentRole,
        priority: String(task.customFields.priority ?? "high"),
      };
}
function payload(
  form: FormState,
  projectKey: string,
  goalId: string,
): Record<string, unknown> {
  return {
    projectKey,
    goalId,
    title: form.title,
    currentRole: form.role,
    dependencies: lines(form.dependencies),
    purpose: form.purpose,
    scope: lines(form.scope),
    outputs: lines(form.outputs),
    acceptanceCriteria: lines(form.acceptanceCriteria),
    requiredFiles: lines(form.requiredFiles),
    onDemandFiles: lines(form.onDemandFiles),
    associatedDecisions: [],
    allowedPaths: lines(form.allowedPaths),
    forbiddenPaths: lines(form.forbiddenPaths),
    run: {
      mode: "local",
      gitBranch: "goal/GOAL-001",
      worktree: ".",
      verificationCommands: lines(form.verificationCommands),
    },
    evidence: lines(form.evidence),
    customFieldDefinitions: [
      {
        key: "priority",
        label: "Priority",
        type: "single_select",
        required: true,
        options: ["high", "low"],
      },
    ],
    customFields: { priority: form.priority },
    completion: {
      output: "Pending task completion",
      tests: ["Pending verification"],
      outstandingIssues: [],
      handoff: "Pending reviewer handoff",
    },
  };
}
function TaskCard({
  snapshot,
  onEdit,
}: Readonly<{
  readonly snapshot: TaskSnapshot;
  readonly onEdit: (snapshot: TaskSnapshot) => void;
}>): ReactElement {
  return (
    <li className="task-card">
      <div className="panel-heading">
        <div>
          <strong>
            {snapshot.task.id}: {snapshot.task.title}
          </strong>
          <p>{snapshot.task.purpose}</p>
        </div>
        <span className={`stage-status ${snapshot.task.status}`}>
          {snapshot.task.status}
        </span>
      </div>
      <p>
        Role: {snapshot.task.currentRole} · Dependencies:{" "}
        {snapshot.task.dependencies.join(", ") || "none"}
      </p>
      <p>
        Custom fields:{" "}
        {Object.entries(snapshot.task.customFields)
          .map(([key, value]) => `${key}=${String(value)}`)
          .join(", ") || "none"}
      </p>
      <button
        className="button secondary"
        type="button"
        onClick={() => onEdit(snapshot)}
      >
        Edit task
      </button>
    </li>
  );
}
export function TaskPage(): ReactElement {
  const [state, setState] = useState<State>({ status: "loading" });
  const [form, setForm] = useState<FormState>(initialForm);
  const [editing, setEditing] = useState<TaskSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const load = (): void => {
    setState({ status: "loading" });
    void requestProjectList().then((projects) => {
      if (!projects.ok)
        return setState({ status: "error", error: projects.error });
      const key = projects.value.currentProjectKey;
      if (key === null)
        return setState({
          status: "error",
          error: {
            code: "selection_required",
            message: "Select a current project first.",
            details: [],
          },
        });
      void requestTasks(key).then((tasks) =>
        setState(
          tasks.ok
            ? { status: "ready", projectKey: key, value: tasks.value }
            : { status: "error", error: tasks.error },
        ),
      );
    });
  };
  useEffect(() => load(), []);
  const save = (): void => {
    if (state.status !== "ready") return;
    setBusy(true);
    setNotice(null);
    const input = payload(form, state.projectKey, "GOAL-001");
    const request =
      editing === null
        ? createTask(input)
        : updateTask({
            projectKey: state.projectKey,
            taskId: editing.task.id,
            revision: editing.revision,
            hash: editing.hash,
            patch: { ...input, goalId: undefined, projectKey: undefined },
          });
    void request.then((result) => {
      setBusy(false);
      if (!result.ok) return setNotice(errorText(result.error));
      setNotice(
        editing === null
          ? "Task created as a draft."
          : "Task updated with revision/hash protection.",
      );
      setEditing(null);
      setForm(initialForm);
      load();
    });
  };
  return (
    <section
      className="overview-shell task-page"
      aria-labelledby="tasks-page-title"
    >
      <a className="back-link" href="/">
        ← Back to project overview
      </a>
      <div className="overview-intro">
        <p className="eyebrow">TASK CARDS</p>
        <h1 id="tasks-page-title">Tasks and dependencies</h1>
        <p className="description">
          Create complete task facts, assign a stable role, validate
          dependencies, and keep lightweight custom fields editable.
        </p>
      </div>
      {state.status === "loading" && (
        <div className="overview-loading" role="status">
          Loading tasks…
        </div>
      )}
      {state.status === "error" && (
        <div className="overview-alert error" role="alert">
          {errorText(state.error)}
        </div>
      )}
      {state.status === "ready" && (
        <>
          <div className="overview-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">RECORDED FACTS</p>
                <h2>Task cards</h2>
              </div>
              <button className="button secondary" type="button" onClick={load}>
                Refresh
              </button>
            </div>
            {state.value.tasks.length === 0 ? (
              <p className="muted-note">No task cards yet.</p>
            ) : (
              <ul className="task-list">
                {state.value.tasks.map((snapshot) => (
                  <TaskCard
                    key={`${snapshot.task.id}-${snapshot.revision}`}
                    snapshot={snapshot}
                    onEdit={(item) => {
                      setEditing(item);
                      setForm(defaultForm(item.task));
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
          <div className="overview-panel task-editor">
            <p className="eyebrow">
              {editing === null ? "NEW TASK DRAFT" : "EDIT TASK FACT"}
            </p>
            <h2>
              {editing === null ? "Create a task" : `Edit ${editing.task.id}`}
            </h2>
            {(
              [
                "title",
                "purpose",
                "scope",
                "outputs",
                "acceptanceCriteria",
                "requiredFiles",
                "onDemandFiles",
                "allowedPaths",
                "forbiddenPaths",
                "verificationCommands",
                "evidence",
                "dependencies",
              ] as const
            ).map((key) => (
              <label key={key}>
                {key}
                <textarea
                  aria-label={key}
                  value={form[key]}
                  onChange={(event) =>
                    setForm({ ...form, [key]: event.target.value })
                  }
                />
              </label>
            ))}
            <label>
              Role
              <select
                aria-label="Role"
                value={form.role}
                onChange={(event) =>
                  setForm({ ...form, role: event.target.value })
                }
              >
                <option value="executor">executor</option>
                <option value="architect">architect</option>
                <option value="reviewer">reviewer</option>
                <option value="product-requirements">
                  product-requirements
                </option>
                <option value="project-lead">project-lead</option>
              </select>
            </label>
            <label>
              Priority
              <select
                aria-label="Priority"
                value={form.priority}
                onChange={(event) =>
                  setForm({ ...form, priority: event.target.value })
                }
              >
                <option value="high">high</option>
                <option value="low">low</option>
              </select>
            </label>
            <button
              className="button primary"
              type="button"
              disabled={busy}
              onClick={save}
            >
              {editing === null ? "Create task draft" : "Save task edit"}
            </button>
          </div>
          {notice !== null && (
            <div className="overview-alert" role="status">
              {notice}
            </div>
          )}
        </>
      )}
    </section>
  );
}
