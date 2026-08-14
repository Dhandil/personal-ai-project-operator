import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { requestProjectList } from "./project-overview";
import {
  requestGoalDecision,
  requestGoalProposal,
  requestGoals,
  type Goal,
  type GoalApiError,
  type GoalSnapshot,
} from "./goal";

type FormState = Readonly<{
  title: string;
  boundary: string;
  risks: string;
  acceptanceCriteria: string;
  taskDrafts: string;
}>;
const emptyForm: FormState = {
  title: "",
  boundary: "",
  risks: "",
  acceptanceCriteria: "",
  taskDrafts: "",
};
type PageState =
  | Readonly<{ status: "loading" }>
  | Readonly<{
      status: "ready";
      projectKey: string;
      goals: readonly GoalSnapshot[];
    }>
  | Readonly<{ status: "error"; error: GoalApiError }>;
function lines(value: string): readonly string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
function errorText(error: GoalApiError): string {
  return error.details.length === 0
    ? error.message
    : `${error.message} (${error.details.join(", ")})`;
}
function formFrom(snapshot: GoalSnapshot): FormState {
  return {
    title: snapshot.goal.title,
    boundary: snapshot.goal.boundary.join("\n"),
    risks: snapshot.goal.risks.join("\n"),
    acceptanceCriteria: snapshot.goal.acceptanceCriteria.join("\n"),
    taskDrafts: snapshot.taskDrafts.map((item) => item.title).join("\n"),
  };
}

function GoalForm({
  form,
  onChange,
  proposal,
  onProposal,
  onDecision,
  busy,
}: Readonly<{
  readonly form: FormState;
  readonly onChange: (form: FormState) => void;
  readonly proposal: GoalSnapshot | null;
  readonly onProposal: () => void;
  readonly onDecision: (approved: boolean) => void;
  readonly busy: boolean;
}>): ReactElement {
  const field = (key: keyof FormState, label: string): ReactElement => (
    <label>
      {label}
      <textarea
        aria-label={label}
        value={form[key]}
        onChange={(event) => onChange({ ...form, [key]: event.target.value })}
      />
    </label>
  );
  return (
    <div
      className="overview-panel goal-editor"
      role="region"
      aria-label="Goal proposal editor"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">
            {proposal === null ? "AGENT PROPOSAL" : "USER REVIEW"}
          </p>
          <h2>
            {proposal === null
              ? "Propose a short-term goal"
              : `Review ${proposal.goal.id} before approval`}
          </h2>
        </div>
        <span className="read-only-badge">
          {proposal === null ? "No write" : "Editable"}
        </span>
      </div>
      {field("title", "Goal title")}
      {field("boundary", "Boundary")}
      {field("risks", "Risks")}
      {field("acceptanceCriteria", "Acceptance criteria")}
      {field("taskDrafts", "Task drafts")}
      <p className="muted-note">
        Each line is one item. Approval fixes the edited boundary and acceptance
        criteria; it does not start the goal.
      </p>
      <div className="wizard-actions">
        {proposal === null ? (
          <button
            className="button primary"
            type="button"
            onClick={onProposal}
            disabled={busy}
          >
            Generate proposal
          </button>
        ) : (
          <>
            <button
              className="button secondary"
              type="button"
              onClick={() => onDecision(false)}
              disabled={busy}
            >
              Reject
            </button>
            <button
              className="button primary"
              type="button"
              onClick={() => onDecision(true)}
              disabled={busy}
            >
              Approve goal
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function GoalPage(): ReactElement {
  const [state, setState] = useState<PageState>({ status: "loading" });
  const [form, setForm] = useState<FormState>(emptyForm);
  const [proposal, setProposal] = useState<GoalSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const load = (): void => {
    setState({ status: "loading" });
    void requestProjectList().then((projects) => {
      if (!projects.ok) {
        setState({ status: "error", error: projects.error });
        return;
      }
      if (projects.value.currentProjectKey === null) {
        setState({
          status: "error",
          error: {
            code: "selection_required",
            message: "Select a current project first.",
            details: [],
          },
        });
        return;
      }
      void requestGoals(projects.value.currentProjectKey).then((goals) =>
        setState(
          goals.ok
            ? {
                status: "ready",
                projectKey: projects.value.currentProjectKey ?? "",
                goals: goals.value.goals,
              }
            : { status: "error", error: goals.error },
        ),
      );
    });
  };
  useEffect(() => {
    load();
  }, []);
  const createProposal = (): void => {
    if (state.status !== "ready") return;
    setBusy(true);
    setNotice(null);
    void requestGoalProposal({
      projectKey: state.projectKey,
      title: form.title,
      boundary: lines(form.boundary),
      risks: lines(form.risks),
      acceptanceCriteria: lines(form.acceptanceCriteria),
      taskDrafts: lines(form.taskDrafts).map((title) => ({ title })),
    }).then((result) => {
      setBusy(false);
      if (result.ok) {
        setProposal(result.value.proposal);
        setForm(formFrom(result.value.proposal));
      } else setNotice(errorText(result.error));
    });
  };
  const decide = (approved: boolean): void => {
    if (state.status !== "ready" || proposal === null) return;
    setBusy(true);
    setNotice(null);
    const editedGoal: Goal = {
      ...proposal.goal,
      title: form.title.trim(),
      boundary: lines(form.boundary),
      risks: lines(form.risks),
      acceptanceCriteria: lines(form.acceptanceCriteria),
    };
    void requestGoalDecision({
      projectKey: state.projectKey,
      goal: editedGoal,
      taskDrafts: lines(form.taskDrafts).map((title) => ({ title })),
      approved,
    }).then((result) => {
      setBusy(false);
      if (result.ok) {
        setProposal(null);
        setState({
          status: "ready",
          projectKey: state.projectKey,
          goals: [...state.goals, result.value.goal],
        });
        setNotice(
          approved
            ? "Goal approved and ready; execution has not started."
            : "Goal proposal rejected and recorded.",
        );
      } else setNotice(errorText(result.error));
    });
  };
  return (
    <section
      className="overview-shell goal-page"
      aria-labelledby="goals-page-title"
    >
      <a className="back-link" href="/">
        ← Back to project overview
      </a>
      <div className="overview-intro">
        <p className="eyebrow">SHORT-TERM GOALS</p>
        <h1 id="goals-page-title">Goal approval</h1>
        <p className="description">
          Agent proposals remain read-only until you review, edit, and
          explicitly decide.
        </p>
      </div>
      {state.status === "loading" && (
        <div className="overview-loading" role="status">
          Loading goals…
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
                <p className="eyebrow">RECORDED GOALS</p>
                <h2>Project goals</h2>
              </div>
              <button className="button secondary" type="button" onClick={load}>
                Refresh
              </button>
            </div>
            {state.goals.length === 0 ? (
              <p className="muted-note">
                No approved or rejected goal records yet.
              </p>
            ) : (
              <ul className="goal-list">
                {state.goals.map((item) => (
                  <li
                    key={`${item.goal.id}-${item.revision}`}
                    className="goal-card"
                  >
                    <strong>
                      {item.goal.id}: {item.goal.title}
                    </strong>
                    <span className={`stage-status ${item.goal.status}`}>
                      {item.goal.status}
                    </span>
                    <p>Boundary: {item.goal.boundary.join("; ")}</p>
                    <p>Acceptance: {item.goal.acceptanceCriteria.join("; ")}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <GoalForm
            form={form}
            onChange={setForm}
            proposal={proposal}
            onProposal={createProposal}
            onDecision={decide}
            busy={busy}
          />
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
