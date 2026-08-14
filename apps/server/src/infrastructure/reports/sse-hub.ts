export type RealtimeEvent = Readonly<{
  readonly id: string;
  readonly projectKey: string;
  readonly event: "report" | "summary";
  readonly occurredAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
}>;

type Listener = (event: RealtimeEvent) => void;

export class SseHub {
  private readonly history = new Map<string, RealtimeEvent[]>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly historyLimit: number;

  public constructor(historyLimit = 200) {
    this.historyLimit = historyLimit;
  }

  public publish(event: RealtimeEvent): void {
    const items = this.history.get(event.projectKey) ?? [];
    if (items.some((item) => item.id === event.id)) return;
    items.push(event);
    if (items.length > this.historyLimit) {
      items.splice(0, items.length - this.historyLimit);
    }
    this.history.set(event.projectKey, items);
    for (const listener of this.listeners.get(event.projectKey) ?? []) {
      listener(event);
    }
  }

  public replay(
    projectKey: string,
    lastEventId: string | null,
  ): readonly RealtimeEvent[] {
    const items = this.history.get(projectKey) ?? [];
    if (lastEventId === null) return [...items];
    const index = items.findIndex((item) => item.id === lastEventId);
    return index < 0 ? [...items] : items.slice(index + 1);
  }

  public subscribe(projectKey: string, listener: Listener): () => void {
    const listeners = this.listeners.get(projectKey) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(projectKey, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(projectKey);
    };
  }
}
