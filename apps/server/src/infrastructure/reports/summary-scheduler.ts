export type SummaryIntervalReader = (projectKey: string) => Promise<number>;
export type SummaryCallback = (projectKey: string) => Promise<void> | void;

export type SummarySchedulerOptions = Readonly<{
  readonly readIntervalMinutes: SummaryIntervalReader;
  readonly onSummary: SummaryCallback;
  readonly setTimeout?: typeof setTimeout;
  readonly clearTimeout?: typeof clearTimeout;
}>;

export class SummaryScheduler {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly readIntervalMinutes: SummaryIntervalReader;
  private readonly onSummary: SummaryCallback;
  private readonly setTimer: typeof setTimeout;
  private readonly clearTimer: typeof clearTimeout;

  public constructor(options: SummarySchedulerOptions) {
    this.readIntervalMinutes = options.readIntervalMinutes;
    this.onSummary = options.onSummary;
    this.setTimer = options.setTimeout ?? setTimeout;
    this.clearTimer = options.clearTimeout ?? clearTimeout;
  }

  public async start(projectKey: string): Promise<number> {
    this.stop(projectKey);
    const minutes = Math.max(1, await this.readIntervalMinutes(projectKey));
    const timer = this.setTimer(() => {
      void Promise.resolve(this.onSummary(projectKey)).finally(() => {
        void this.start(projectKey);
      });
    }, minutes * 60_000);
    this.timers.set(projectKey, timer);
    return minutes;
  }

  public stop(projectKey: string): void {
    const timer = this.timers.get(projectKey);
    if (timer !== undefined) this.clearTimer(timer);
    this.timers.delete(projectKey);
  }

  public stopAll(): void {
    for (const projectKey of this.timers.keys()) this.stop(projectKey);
  }
}
