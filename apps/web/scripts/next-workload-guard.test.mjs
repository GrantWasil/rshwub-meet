import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  PHASE_PRODUCTION_BUILD as BUILD,
  PHASE_DEVELOPMENT_SERVER as DEV,
  PHASE_PRODUCTION_SERVER as SERVE,
} from "next/constants.js";

const fixture = fileURLToPath(
  new URL("./next-workload-fixture.mjs", import.meta.url),
);

async function project(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "rallly-workload-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function start(t, env = {}) {
  const fixtureEnv = { ...process.env, ...env };
  if (!("NEXT_PRIVATE_BUILD_WORKER" in env))
    delete fixtureEnv.NEXT_PRIVATE_BUILD_WORKER;
  const child = fork(fixture, [], {
    env: fixtureEnv,
    detached: process.platform !== "win32",
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  let stderr = "";
  let sequence = 0;
  const pending = new Map();
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const booted = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Fixture boot timed out: ${stderr}`)),
      10_000,
    );
    pending.set("boot", { resolve, reject, timer });
  });
  child.on("message", (message) => {
    const key = message.event === "booted" ? "boot" : message.id;
    const request = pending.get(key);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(key);
    request.resolve(message);
  });
  function rejectPending(error) {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    pending.clear();
  }
  child.on("error", rejectPending);
  child.on("exit", (code, signal) => {
    rejectPending(new Error(`Fixture exited (${code ?? signal}): ${stderr}`));
  });
  function kill(signal = "SIGKILL") {
    try {
      process.kill(
        process.platform === "win32" ? child.pid : -child.pid,
        signal,
      );
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      kill();
      await exited;
    }
  });
  await booted;
  function request(command, parameters = {}) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Fixture ${command} timed out: ${stderr}`));
      }, 15_000);
      pending.set(id, { resolve, reject, timer });
      child.send({ id, command, ...parameters });
    });
  }
  return {
    acquire: (projectDir, phase, repeat = 1) =>
      request("acquire", { projectDir, phase, repeat }),
    worker: (projectDir, phase, workerFlag) =>
      request("worker", { projectDir, phase, workerFlag }),
    async stop(signal) {
      const exited = once(child, "exit");
      if (signal) kill(signal);
      else child.send({ command: "exit" });
      await exited;
    },
  };
}

function acquired(result) {
  assert.equal(result.ok, true, result.error);
}

function blocked(result) {
  assert.equal(
    result.ok,
    false,
    "Expected the existing workload to block acquisition",
  );
  assert.match(
    result.error,
    /already has a development server or production build running/,
  );
}

for (const [ownerPhase, nextPhase] of [
  [DEV, BUILD],
  [BUILD, DEV],
  [DEV, DEV],
  [BUILD, BUILD],
]) {
  test(
    `${ownerPhase} blocks another ${nextPhase}`,
    { timeout: 30_000 },
    async (t) => {
      const dir = await project(t);
      const owner = await start(t);
      const contender = await start(t);
      acquired(await owner.acquire(dir, ownerPhase));
      blocked(await contender.acquire(dir, nextPhase));
    },
  );
}

test(
  "simultaneous dev and build acquisition has exactly one winner",
  { timeout: 30_000 },
  async (t) => {
    const dir = await project(t);
    const dev = await start(t);
    const build = await start(t);
    const results = await Promise.all([
      dev.acquire(dir, DEV),
      build.acquire(dir, BUILD),
    ]);
    assert.equal(results.filter((result) => result.ok).length, 1);
    blocked(results.find((result) => !result.ok));
  },
);

test(
  "different NEXT_DIST_DIR values cannot bypass the project lock",
  { timeout: 30_000 },
  async (t) => {
    const dir = await project(t);
    const dev = await start(t, { NEXT_DIST_DIR: ".next-dev-test" });
    const build = await start(t, { NEXT_DIST_DIR: ".next-build-test" });
    acquired(await dev.acquire(dir, DEV));
    blocked(await build.acquire(dir, BUILD));
  },
);

test(
  "concurrent and repeated same-process loads reuse the lock",
  { timeout: 30_000 },
  async (t) => {
    const dir = await project(t);
    const owner = await start(t);
    acquired(await owner.acquire(dir, DEV, 8));
    acquired(await owner.acquire(dir, DEV));
    blocked(await owner.acquire(dir, BUILD));
    const contender = await start(t);
    blocked(await contender.acquire(dir, BUILD));
  },
);

test(
  "only a direct flagged build worker can reuse its build parent's lock",
  { timeout: 30_000 },
  async (t) => {
    const dir = await project(t);
    const owner = await start(t);
    acquired(await owner.acquire(dir, BUILD));
    const allowed = await owner.worker(dir, BUILD, true);
    acquired(allowed);
    acquired(allowed.worker);
    const unflagged = await owner.worker(dir, BUILD, false);
    acquired(unflagged);
    blocked(unflagged.worker);
    const unrelated = await start(t, { NEXT_PRIVATE_BUILD_WORKER: "1" });
    blocked(await unrelated.acquire(dir, BUILD));
    const afterContention = await owner.worker(dir, BUILD, true);
    acquired(afterContention);
    acquired(afterContention.worker);
  },
);

test(
  "a flagged build child cannot reuse a dev parent's lock",
  { timeout: 30_000 },
  async (t) => {
    const dir = await project(t);
    const owner = await start(t);
    acquired(await owner.acquire(dir, DEV));
    const result = await owner.worker(dir, BUILD, true);
    acquired(result);
    blocked(result.worker);
  },
);

for (const signal of [undefined, "SIGKILL"]) {
  test(
    `${signal ?? "normal exit"} releases the lock for the next process`,
    { timeout: 30_000 },
    async (t) => {
      const dir = await project(t);
      const owner = await start(t);
      const contender = await start(t);
      acquired(await owner.acquire(dir, DEV));
      blocked(await contender.acquire(dir, BUILD));
      await owner.stop(signal);
      acquired(await contender.acquire(dir, BUILD));
    },
  );
}

test(
  "different projects can run workloads simultaneously",
  { timeout: 30_000 },
  async (t) => {
    const firstDir = await project(t);
    const secondDir = await project(t);
    const dev = await start(t);
    const build = await start(t);
    acquired(await dev.acquire(firstDir, DEV));
    acquired(await build.acquire(secondDir, BUILD));
  },
);

test(
  "production runtime neither acquires nor conflicts with a workload lock",
  { timeout: 30_000 },
  async (t) => {
    const dir = await project(t);
    const runtime = await start(t);
    const dev = await start(t);
    acquired(await runtime.acquire(dir, SERVE));
    acquired(await dev.acquire(dir, DEV));
    acquired(await runtime.acquire(dir, SERVE));
  },
);
