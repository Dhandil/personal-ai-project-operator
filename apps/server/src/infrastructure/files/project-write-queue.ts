export type AsyncWriteOperation<Value> = () => Promise<Value>;

export class ProjectWriteQueue {
  private readonly tails = new Map<string, Promise<void>>();

  public async enqueue<Value>(
    projectKey: string,
    operation: AsyncWriteOperation<Value>,
  ): Promise<Value> {
    const previous = this.tails.get(projectKey) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.tails.set(projectKey, tail);

    try {
      return await previous.then(operation);
    } finally {
      release?.();
      if (this.tails.get(projectKey) === tail) {
        this.tails.delete(projectKey);
      }
    }
  }
}

export const sharedProjectWriteQueue = new ProjectWriteQueue();
