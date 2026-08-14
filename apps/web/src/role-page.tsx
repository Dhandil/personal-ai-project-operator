import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { requestProjectList } from "./project-overview";
import {
  requestRoles,
  updateRole,
  type Role,
  type RoleApiError,
  type RoleView,
} from "./role";

type PageState =
  | Readonly<{ status: "loading" }>
  | Readonly<{
      status: "ready";
      projectKey: string;
      roles: readonly RoleView[];
    }>
  | Readonly<{ status: "error"; error: RoleApiError }>;
type FormState = Role;
function lines(value: string): readonly string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
function errorText(error: RoleApiError): string {
  return error.details.length === 0
    ? error.message
    : `${error.message} (${error.details.join(", ")})`;
}
function formFrom(role: Role): FormState {
  return {
    ...role,
    responsibilities: [...role.responsibilities],
    mustRead: [...role.mustRead],
    onDemandRead: [...role.onDemandRead],
    allowedActions: [...role.allowedActions],
    forbiddenActions: [...role.forbiddenActions],
    handoff: [...role.handoff],
  };
}

export function RolePage(): ReactElement {
  const [state, setState] = useState<PageState>({ status: "loading" });
  const [selected, setSelected] = useState<RoleView | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
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
      void requestRoles(projects.value.currentProjectKey).then((roles) => {
        if (!roles.ok) {
          setState({ status: "error", error: roles.error });
          return;
        }
        setState({
          status: "ready",
          projectKey: roles.value.projectKey,
          roles: roles.value.roles,
        });
        const first = roles.value.roles[0];
        if (first !== undefined) {
          setSelected(first);
          setForm(formFrom(first.role));
        }
      });
    });
  };
  useEffect(() => {
    load();
  }, []);
  const save = (): void => {
    if (state.status !== "ready" || selected === null || form === null) return;
    setBusy(true);
    setNotice(null);
    void updateRole(state.projectKey, form).then((result) => {
      setBusy(false);
      if (!result.ok) {
        setNotice(errorText(result.error));
        return;
      }
      setSelected(result.value);
      setForm(formFrom(result.value.role));
      setState({
        ...state,
        roles: state.roles.map((item) =>
          item.role.key === result.value.role.key ? result.value : item,
        ),
      });
      setNotice(`${result.value.role.title} saved.`);
    });
  };
  const field = (key: keyof Omit<Role, "key">, label: string): ReactElement => (
    <label className="role-field">
      {label}
      <textarea
        aria-label={label}
        value={
          Array.isArray(form?.[key])
            ? (form?.[key] as readonly string[]).join("\n")
            : String(form?.[key] ?? "")
        }
        onChange={(event) =>
          setForm(
            form === null
              ? null
              : { ...form, [key]: lines(event.target.value) },
          )
        }
      />
    </label>
  );
  return (
    <section
      className="overview-shell role-page"
      aria-labelledby="roles-page-title"
    >
      <a className="back-link" href="/">
        ← Back to project overview
      </a>
      <div className="overview-intro">
        <p className="eyebrow">ROLE TEMPLATES</p>
        <h1 id="roles-page-title">Roles and context</h1>
        <p className="description">
          Roles are stable project responsibilities, not Agent or chat-session
          identities. Required and on-demand context is checked against project
          files.
        </p>
      </div>
      {state.status === "loading" && (
        <div className="overview-loading" role="status">
          Loading roles…
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
                <p className="eyebrow">FIVE ROLE TEMPLATES</p>
                <h2>Choose a role</h2>
              </div>
              <button className="button secondary" type="button" onClick={load}>
                Refresh
              </button>
            </div>
            <ul className="role-list">
              {state.roles.map((item) => (
                <li key={item.role.key}>
                  <button
                    className={`role-card ${selected?.role.key === item.role.key ? "selected" : ""}`}
                    type="button"
                    onClick={() => {
                      setSelected(item);
                      setForm(formFrom(item.role));
                    }}
                  >
                    <strong>{item.role.title}</strong>
                    <span>{item.role.key}</span>
                    <small>
                      {item.source} · required context{" "}
                      {
                        item.context.mustRead.filter(
                          (entry) => entry.state === "available",
                        ).length
                      }
                      /{item.context.mustRead.length}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {selected !== null && form !== null && (
            <div className="overview-panel role-editor">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">EDITABLE TEMPLATE</p>
                  <h2>{selected.role.title}</h2>
                </div>
                <span className="read-only-badge">
                  {selected.canModifyProjectFiles
                    ? "Project role"
                    : "Reviewer: formal files read-only"}
                </span>
              </div>
              {field("title", "Title")}
              {field("responsibilities", "Responsibilities")}
              {field("mustRead", "Must read")}
              {field("onDemandRead", "On-demand read")}
              {field("allowedActions", "Allowed actions")}
              {field("forbiddenActions", "Forbidden actions")}
              {field("handoff", "Handoff")}
              {!selected.canModifyProjectFiles && (
                <p className="muted-note">
                  The reviewer template can be edited, but its default
                  permissions prohibit modifying formal implementation files.
                </p>
              )}
              <div className="wizard-actions">
                <button
                  className="button primary"
                  type="button"
                  onClick={save}
                  disabled={busy}
                >
                  {busy ? "Saving…" : "Save role template"}
                </button>
              </div>
              <div className="context-grid">
                <ContextList
                  title="Must read"
                  items={selected.context.mustRead}
                />
                <ContextList
                  title="On demand"
                  items={selected.context.onDemandRead}
                />
              </div>
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
function ContextList({
  title,
  items,
}: Readonly<{
  readonly title: string;
  readonly items: readonly Readonly<{
    readonly name: string;
    readonly required: boolean;
    readonly paths: readonly string[];
    readonly state: "available" | "missing";
  }>[];
}>): ReactElement {
  return (
    <div className="context-list">
      <h3>{title}</h3>
      {items.map((item) => (
        <div key={item.name} className={`context-item ${item.state}`}>
          <strong>{item.name}</strong>
          <span>{item.state}</span>
          <small>{item.paths.join(", ") || "No mapped path"}</small>
        </div>
      ))}
    </div>
  );
}
