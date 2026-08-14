import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  DogfoodingService,
  type DogfoodingHistoricalSnapshot,
} from "./dogfooding-service.js";

async function projectRootFromArguments(
  arguments_: readonly string[],
): Promise<string> {
  const explicit = arguments_.find(
    (argument, index) =>
      !argument.startsWith("--") &&
      arguments_[index - 1] !== "--historical-snapshot",
  );
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

const arguments_ = process.argv.slice(2);
const projectRoot = await projectRootFromArguments(arguments_);
const historicalIndex = arguments_.indexOf("--historical-snapshot");
const historicalPath =
  historicalIndex >= 0 ? arguments_[historicalIndex + 1] : undefined;
const service = new DogfoodingService(projectRoot);
const result =
  historicalPath === undefined
    ? await service.importAndRebuild()
    : await service.rebuildHistoricalSnapshot(
        JSON.parse(
          await readFile(resolve(projectRoot, historicalPath), "utf8"),
        ) as DogfoodingHistoricalSnapshot,
      );
if (!result.ok) {
  console.error(JSON.stringify({ ok: false, error: result.error }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, value: result.value }, null, 2));
}
