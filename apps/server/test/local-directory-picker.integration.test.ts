import { strict as assert } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { buildApp } from "../src/app.js";
import {
  isLoopbackAddress,
  LocalDirectoryPickerService,
} from "../src/infrastructure/initialization/local-directory-picker.js";

test("Windows directory picker returns an existing directory without writing", async () => {
  const root = await mkdtemp(join(tmpdir(), "personal-ai-directory-picker-"));
  try {
    let command = "";
    const service = new LocalDirectoryPickerService({
      platform: "win32",
      runProcess: async (receivedCommand, args) => {
        command = `${receivedCommand} ${args.join(" ")}`;
        return { exitCode: 0, stdout: `${root}\r\n`, stderr: "" };
      },
    });

    const result = await service.select();

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error(result.error.message);
    assert.equal(result.value.projectRoot, root);
    assert.match(command, /^powershell\.exe /);
    assert.match(command, /-STA/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cancelling the directory picker returns a structured result without side effects", async () => {
  const service = new LocalDirectoryPickerService({
    platform: "win32",
    runProcess: async () => ({ exitCode: 0, stdout: "\r\n", stderr: "" }),
  });

  const result = await service.select();

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("Cancellation unexpectedly succeeded.");
  assert.equal(result.error.code, "cancelled");
});

test("picker failures and unsupported platforms remain structured", async () => {
  const failed = await new LocalDirectoryPickerService({
    platform: "win32",
    runProcess: async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "dialog unavailable",
    }),
  }).select();
  assert.equal(failed.ok, false);
  if (failed.ok) throw new Error("Picker failure unexpectedly succeeded.");
  assert.equal(failed.error.code, "picker_failed");

  const unsupported = await new LocalDirectoryPickerService({
    platform: "linux",
  }).select();
  assert.equal(unsupported.ok, false);
  if (unsupported.ok) {
    throw new Error("Unsupported platform unexpectedly succeeded.");
  }
  assert.equal(unsupported.error.code, "unsupported_platform");
});

test("directory picker route is restricted to loopback requests", async (t) => {
  assert.equal(isLoopbackAddress("127.0.0.1"), true);
  assert.equal(isLoopbackAddress("::1"), true);
  assert.equal(isLoopbackAddress("10.0.0.5"), false);

  const app = buildApp({
    localDirectoryPickerService: new LocalDirectoryPickerService({
      platform: "linux",
    }),
  });
  t.after(async () => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/projects/select-directory",
    payload: {},
    remoteAddress: "10.0.0.5",
  });
  assert.equal(response.statusCode, 403);
  assert.equal(response.json().error.code, "local_only");
});
