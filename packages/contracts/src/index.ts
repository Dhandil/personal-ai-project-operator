import { z } from "zod";

import { formalIdSchema } from "./identifiers.js";
import { statusSchema } from "./statuses.js";
import { utcIsoTimestampSchema } from "./times.js";

export * from "./identifiers.js";
export * from "./agent-runtime.js";
export * from "./task-package.js";
export * from "./statuses.js";
export * from "./times.js";

export const recordEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: formalIdSchema,
    status: statusSchema,
    revision: z.number().int().positive(),
    createdAt: utcIsoTimestampSchema,
    updatedAt: utcIsoTimestampSchema,
  })
  .strict();

export type RecordEnvelopeInput = z.input<typeof recordEnvelopeSchema>;
export type RecordEnvelope = z.output<typeof recordEnvelopeSchema>;
