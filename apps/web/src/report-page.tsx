import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { requestProjectList } from "./project-overview";
import {
  requestReports,
  requestSummarySettings,
  subscribeToProjectEvents,
  updateSummarySettings,
  type ExecutionReport,
  type ReportApiError,
  type SummarySettings,
} from "./report";

type PageState = Readonly<
  | { status: "loading" }
  | { status: "error"; error: ReportApiError }
  | {
      status: "ready";
      projectKey: string;
      reports: readonly ExecutionReport[];
      settings: SummarySettings;
    }
>;
function errorText(error: ReportApiError): string {
  return error.details.length === 0
    ? error.message
    : `${error.message} (${error.details.join(", ")})`;
}
export function ReportPage(): ReactElement {
  const [state, setState] = useState<PageState>({ status: "loading" });
  const [interval, setIntervalValue] = useState(10);
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
      Promise.all([requestReports(key), requestSummarySettings(key)]).then(
        ([reports, settings]) => {
          if (!reports.ok)
            return setState({ status: "error", error: reports.error });
          if (!settings.ok)
            return setState({ status: "error", error: settings.error });
          setIntervalValue(settings.value.intervalMinutes);
          setState({
            status: "ready",
            projectKey: key,
            reports: reports.value.reports,
            settings: settings.value,
          });
        },
      );
    });
  };
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (state.status !== "ready") return;
    const source = subscribeToProjectEvents(state.projectKey, (event) =>
      setState((current) =>
        current.status !== "ready" ||
        current.reports.some((item) => item.id === event.data.id)
          ? current
          : { ...current, reports: [...current.reports, event.data] },
      ),
    );
    return () => source.close();
  }, [state.status === "ready" ? state.projectKey : null]);
  const saveInterval = (): void => {
    if (state.status !== "ready") return;
    void updateSummarySettings({
      projectKey: state.projectKey,
      intervalMinutes: interval,
    }).then((result) => {
      if (!result.ok) return setNotice(errorText(result.error));
      setState({ ...state, settings: result.value });
      setNotice("Summary interval saved for this project.");
    });
  };
  return (
    <section
      className="overview-shell report-page"
      aria-labelledby="reports-page-title"
    >
      <a className="back-link" href="/">
        ← Back to project overview
      </a>
      <div className="overview-intro">
        <p className="eyebrow">LIVE REPORTS</p>
        <h1 id="reports-page-title">Execution reports</h1>
        <p className="description">
          Reports cite audit evidence; the live stream resumes after the last
          event cursor.
        </p>
      </div>
      {state.status === "loading" && (
        <div className="overview-loading" role="status">
          Loading reports…
        </div>
      )}
      {state.status === "error" && (
        <div className="overview-alert error" role="alert">
          {errorText(state.error)}
        </div>
      )}
      {state.status === "ready" && (
        <>
          <div className="overview-panel report-settings">
            <div>
              <p className="eyebrow">SUMMARY INTERVAL</p>
              <h2>Long-task summaries</h2>
            </div>
            <label>
              Minutes
              <input
                aria-label="Summary interval minutes"
                type="number"
                min="1"
                max="1440"
                value={interval}
                onChange={(event) =>
                  setIntervalValue(Number(event.target.value))
                }
              />
            </label>
            <button
              className="button primary"
              type="button"
              onClick={saveInterval}
            >
              Save interval
            </button>
            <p className="muted-note">
              Current source: {state.settings.source}. Default is 10 minutes;
              project settings override the global default.
            </p>
          </div>
          <div className="overview-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">AUDIT-BACKED EVENTS</p>
                <h2>Recent reports</h2>
              </div>
              <button className="button secondary" type="button" onClick={load}>
                Refresh
              </button>
            </div>
            {state.reports.length === 0 ? (
              <p className="muted-note">No execution reports yet.</p>
            ) : (
              <ul className="report-list">
                {state.reports.map((report) => (
                  <li className="report-card" key={report.id}>
                    <span className="stage-status">{report.kind}</span>
                    <strong>{report.title}</strong>
                    <p>{report.summary}</p>
                    <small>
                      Evidence:{" "}
                      {report.evidence
                        .map((item) => `${item.source}#${item.eventId}`)
                        .join(", ")}
                    </small>
                  </li>
                ))}
              </ul>
            )}
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
