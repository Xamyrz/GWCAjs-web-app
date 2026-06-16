#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { sanitizeSnapshot } from "./lib/snapshot.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DEFAULTS = {
  debugPort: 9223,
  initialize: false,
  name: "live-snapshot",
  output: "GWCAjs/Fixtures/Scenarios/live-snapshot.json",
  step: "captured",
  timeoutMs: 10_000,
  url: "http://127.0.0.1:8000/",
};

function parseArguments(argv) {
  const options = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (argument === "--initialize") {
      options.initialize = true;
      continue;
    }
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}`);
    }
    const key = argument.slice(2);
    if (!(key in options) || key === "initialize") {
      throw new Error(`Unknown option: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}`);
    }
    options[key] =
      key === "debugPort" || key === "timeoutMs" ? Number(value) : value;
    index += 1;
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node GWCAjs/Tools/capture-snapshot-live.mjs [options]

Options:
  --debugPort PORT   Chromium debugging port (default: 9223)
  --url URL          Page URL prefix
  --initialize       Run GWCAjs.initialize() before capture
  --name NAME        Scenario name
  --step NAME        Captured step name
  --output PATH      Sanitized scenario output path
  --timeoutMs MS     CDP evaluation timeout

Only sanitized, pointer-rebased data is written to disk.`);
}

async function openSocket(url) {
  const socket = new WebSocket(url);
  await new Promise((resolveOpen, reject) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return socket;
}

function createSession(socket, timeoutMs) {
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) {
      return;
    }
    pending.delete(message.id);
    clearTimeout(request.timeout);
    if (message.error) {
      request.reject(new Error(JSON.stringify(message.error)));
    } else {
      request.resolve(message.result);
    }
  });
  return {
    send(method, params = {}) {
      return new Promise((resolveRequest, reject) => {
        id += 1;
        const requestId = id;
        const timeout = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error(`Timed out during ${method}`));
        }, timeoutMs);
        pending.set(requestId, {
          reject,
          resolve: resolveRequest,
          timeout,
        });
        socket.send(JSON.stringify({ id: requestId, method, params }));
      });
    },
  };
}

async function findTarget(options) {
  const response = await fetch(
    `http://127.0.0.1:${options.debugPort}/json/list`
  );
  if (!response.ok) {
    throw new Error(`Failed to query Chromium targets: ${response.status}`);
  }
  const targets = await response.json();
  const target = targets.find(
    (entry) =>
      entry.type === "page" &&
      typeof entry.url === "string" &&
      entry.url.startsWith(options.url)
  );
  if (!target) {
    throw new Error(`Page target not found for ${options.url}`);
  }
  return target;
}

function captureExpression(initialize) {
  return `(${async function collect(shouldInitialize) {
    if (!globalThis.GWCAjs) {
      throw new Error("GWCAjs is unavailable");
    }
    if (shouldInitialize) {
      await globalThis.GWCAjs.initialize();
    }
    const manager = (name) => {
      const value = globalThis.GWCAjs[name];
      return value?.Describe ? value.Describe() : null;
    };
    return {
      build: globalThis.GWHook?.getBuildInfo?.() || null,
      gwca: globalThis.GWCAjs.getState(),
      managers: {
        context: manager("Context"),
        guild: manager("Guild"),
        map: manager("Map"),
        party: manager("Party"),
        player: manager("Player"),
      },
    };
  }})(${JSON.stringify(initialize)})`;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const target = await findTarget(options);
  const socket = await openSocket(target.webSocketDebuggerUrl);
  try {
    const session = createSession(socket, options.timeoutMs);
    const response = await session.send("Runtime.evaluate", {
      awaitPromise: true,
      expression: captureExpression(options.initialize),
      returnByValue: true,
    });
    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description ||
          response.exceptionDetails.text
      );
    }
    const snapshot = sanitizeSnapshot(response.result?.value);
    const scenario = {
      capturedAt: new Date().toISOString(),
      name: options.name,
      schemaVersion: 1,
      steps: [
        {
          assertions: [
            { op: "exists", path: "build.wasmBuildId" },
            { expected: "boolean", op: "type", path: "gwca.initialized" },
          ],
          name: options.step,
          snapshot,
        },
      ],
    };
    const output = resolve(ROOT, options.output);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(scenario, null, 2)}\n`);
    console.log(
      `Wrote sanitized scenario ${options.output} (${snapshot.sanitization.pointerCount} pointers, ${snapshot.sanitization.redactedStringCount} redacted strings)`
    );
  } finally {
    socket.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
