export type CommitMessageRequest = Readonly<{
  readonly type: string;
  readonly scope: string;
  readonly description: string;
  readonly taskId: string;
}>;

export type CommitMessage = Readonly<{
  readonly subject: string;
  readonly body: string;
  readonly message: string;
}>;

export type CommitMessageResult =
  | Readonly<{ readonly ok: true; readonly value: CommitMessage }>
  | Readonly<{
      readonly ok: false;
      readonly error: Readonly<{
        readonly code: "invalid_message";
        readonly message: string;
      }>;
    }>;

function validToken(value: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(value);
}

function validTaskId(value: string): boolean {
  return /^TASK-[0-9]{3}$/.test(value) && Number(value.slice(5)) > 0;
}

export function createTaskCommitMessage(
  input: CommitMessageRequest,
): CommitMessageResult {
  if (!validToken(input.type) || !validToken(input.scope)) {
    return {
      ok: false,
      error: {
        code: "invalid_message",
        message: "Commit type and scope must use lowercase English tokens.",
      },
    };
  }
  if (
    input.description.trim().length === 0 ||
    input.description.includes("\n") ||
    input.description.includes("\r")
  ) {
    return {
      ok: false,
      error: {
        code: "invalid_message",
        message: "Commit description must be one non-empty line.",
      },
    };
  }
  if (!validTaskId(input.taskId)) {
    return {
      ok: false,
      error: {
        code: "invalid_message",
        message: "Commit task reference must be a valid TASK-### ID.",
      },
    };
  }
  const subject = `${input.type}(${input.scope}): ${input.description.trim()}`;
  const body = `Tasks: ${input.taskId}`;
  return {
    ok: true,
    value: { subject, body, message: `${subject}\n\n${body}` },
  };
}

export { createTaskCommitMessage as formatTaskCommitMessage };
