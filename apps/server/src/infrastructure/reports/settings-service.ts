import {
  ProjectRegistryRepository,
  type ProjectIndexRecord,
} from "../registry/project-registry-repository.js";
import type { ProjectRegistryFactory } from "../projects/project-startup.js";

export type SummarySettings = Readonly<{
  readonly projectKey: string;
  readonly intervalMinutes: number;
  readonly source: "default" | "global" | "project";
}>;
export type SettingsError = Readonly<{
  readonly code: string;
  readonly message: string;
  readonly details: readonly string[];
}>;
export type SettingsResult<Value> =
  | Readonly<{ readonly ok: true; readonly value: Value }>
  | Readonly<{ readonly ok: false; readonly error: SettingsError }>;
type Options = Readonly<{ readonly registryFactory?: ProjectRegistryFactory }>;
const DEFAULT_INTERVAL = 10;

function failure<Value>(
  code: string,
  message: string,
  details: readonly string[] = [],
): SettingsResult<Value> {
  return { ok: false, error: { code, message, details } };
}
function parseInterval(value: string | null): number | null {
  const number = value === null ? NaN : Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 1440
    ? number
    : null;
}

export class SettingsService {
  private readonly registryFactory: ProjectRegistryFactory;
  public constructor(options: Options = {}) {
    this.registryFactory =
      options.registryFactory ?? (() => new ProjectRegistryRepository());
  }

  public get(projectKey: string): SettingsResult<SummarySettings> {
    return this.withRegistry(projectKey, (registry, project) => {
      const projectSetting = registry.getSetting(
        `project.${projectKey}.summary.interval_minutes`,
      );
      const projectValue = projectSetting.ok
        ? parseInterval(projectSetting.value)
        : null;
      const globalSetting = registry.getSetting("summary.interval_minutes");
      const globalValue = globalSetting.ok
        ? parseInterval(globalSetting.value)
        : null;
      return {
        ok: true,
        value: {
          projectKey: project.projectKey,
          intervalMinutes: projectValue ?? globalValue ?? DEFAULT_INTERVAL,
          source:
            projectValue === null
              ? globalValue === null
                ? "default"
                : "global"
              : "project",
        },
      };
    });
  }

  public update(input: unknown): SettingsResult<SummarySettings> {
    if (typeof input !== "object" || input === null || Array.isArray(input))
      return failure("invalid_input", "Settings payload is required.");
    const value = input as Record<string, unknown>;
    if (
      typeof value.projectKey !== "string" ||
      !Number.isInteger(value.intervalMinutes) ||
      Number(value.intervalMinutes) < 1 ||
      Number(value.intervalMinutes) > 1440
    )
      return failure(
        "invalid_input",
        "Interval must be an integer from 1 to 1440 minutes.",
      );
    return this.withRegistry(value.projectKey, (registry, project) => {
      const scope = value.scope === "global" ? "global" : "project";
      const key =
        scope === "global"
          ? "summary.interval_minutes"
          : `project.${project.projectKey}.summary.interval_minutes`;
      const saved = registry.setSetting(key, String(value.intervalMinutes));
      return saved.ok
        ? this.get(project.projectKey)
        : failure("registry_failed", saved.error.message, saved.error.details);
    });
  }

  private withRegistry<Value>(
    projectKey: string,
    callback: (
      registry: ProjectRegistryRepository,
      project: ProjectIndexRecord,
    ) => SettingsResult<Value>,
  ): SettingsResult<Value> {
    let registry: ProjectRegistryRepository;
    try {
      registry = this.registryFactory();
    } catch (error) {
      return failure(
        "registry_failed",
        "Project registry could not be opened.",
        [String(error)],
      );
    }
    try {
      const listed = registry.list();
      if (!listed.ok)
        return failure(
          "registry_failed",
          listed.error.message,
          listed.error.details,
        );
      const project = listed.value.find(
        (item) => item.projectKey === projectKey && !item.archived,
      );
      return project === undefined
        ? failure("project_not_found", "Project is not registered or archived.")
        : callback(registry, project);
    } finally {
      registry.close();
    }
  }
}
