import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { requestProjectList } from "./project-overview";
import {
  createIssue,
  recordIssueDecision,
  recoverIssue,
  requestIssues,
  type IssueAction,
  type IssueApiError,
  type IssueApiResult,
  type IssueSnapshot,
  type IssuesPayload,
} from "./issue";

type FormState = Readonly<{
  title: string;
  description: string;
  severity: string;
  impact: string;
  affectedTaskIds: string;
  discussion: string;
  recoveryPlan: string;
}>;
const initialForm: FormState = {
  title: "",
  description: "",
  severity: "high",
  impact: "unknown",
  affectedTaskIds: "",
  discussion: "",
  recoveryPlan: "",
};
type PageState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; value: IssuesPayload }>
  | Readonly<{ status: "error"; error: IssueApiError }>;
function lines(value: string): readonly string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
function errorText(error: IssueApiError): string {
  return error.details.length === 0
    ? error.message
    : `${error.message} (${error.details.join(", ")})`;
}
function IssueCard({
  snapshot,
  decisions,
  onRecover,
}: Readonly<{
  readonly snapshot: IssueSnapshot;
  readonly decisions: IssuesPayload["decisions"];
  readonly onRecover: (issueId: string) => void;
}>): ReactElement {
  const issue = snapshot.issue;
  const relatedDecisions = decisions.filter((item) =>
    issue.decisionIds.includes(item.decision.id),
  );
  return (
    <li className="issue-card">
      <div className="panel-heading">
        <div>
          <strong>
            {issue.id}: {issue.title}
          </strong>
          <p className="muted-note">{issue.description}</p>
        </div>
        <span className={`stage-status ${issue.status}`}>{issue.status}</span>
      </div>
      <p>
        Severity: {issue.severity} · Impact: {issue.impact}
      </p>
      {issue.impact === "unknown" ? (
        <p className="issue-impact unknown">
          Unknown impact: the current execution chain was paused pending scope.
        </p>
      ) : (
        <p className="issue-impact">
          Known impact: affected tasks{" "}
          {issue.affectedTaskIds.join(", ") || "none"}.
        </p>
      )}
      <h3>Discussion</h3>
      <ul>
        {issue.discussion.map((entry) => (
          <li key={entry}>{entry}</li>
        ))}
      </ul>
      {relatedDecisions.length > 0 && (
        <div className="issue-decisions">
          <h3>Decisions and recovery</h3>
          {relatedDecisions.map((item) => (
            <div key={item.decision.id}>
              <strong>{item.decision.question}</strong>
              <p>Options: {item.decision.options.join(", ")}</p>
              {item.decision.decision !== null && (
                <p>
                  User chose “{item.decision.decision.selectedOption}”:{" "}
                  {item.decision.decision.rationale}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      {(issue.status === "in_progress" || issue.status === "draft") && (
        <button
          className="button secondary"
          type="button"
          onClick={() => onRecover(issue.id)}
        >
          Resolve and resume affected tasks
        </button>
      )}
    </li>
  );
}

export function IssuePage(): ReactElement {
  const [state, setState] = useState<PageState>({ status: "loading" });
  const [form, setForm] = useState<FormState>(initialForm);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [decision, setDecision] = useState({
    question: "",
    options: "resume\ncancel",
    selectedOption: "",
    rationale: "",
  });
  const load = (): void => {
    setState({ status: "loading" });
    void requestProjectList().then((projects) => {
      if (!projects.ok) {
        setState({ status: "error", error: projects.error });
        return;
      }
      const key = projects.value.currentProjectKey;
      if (key === null) {
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
      void requestIssues(key).then((issues) =>
        setState(
          issues.ok
            ? { status: "ready", value: issues.value }
            : { status: "error", error: issues.error },
        ),
      );
    });
  };
  useEffect(() => load(), []);
  const actionDone = (
    result: IssueApiResult<IssueAction>,
    message: string,
  ): void => {
    setBusy(false);
    if (!result.ok) {
      setNotice(errorText(result.error));
      return;
    }
    setNotice(message);
    setSelectedIssue(result.value.issue.issue.id);
    setState((current) => {
      if (current.status !== "ready") return current;
      const existingIssues = current.value.issues.filter(
        (item) => item.issue.id !== result.value.issue.issue.id,
      );
      const existingDecisions = current.value.decisions.filter(
        (item) => item.decision.id !== result.value.decision?.decision.id,
      );
      return {
        status: "ready",
        value: {
          ...current.value,
          issues: [...existingIssues, result.value.issue],
          decisions:
            result.value.decision === null
              ? current.value.decisions
              : [...existingDecisions, result.value.decision],
        },
      };
    });
  };
  const openIssue = (): void => {
    if (state.status !== "ready") return;
    setBusy(true);
    setNotice(null);
    void createIssue({
      projectKey: state.value.projectKey,
      title: form.title,
      description: form.description,
      severity: form.severity,
      impact: form.impact,
      affectedTaskIds: lines(form.affectedTaskIds),
      affectedObjectIds: [],
      discussion: lines(form.discussion),
      recoveryPlan: form.recoveryPlan,
    }).then((result) =>
      actionDone(
        result,
        "Issue recorded; the applicable execution scope is paused.",
      ),
    );
  };
  const saveDecision = (): void => {
    if (state.status !== "ready" || selectedIssue === null) return;
    setBusy(true);
    void recordIssueDecision({
      projectKey: state.value.projectKey,
      issueId: selectedIssue,
      question: decision.question,
      options: lines(decision.options),
      selectedOption: decision.selectedOption || undefined,
      rationale: decision.rationale || undefined,
    }).then((result) =>
      actionDone(result, "User decision recorded with rationale."),
    );
  };
  const resolveIssue = (issueId: string): void => {
    if (state.status !== "ready") return;
    setBusy(true);
    void recoverIssue({
      projectKey: state.value.projectKey,
      issueId,
      action: "resume",
      rationale: "User confirmed recovery after reviewing the issue.",
    }).then((result) =>
      actionDone(result, "Issue resolved and affected tasks were resumed."),
    );
  };
  return (
    <section
      className="overview-shell issue-page"
      aria-labelledby="issues-page-title"
    >
      <a className="back-link" href="/">
        ← Back to project overview
      </a>
      <div className="overview-intro">
        <p className="eyebrow">ISSUES &amp; DECISIONS</p>
        <h1 id="issues-page-title">Issue coordination</h1>
        <p className="description">
          Record impact, preserve discussion and let the user decide how
          execution should recover.
        </p>
      </div>
      {state.status === "loading" && (
        <div className="overview-loading" role="status">
          Loading issues…
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
                <h2>Open issues</h2>
              </div>
              <button className="button secondary" type="button" onClick={load}>
                Refresh
              </button>
            </div>
            {state.value.issues.length === 0 ? (
              <p className="muted-note">No issues have been recorded.</p>
            ) : (
              <ul className="issue-list">
                {state.value.issues.map((item) => (
                  <IssueCard
                    key={`${item.issue.id}-${item.revision}`}
                    snapshot={item}
                    decisions={state.value.decisions}
                    onRecover={resolveIssue}
                  />
                ))}
              </ul>
            )}
          </div>
          <div
            className="overview-panel issue-editor"
            role="region"
            aria-label="Issue editor"
          >
            <p className="eyebrow">AGENT / USER RECORD</p>
            <h2>Record an issue</h2>
            {(
              [
                "title",
                "description",
                "affectedTaskIds",
                "discussion",
                "recoveryPlan",
              ] as const
            ).map((key) => (
              <label key={key}>
                {key === "affectedTaskIds"
                  ? "Affected task IDs"
                  : key === "recoveryPlan"
                    ? "Recovery plan"
                    : key.charAt(0).toUpperCase() + key.slice(1)}
                <textarea
                  aria-label={
                    key === "affectedTaskIds" ? "Affected task IDs" : key
                  }
                  value={form[key]}
                  onChange={(event) =>
                    setForm({ ...form, [key]: event.target.value })
                  }
                />
              </label>
            ))}
            <label>
              Severity
              <select
                aria-label="Severity"
                value={form.severity}
                onChange={(event) =>
                  setForm({ ...form, severity: event.target.value })
                }
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="blocker">blocker</option>
              </select>
            </label>
            <label>
              Impact
              <select
                aria-label="Impact"
                value={form.impact}
                onChange={(event) =>
                  setForm({ ...form, impact: event.target.value })
                }
              >
                <option value="unknown">unknown — pause current chain</option>
                <option value="task">task — pause affected tasks</option>
                <option value="execution_chain">execution chain</option>
              </select>
            </label>
            <button
              className="button primary"
              type="button"
              onClick={openIssue}
              disabled={busy}
            >
              Record issue and pause
            </button>
          </div>
          {selectedIssue !== null && (
            <div
              className="overview-panel issue-editor"
              role="region"
              aria-label="Decision editor"
            >
              <p className="eyebrow">USER DECISION</p>
              <h2>Decide and preserve rationale</h2>
              <label>
                Question
                <textarea
                  aria-label="Decision question"
                  value={decision.question}
                  onChange={(event) =>
                    setDecision({ ...decision, question: event.target.value })
                  }
                />
              </label>
              <label>
                Options
                <textarea
                  aria-label="Decision options"
                  value={decision.options}
                  onChange={(event) =>
                    setDecision({ ...decision, options: event.target.value })
                  }
                />
              </label>
              <label>
                Selected option
                <input
                  aria-label="Selected option"
                  value={decision.selectedOption}
                  onChange={(event) =>
                    setDecision({
                      ...decision,
                      selectedOption: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Rationale
                <textarea
                  aria-label="Decision rationale"
                  value={decision.rationale}
                  onChange={(event) =>
                    setDecision({ ...decision, rationale: event.target.value })
                  }
                />
              </label>
              <button
                className="button primary"
                type="button"
                onClick={saveDecision}
                disabled={busy}
              >
                Record user decision
              </button>
            </div>
          )}
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
