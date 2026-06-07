#!/usr/bin/env node

import http from "node:http";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULTS = {
  socket: null,
  map: "GWCAjs/SymbolMapping/38615/function-map.json",
  target: "/38615/Gw.jspi.wasm",
  concurrency: 3,
  apply: false,
};

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
  node GWCAjs/Tools/annotate-jspi-review-candidates.mjs [options]

Options:
  --apply                 Write review plate comments; otherwise dry-run
  --socket PATH           Ghidra MCP Unix socket
  --map PATH              Generated function-map.json
  --target PROGRAM        Authoritative current Ghidra program
  --concurrency COUNT     Concurrent HTTP requests (default: 3)

Review candidates are never renamed. The script only fills an empty function
plate comment and preserves every existing comment.`);
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

async function getDocumentation(options, address) {
  const query = new URLSearchParams({
    program: options.target,
    address,
  });
  return request(
    options.socket,
    "GET",
    `/get_function_documentation?${query}`
  );
}

function buildComment(mapping) {
  return [
    "GWCAjs old/current symbol-map review candidate.",
    `Old: func[${mapping.oldIndex}] ${mapping.oldName}`,
    `Candidate: current func[${mapping.currentIndex}]`,
    `Evidence: ${mapping.evidence.join("; ")}`,
    "Ambiguous duplicate-body match; verify before renaming.",
  ].join("\n");
}

async function setPlateComment(options, address, comment) {
  const query = new URLSearchParams({ program: options.target });
  const result = await request(
    options.socket,
    "POST",
    `/set_plate_comment?${query}`,
    { address, comment }
  );
  if (result.success === false || result.status === "rejected") {
    throw new Error(`${address}: ${JSON.stringify(result)}`);
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
      if (completed % 50 === 0 || completed === items.length) {
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
  const candidates = ledger.mappings.filter(
    (mapping) =>
      mapping.confidence === "review" &&
      mapping.currentAddress &&
      mapping.oldName
  );
  const planned = [];
  let alreadyAnnotated = 0;
  let preservedExistingComment = 0;

  await runPool(
    candidates,
    options.concurrency,
    async (mapping) => {
      const documentation = await getDocumentation(
        options,
        mapping.currentAddress
      );
      const existing = documentation.plate_comment || "";
      if (existing.startsWith("GWCAjs old/current symbol-map review candidate.")) {
        alreadyAnnotated += 1;
      } else if (existing) {
        preservedExistingComment += 1;
      } else {
        planned.push(mapping);
      }
    },
    (completed) => console.log(`Audited ${completed}/${candidates.length}`)
  );

  console.log(
    JSON.stringify(
      {
        mode: options.apply ? "apply" : "dry-run",
        candidates: candidates.length,
        alreadyAnnotated,
        preservedExistingComment,
        planned: planned.length,
      },
      null,
      2
    )
  );

  if (!options.apply || planned.length === 0) {
    return;
  }

  await runPool(
    planned,
    options.concurrency,
    (mapping) =>
      setPlateComment(
        options,
        mapping.currentAddress,
        buildComment(mapping)
      ),
    (completed) => console.log(`Annotated ${completed}/${planned.length}`)
  );
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
