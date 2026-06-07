#!/usr/bin/env node

import http from "node:http";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULTS = {
  socket: null,
  map: "GWCAjs/SymbolMapping/38615/function-map.json",
  source: "/38615-symbol-map/Gw.jspi.named.wasm",
  target: "/38615/Gw.jspi.wasm",
  concurrency: 2,
  apply: false,
};

const DEFAULT_NAME = /^(?:unnamed_function|FUN|func)_?\d+$/i;

function parseArguments(argv) {
  const options = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") {
      options.apply = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}`);
    }
    const key = argument.slice(2);
    if (!(key in options) || key === "apply") {
      throw new Error(`Unknown option: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}`);
    }
    options[key] = key === "concurrency" ? Number(value) : value;
    index += 1;
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
    throw new Error("--concurrency must be a positive integer");
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node GWCAjs/Tools/apply-jspi-symbols-ghidra.mjs [options]

Options:
  --apply                 Perform renames; otherwise report a dry run
  --socket PATH           Ghidra MCP Unix socket
  --map PATH              Generated function-map.json
  --source PROGRAM        Imported named Ghidra program
  --target PROGRAM        Authoritative current Ghidra program
  --concurrency COUNT     Concurrent HTTP requests (default: 2)

Only accepted mappings whose target still has a default function name are
renamed. Existing non-default names, signatures, comments, and other metadata
are never changed.`);
}

function discoverSocket() {
  const runtimeRoot =
    process.env.XDG_RUNTIME_DIR ||
    (typeof process.getuid === "function"
      ? `/run/user/${process.getuid()}`
      : null);
  if (!runtimeRoot) {
    throw new Error("Cannot discover Ghidra socket; pass --socket PATH");
  }
  const directory = `${runtimeRoot}/ghidra-mcp`;
  const candidates = readdirSync(directory)
    .filter((name) => /^ghidra-\d+\.sock$/.test(name))
    .map((name) => {
      const path = `${directory}/${name}`;
      return { path, modified: statSync(path).mtimeMs };
    })
    .sort((left, right) => right.modified - left.modified);
  if (candidates.length === 0) {
    throw new Error(`No Ghidra MCP socket found in ${directory}`);
  }
  return candidates[0].path;
}

function request(socketPath, method, path, body = null, timeout = 120_000) {
  return new Promise((resolveRequest, rejectRequest) => {
    const encoded = body === null ? null : Buffer.from(JSON.stringify(body));
    const req = http.request(
      {
        socketPath,
        method,
        path,
        headers:
          encoded === null
            ? {}
            : {
                "Content-Type": "application/json",
                "Content-Length": encoded.length,
              },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let parsed;
          try {
            parsed = JSON.parse(text);
          } catch {
            rejectRequest(
              new Error(`Invalid JSON from ${path}: ${text.slice(0, 300)}`)
            );
            return;
          }
          if (
            response.statusCode === undefined ||
            response.statusCode < 200 ||
            response.statusCode >= 300 ||
            parsed.error
          ) {
            rejectRequest(
              new Error(
                `Ghidra request failed (${response.statusCode}): ${
                  parsed.error || text
                }`
              )
            );
            return;
          }
          resolveRequest(parsed);
        });
      }
    );
    req.setTimeout(timeout, () => {
      req.destroy(new Error(`Timed out after ${timeout}ms: ${path}`));
    });
    req.on("error", rejectRequest);
    if (encoded !== null) {
      req.write(encoded);
    }
    req.end();
  });
}

async function getFunctions(options, program) {
  const query = new URLSearchParams({
    program,
    offset: "0",
    limit: "50000",
  });
  const result = await request(
    options.socket,
    "GET",
    `/list_functions_enhanced?${query}`
  );
  return result.functions;
}

function indexByAddress(functions) {
  return new Map(functions.map((func) => [func.address_full, func]));
}

async function renameFunction(options, entry) {
  const query = new URLSearchParams({ program: options.target });
  const jsonBody = JSON.stringify({
    target_address: entry.address,
    function_name: entry.name,
  });
  const result = await request(
    options.socket,
    "POST",
    `/apply_function_documentation?${query}`,
    { json_body: jsonBody }
  );
  if (result.changes_applied !== 1 || result.function !== entry.name) {
    throw new Error(
      `${entry.address}: expected '${entry.name}', got ` +
        `${result.changes_applied} change(s), '${result.function}'`
    );
  }
}

async function runPool(items, concurrency, worker, onProgress) {
  let next = 0;
  let completed = 0;
  async function consume() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) {
        return;
      }
      await worker(items[index]);
      completed += 1;
      if (completed % 250 === 0 || completed === items.length) {
        onProgress(completed);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, consume)
  );
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  options.socket ||= discoverSocket();

  const ledger = JSON.parse(readFileSync(resolve(options.map), "utf8"));
  const accepted = ledger.mappings.filter(
    (mapping) => mapping.apply && mapping.currentAddress
  );

  const [sourceFunctions, targetFunctions] = await Promise.all([
    getFunctions(options, options.source),
    getFunctions(options, options.target),
  ]);
  const sourceByAddress = indexByAddress(sourceFunctions);
  const targetByAddress = indexByAddress(targetFunctions);

  const planned = [];
  const counts = {
    acceptedWithAddress: accepted.length,
    alreadyNamed: 0,
    missingFunction: 0,
    sourceDefaultNamed: 0,
    preservedExistingName: 0,
    planned: 0,
  };

  for (const mapping of accepted) {
    const source = sourceByAddress.get(mapping.currentAddress);
    const target = targetByAddress.get(mapping.currentAddress);
    if (!source || !target) {
      counts.missingFunction += 1;
      continue;
    }
    if (DEFAULT_NAME.test(source.name)) {
      counts.sourceDefaultNamed += 1;
      continue;
    }
    if (source.name === target.name) {
      counts.alreadyNamed += 1;
      continue;
    }
    if (!DEFAULT_NAME.test(target.name)) {
      counts.preservedExistingName += 1;
      continue;
    }
    planned.push({
      address: mapping.currentAddress,
      currentIndex: mapping.currentIndex,
      name: source.name,
    });
  }
  counts.planned = planned.length;

  console.log(JSON.stringify({ mode: options.apply ? "apply" : "dry-run", counts }, null, 2));
  if (!options.apply || planned.length === 0) {
    return;
  }

  const started = Date.now();
  await runPool(
    planned,
    options.concurrency,
    (entry) => renameFunction(options, entry),
    (completed) => {
      const elapsedSeconds = Math.max(1, (Date.now() - started) / 1000);
      const rate = completed / elapsedSeconds;
      console.log(
        `Applied ${completed}/${planned.length} ` +
          `(${rate.toFixed(1)} functions/sec)`
      );
    }
  );
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
