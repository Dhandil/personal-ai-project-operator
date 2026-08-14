import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { requestProjectList } from "./project-overview";
import { requestApprovals, type ApprovalPage } from "./approval";

export function ApprovalPage(): ReactElement {
  const [page, setPage] = useState<ApprovalPage | null>(null);
  const [message, setMessage] = useState("Loading approvals…");
  useEffect(() => {
    void requestProjectList().then((projects) => {
      if (!projects.ok || projects.value.currentProjectKey === null) {
        setMessage("Select a project to view approvals.");
        return;
      }
      void requestApprovals(projects.value.currentProjectKey).then((result) => {
        if (result.ok) {
          setPage(result.value);
          setMessage("");
        } else setMessage(result.error.message);
      });
    });
  }, []);
  return (
    <section className="overview-panel" aria-labelledby="approvals-title">
      <p className="eyebrow">APPROVAL HISTORY</p>
      <h1 id="approvals-title">审批记录与目标验收</h1>
      <p className="description">
        每条审批都显示请求时的 revision/hash；对象变化后不会继续授权。
      </p>
      {message !== "" && <p role="status">{message}</p>}
      {page !== null && (
        <div className="stack-list">
          {page.approvals.length === 0 ? (
            <p>暂无审批记录。</p>
          ) : (
            page.approvals.map((item) => (
              <article className="list-card" key={item.approvalId}>
                <strong>
                  {item.approvalId} · {item.approval.approvalType}
                </strong>
                <span>
                  对象 {item.approval.subjectId} · {item.approval.status}
                </span>
                <span>
                  快照 revision {item.subjectSnapshot.revision} ·{" "}
                  {item.stale ? "已过期" : "有效"}
                </span>
                <span>
                  {item.operation === null
                    ? "通用审批"
                    : item.operation === "goal_acceptance"
                      ? "目标验收"
                      : "main 合并批准"}
                </span>
                {item.approval.decision !== null && (
                  <span>
                    结果：{item.approval.decision.outcome} ·{" "}
                    {item.approval.decision.note}
                  </span>
                )}
              </article>
            ))
          )}
        </div>
      )}
    </section>
  );
}
