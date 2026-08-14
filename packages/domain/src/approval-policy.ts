import type { FormalId } from "@personal-ai-operator/contracts";

import {
  isApprovalAccepted,
  type Approval,
  type ApprovalType,
} from "./approval.js";
import { recordFailure } from "./record.js";
import type { DomainResult } from "./workflow.js";

export type ApprovalGateRequest = Readonly<{
  readonly approvalType: ApprovalType;
  readonly subjectId: FormalId;
  readonly approvals: readonly Approval[];
}>;

export function findAcceptedApproval(
  request: ApprovalGateRequest,
): Approval | undefined {
  return request.approvals.find(
    (approval) =>
      approval.approvalType === request.approvalType &&
      approval.subjectId === request.subjectId &&
      isApprovalAccepted(approval),
  );
}

export function requireApprovalGate(
  request: ApprovalGateRequest,
): DomainResult<Approval> {
  const approval = findAcceptedApproval(request);
  if (approval === undefined) {
    return recordFailure(
      "approval_required",
      `Accepted user approval is required for ${request.approvalType}.`,
    );
  }
  return { ok: true, value: approval };
}

export function isApprovalGateSatisfied(request: ApprovalGateRequest): boolean {
  return findAcceptedApproval(request) !== undefined;
}
