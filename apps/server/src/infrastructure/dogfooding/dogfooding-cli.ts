import { access } from "node:fs/promises";
import { resolve } from "node:path";

import { DogfoodingService } from "./dogfooding-service.js";

async function projectRootFromArguments(): Promise<string> {
  const explicit = process.argv[2];
  if (explicit !== undefined) {
    return resolve(explicit);
  }
  const current = resolve(process.cwd());
  try {
    await access(resolve(current, ".personal-workspace"));
    return current;
  } catch {
    return resolve(current, "../..");
  }
}

const projectRoot = await projectRootFromArguments();
const result = await new DogfoodingService(projectRoot).importAndRebuild();
if (!result.ok) {
  console.error(JSON.stringify({ ok: false, error: result.error }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, value: result.value }, null, 2));
}
