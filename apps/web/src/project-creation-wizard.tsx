import type { FormEvent, ReactElement } from "react";
import { useState } from "react";

import {
  requestProjectInitialization,
  requestProjectDirectorySelection,
  requestProjectPreview,
  validateProjectCreationForm,
  type InitializationError,
  type InitializationExecution,
  type ProjectCreationForm,
  type ProjectPreview,
} from "./project-initialization";

type ProjectCreationWizardProps = Readonly<{
  readonly onBack: () => void;
}>;

function ErrorPanel({
  error,
}: Readonly<{ readonly error: InitializationError }>): ReactElement {
  return (
    <div className="wizard-alert error" role="alert">
      <strong>{error.message}</strong>
      {error.details.length > 0 && (
        <ul>
          {error.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
      <p>请检查目录和 Git 状态，保留当前输入后重新生成预览。</p>
    </div>
  );
}

function PreviewPanel({
  preview,
  onApprove,
  onEdit,
  busy,
}: Readonly<{
  readonly preview: ProjectPreview;
  readonly onApprove: () => void;
  readonly onEdit: () => void;
  readonly busy: boolean;
}>): ReactElement {
  return (
    <section
      className="wizard-panel preview-panel"
      aria-labelledby="preview-title"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">STEP 2 · REVIEW</p>
          <h2 id="preview-title">初始化预览</h2>
        </div>
        <span className="read-only-badge">只读预览</span>
      </div>

      <div className="preview-project">
        <span className="preview-label">项目目录</span>
        <code>{preview.projectRoot}</code>
        <span className="preview-label">项目想法</span>
        <p>{preview.idea}</p>
      </div>

      <div className="preview-grid">
        <section className="preview-section" aria-labelledby="files-title">
          <h3 id="files-title">将要创建的治理文件</h3>
          <ul className="file-plan-list">
            {preview.plannedFiles.map((file) => (
              <li
                className={file.action === "conflict" ? "conflict" : ""}
                key={file.relativePath}
              >
                <span aria-hidden="true">
                  {file.action === "conflict" ? "!" : "+"}
                </span>
                <code>{file.relativePath}</code>
              </li>
            ))}
          </ul>
          {preview.conflicts.length > 0 && (
            <p className="inline-warning">
              检测到 {preview.conflicts.length} 个冲突，批准前不会覆盖已有文件。
            </p>
          )}
        </section>

        <section className="preview-section" aria-labelledby="defaults-title">
          <h3 id="defaults-title">默认治理设置</h3>
          <dl className="preview-stats">
            <div>
              <dt>工作流阶段</dt>
              <dd>{preview.defaultWorkflow.length}</dd>
            </div>
            <div>
              <dt>角色</dt>
              <dd>{preview.defaultRoles.length}</dd>
            </div>
            <div>
              <dt>设置</dt>
              <dd>{preview.defaultSettings.length}</dd>
            </div>
          </dl>
          <h3>Git 计划</h3>
          <p className="git-plan-action">{preview.git.planned.action}</p>
          <ul className="command-list">
            {preview.git.planned.commands.map((command) => (
              <li key={command}>
                <code>{command}</code>
              </li>
            ))}
          </ul>
          <p className="muted-note">预览不会写入文件、registry 或 Git。</p>
        </section>
      </div>

      <div className="wizard-actions">
        <button
          className="button secondary"
          type="button"
          onClick={onEdit}
          disabled={busy}
        >
          返回修改
        </button>
        <button
          className="button primary"
          type="button"
          onClick={onApprove}
          disabled={busy || preview.conflicts.length > 0}
        >
          {busy ? "正在创建…" : "批准并创建项目"}
        </button>
      </div>
    </section>
  );
}

function SuccessPanel({
  execution,
}: Readonly<{ readonly execution: InitializationExecution }>): ReactElement {
  return (
    <section
      className="wizard-panel success-panel"
      aria-labelledby="success-title"
    >
      <span className="success-mark" aria-hidden="true">
        ✓
      </span>
      <p className="eyebrow">PROJECT READY</p>
      <h2 id="success-title">项目已创建</h2>
      <p className="description">
        治理文件、项目索引、初始化审计和本地 Git 基线已完成。
      </p>
      <dl className="result-list">
        <div>
          <dt>项目目录</dt>
          <dd>
            <code>{execution.projectRoot}</code>
          </dd>
        </div>
        <div>
          <dt>创建文件</dt>
          <dd>{execution.filesCreated.length}</dd>
        </div>
        <div>
          <dt>审计事件</dt>
          <dd>
            <code>{execution.auditEventId}</code>
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function ProjectCreationWizard({
  onBack,
}: ProjectCreationWizardProps): ReactElement {
  const [form, setForm] = useState<ProjectCreationForm>({
    projectRoot: "",
    projectName: "",
    idea: "",
  });
  const [formErrors, setFormErrors] = useState<
    Readonly<Record<string, string | undefined>>
  >({});
  const [preview, setPreview] = useState<ProjectPreview | null>(null);
  const [error, setError] = useState<InitializationError | null>(null);
  const [execution, setExecution] = useState<InitializationExecution | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [directoryPickerBusy, setDirectoryPickerBusy] = useState(false);

  function updateField(field: keyof ProjectCreationForm, value: string): void {
    setForm((current) => ({ ...current, [field]: value }));
    setFormErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handlePreview(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const validation = validateProjectCreationForm(form);
    setFormErrors(validation);
    setError(null);
    if (Object.keys(validation).length > 0) {
      return;
    }

    setBusy(true);
    const result = await requestProjectPreview(form);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPreview(result.value);
  }

  async function handleDirectorySelection(): Promise<void> {
    setDirectoryPickerBusy(true);
    setError(null);
    const result = await requestProjectDirectorySelection();
    setDirectoryPickerBusy(false);
    if (!result.ok) {
      if (result.error.code === "cancelled") {
        return;
      }
      setError(result.error);
      return;
    }
    updateField("projectRoot", result.value.projectRoot);
  }

  async function handleApprove(): Promise<void> {
    if (preview === null) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await requestProjectInitialization(preview, "APPROVAL-001");
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setExecution(result.value);
  }

  if (execution !== null) {
    return (
      <div className="wizard-shell">
        <button className="back-link" type="button" onClick={onBack}>
          ← 返回项目首页
        </button>
        <SuccessPanel execution={execution} />
      </div>
    );
  }

  return (
    <div className="wizard-shell">
      <button className="back-link" type="button" onClick={onBack}>
        ← 返回项目首页
      </button>
      <section className="wizard-intro">
        <p className="eyebrow">
          NEW PROJECT · STEP {preview === null ? "1" : "2"}
        </p>
        <h1>创建一个受治理的项目</h1>
        <p className="description">
          先填写项目基本信息，再检查完整的文件与 Git
          计划。只有你明确批准后，系统才会执行创建。
        </p>
      </section>

      {error !== null && <ErrorPanel error={error} />}

      {preview === null ? (
        <form
          className="wizard-panel creation-form"
          onSubmit={(event) => void handlePreview(event)}
        >
          <div className="panel-heading">
            <div>
              <p className="eyebrow">STEP 1 · DEFINE</p>
              <h2>项目基本信息</h2>
            </div>
            <span className="step-counter">1 / 2</span>
          </div>
          <label htmlFor="project-root">
            项目目录 <span>*</span>
          </label>
          <div className="directory-input-row">
            <input
              id="project-root"
              name="projectRoot"
              value={form.projectRoot}
              onChange={(event) =>
                updateField("projectRoot", event.target.value)
              }
              placeholder="例如：D:\\Projects\\my-project"
              aria-invalid={formErrors.projectRoot !== undefined}
              aria-describedby={
                formErrors.projectRoot !== undefined
                  ? "project-root-error"
                  : undefined
              }
            />
            <button
              className="button secondary directory-picker-button"
              type="button"
              onClick={() => void handleDirectorySelection()}
              disabled={busy || directoryPickerBusy}
            >
              {directoryPickerBusy ? "正在打开…" : "选择本机目录"}
            </button>
          </div>
          <p className="muted-note">
            {directoryPickerBusy
              ? "正在打开 Windows 目录选择器；如果窗口没有出现，请检查任务栏，或直接手动输入绝对路径。"
              : "Windows 用户可打开本机目录选择器；也可以继续手动输入绝对路径。"}
          </p>
          {directoryPickerBusy && (
            <p className="picker-progress" role="status">
              目录选择器正在等待你的选择…
            </p>
          )}
          {formErrors.projectRoot !== undefined && (
            <p className="field-error" id="project-root-error">
              {formErrors.projectRoot}
            </p>
          )}

          <label htmlFor="project-name">
            项目名称 <span className="optional">可选</span>
          </label>
          <input
            id="project-name"
            name="projectName"
            value={form.projectName}
            onChange={(event) => updateField("projectName", event.target.value)}
            placeholder="留空则使用目录名称"
          />

          <label htmlFor="project-idea">
            项目想法 <span>*</span>
          </label>
          <textarea
            id="project-idea"
            name="idea"
            rows={5}
            value={form.idea}
            onChange={(event) => updateField("idea", event.target.value)}
            placeholder="你希望这个项目解决什么问题？"
            aria-invalid={formErrors.idea !== undefined}
            aria-describedby={
              formErrors.idea !== undefined ? "project-idea-error" : undefined
            }
          />
          {formErrors.idea !== undefined && (
            <p className="field-error" id="project-idea-error">
              {formErrors.idea}
            </p>
          )}

          <div className="wizard-actions">
            <button className="button secondary" type="button" onClick={onBack}>
              取消
            </button>
            <button className="button primary" type="submit" disabled={busy}>
              {busy ? "正在检查…" : "生成初始化预览 →"}
            </button>
          </div>
        </form>
      ) : (
        <PreviewPanel
          preview={preview}
          onApprove={() => void handleApprove()}
          onEdit={() => {
            setPreview(null);
            setError(null);
          }}
          busy={busy}
        />
      )}
    </div>
  );
}
