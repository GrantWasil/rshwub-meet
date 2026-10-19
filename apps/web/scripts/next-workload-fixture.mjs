import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { guardNextWorkload } from "./next-workload-guard.ts";

const workers = new Set();

function reply(id, result) {
  process.send?.({ id, ...result });
}

async function startWorker(message) {
  const env = { ...process.env };
  delete env.NEXT_PRIVATE_BUILD_WORKER;
  if (message.workerFlag) env.NEXT_PRIVATE_BUILD_WORKER = "1";
  const worker = fork(fileURLToPath(import.meta.url), [], {
    env,
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  workers.add(worker);
  worker.once("exit", () => workers.delete(worker));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      worker.kill("SIGKILL");
      reject(new Error("Worker fixture timed out"));
    }, 10_000);
    let stderr = "";
    worker.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    worker.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    worker.once("exit", (code, signal) => {
      clearTimeout(timeout);
      reject(new Error(`Worker exited (${code ?? signal}): ${stderr}`));
    });
    worker.on("message", (result) => {
      if (result.event === "booted") {
        worker.send({
          id: 1,
          command: "acquire",
          projectDir: message.projectDir,
          phase: message.phase,
        });
      } else if (result.id === 1) {
        clearTimeout(timeout);
        resolve({ worker: result });
        if (!result.ok) worker.kill();
      }
    });
  });
}

process.on("message", async (message) => {
  try {
    if (message.command === "exit") {
      for (const worker of workers) worker.kill("SIGKILL");
      process.exit(0);
    }
    if (message.command === "worker") {
      reply(message.id, { ok: true, ...(await startWorker(message)) });
      return;
    }
    if (message.command !== "acquire") throw new Error("Unknown command");
    await Promise.all(
      Array.from({ length: message.repeat ?? 1 }, () =>
        guardNextWorkload(message.projectDir, message.phase),
      ),
    );
    reply(message.id, { ok: true, pid: process.pid });
  } catch (error) {
    reply(message.id, { ok: false, error: String(error) });
  }
});

process.on("disconnect", () => {
  for (const worker of workers) worker.kill("SIGKILL");
  process.exit(0);
});
process.send?.({ event: "booted" });
