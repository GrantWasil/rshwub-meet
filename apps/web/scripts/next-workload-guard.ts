import { mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from "next/constants.js";
import { Lockfile, readLockfileContent } from "next/dist/build/lockfile.js";
import { loadBindings } from "next/dist/build/swc/index.js";

type Workload = {
  phase: string;
  lock: Promise<Lockfile | undefined>;
};

// Next can reload configuration in the same process. Retain the native handle
// across those loads, including while another load is still acquiring it.
const state = globalThis as typeof globalThis & {
  __ralllyNextWorkloads?: Map<string, Workload>;
};

function conflict(): Error {
  return new Error(
    "Rallly already has a development server or production build running. " +
      "Stop the dev server before building, or wait for the build to finish " +
      "before starting dev. Separate NEXT_DIST_DIR values do not permit overlap.",
  );
}

async function acquire(projectDir: string, phase: string) {
  // This uses the native lock API shipped with our pinned Next.js version.
  // Recheck this integration when upgrading Next. WASM supplies a dummy lock.
  const bindings = await loadBindings();
  if (bindings.isWasm) {
    throw new Error(
      "Rallly's dev/build guard requires native Next.js bindings.",
    );
  }

  const directory = path.join(projectDir, "node_modules/.cache/rallly");
  mkdirSync(directory, { recursive: true });
  const filename = path.join(directory, "next-workload.lock");
  const lock = Lockfile.tryAcquire(
    filename,
    false,
    JSON.stringify({ pid: process.pid, phase }),
  );
  if (lock) return lock;

  // Webpack's direct build worker reloads next.config. Only that child may
  // share its parent's existing lock; an independently launched CLI cannot.
  if (
    phase === PHASE_PRODUCTION_BUILD &&
    process.env.NEXT_PRIVATE_BUILD_WORKER === "1"
  ) {
    try {
      const owner = JSON.parse(readLockfileContent(filename) ?? "null");
      if (owner?.pid === process.ppid && owner.phase === phase)
        return undefined;
    } catch {
      // Unreadable ownership metadata must not disable mutual exclusion.
    }
  }
  throw conflict();
}

export async function guardNextWorkload(projectDir: string, phase: string) {
  if (phase !== PHASE_DEVELOPMENT_SERVER && phase !== PHASE_PRODUCTION_BUILD) {
    return;
  }

  const canonicalDir = realpathSync(projectDir);
  state.__ralllyNextWorkloads ??= new Map();
  const workloads = state.__ralllyNextWorkloads;
  let workload = workloads.get(canonicalDir);
  if (workload && workload.phase !== phase) throw conflict();
  if (!workload) {
    workload = { phase, lock: acquire(canonicalDir, phase) };
    workloads.set(canonicalDir, workload);
  }
  try {
    await workload.lock;
  } catch (error) {
    if (workloads.get(canonicalDir) === workload)
      workloads.delete(canonicalDir);
    throw error;
  }
  // Do not unlink or manually unlock the file. The OS releases the advisory
  // lock on exit (including SIGKILL), so crashes leave no stale owned lock.
}
