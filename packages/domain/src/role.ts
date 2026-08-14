export const roleKeys = [
  "project-lead",
  "product-requirements",
  "architect",
  "executor",
  "reviewer",
] as const;

export type RoleKey = (typeof roleKeys)[number];

export type Role = Readonly<{
  readonly key: RoleKey;
  readonly title: string;
  readonly responsibilities: readonly string[];
  readonly mustRead: readonly string[];
  readonly onDemandRead: readonly string[];
  readonly allowedActions: readonly string[];
  readonly forbiddenActions: readonly string[];
  readonly handoff: readonly string[];
}>;

const ROLE_TEMPLATES: readonly Role[] = [
  {
    key: "project-lead",
    title: "Project lead",
    responsibilities: ["shape goals", "manage scope", "coordinate handoffs"],
    mustRead: ["approved goal", "project state"],
    onDemandRead: ["discovery notes", "decision records"],
    allowedActions: ["propose goals", "assign roles", "request review"],
    forbiddenActions: ["approve own goal", "bypass user decisions"],
    handoff: ["goal boundary", "risks", "acceptance criteria"],
  },
  {
    key: "product-requirements",
    title: "Product and requirements",
    responsibilities: ["clarify user needs", "define acceptance criteria"],
    mustRead: ["approved goal", "user context"],
    onDemandRead: ["research evidence", "existing decisions"],
    allowedActions: ["write requirements", "identify ambiguity"],
    forbiddenActions: ["expand approved scope", "merge code"],
    handoff: ["requirements", "open questions", "acceptance criteria"],
  },
  {
    key: "architect",
    title: "Architect",
    responsibilities: ["define boundaries", "record technical decisions"],
    mustRead: ["approved goal", "requirements"],
    onDemandRead: ["repository guidance", "prior decisions"],
    allowedActions: ["propose architecture", "document tradeoffs"],
    forbiddenActions: ["silently change scope", "approve execution"],
    handoff: ["architecture", "decisions", "risks"],
  },
  {
    key: "executor",
    title: "Executor",
    responsibilities: ["implement assigned task", "run verification"],
    mustRead: ["task card", "required files"],
    onDemandRead: ["architecture", "decision records"],
    allowedActions: ["change allowed paths", "run verification commands"],
    forbiddenActions: ["change forbidden paths", "self-approve completion"],
    handoff: ["changed files", "tests", "commit", "open issues"],
  },
  {
    key: "reviewer",
    title: "Reviewer",
    responsibilities: ["inspect evidence", "decide acceptance"],
    mustRead: ["task card", "verification evidence"],
    onDemandRead: ["implementation details", "decision records"],
    allowedActions: ["read repository", "write review report"],
    forbiddenActions: ["modify implementation", "run mutating commands"],
    handoff: ["findings", "acceptance decision", "follow-up tasks"],
  },
];

export function createDefaultRoles(): readonly Role[] {
  return ROLE_TEMPLATES.map((role) => ({
    ...role,
    responsibilities: [...role.responsibilities],
    mustRead: [...role.mustRead],
    onDemandRead: [...role.onDemandRead],
    allowedActions: [...role.allowedActions],
    forbiddenActions: [...role.forbiddenActions],
    handoff: [...role.handoff],
  }));
}

export function getRole(key: RoleKey): Role | undefined {
  return createDefaultRoles().find((role) => role.key === key);
}
