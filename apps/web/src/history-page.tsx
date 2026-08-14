import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { requestProjectList } from "./project-overview";
import { requestHistory, type HistoryPage } from "./history";

export function HistoryPageView(): ReactElement {
  const [page, setPage] = useState<HistoryPage | null>(null);
  const [message, setMessage] = useState("Loading history…");
  useEffect(() => {
    void requestProjectList().then((projects) => {
      if (!projects.ok || projects.value.currentProjectKey === null) {
        setMessage("Select a project to view history.");
        return;
      }
      void requestHistory(projects.value.currentProjectKey).then((result) => {
        if (result.ok) {
          setPage(result.value);
          setMessage("");
        } else setMessage(result.error.message);
      });
    });
  }, []);
  return (
    <section className="overview-panel" aria-labelledby="history-title">
      <p className="eyebrow">RECOVERY HISTORY</p>
      <h1 id="history-title">重启恢复与历史查看</h1>
      <p className="description">事实、生成快照和追加式审计事件分开显示。</p>
      {message !== "" && <p role="status">{message}</p>}
      {page !== null && (
        <div className="stack-list">
          {page.entries.map((entry) => (
            <article
              className="list-card"
              key={`${entry.kind}-${entry.id}-${entry.relativePath}`}
            >
              <strong>
                {entry.kind === "fact"
                  ? "事实"
                  : entry.kind === "generated_snapshot"
                    ? "生成快照"
                    : "审计事件"}{" "}
                · {entry.id}
              </strong>
              <span>{entry.summary}</span>
              <span>
                {entry.relativePath} · {entry.occurredAt}
              </span>
              {entry.revision !== null && (
                <span>
                  revision {entry.revision} · {entry.hash}
                </span>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
