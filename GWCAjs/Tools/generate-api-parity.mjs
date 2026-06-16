#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildApiParityLedger,
  renderApiParityMarkdown,
} from "./lib/parity.mjs";

const TOOL_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TOOL_DIRECTORY, "../..");
const JSON_OUTPUT = resolve(ROOT, "GWCAjs/Generated/api-parity.json");
const MARKDOWN_OUTPUT = resolve(ROOT, "GWCAjs/Generated/API_PARITY.md");

function parseArguments(argv) {
  const options = {
    check: false,
  };
  for (const argument of argv) {
    if (argument === "--check") {
      options.check = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      console.log(`Usage:
  node GWCAjs/Tools/generate-api-parity.mjs
  node GWCAjs/Tools/generate-api-parity.mjs --check

Generate or verify the deterministic native-to-browser API parity ledger.`);
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

async function readExisting(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const ledger = await buildApiParityLedger({
    managerDirectory: resolve(ROOT, "gwca/Include/GWCA/Managers"),
    root: ROOT,
    sourceDirectory: resolve(ROOT, "GWCAjs/Source"),
  });
  const json = `${JSON.stringify(ledger, null, 2)}\n`;
  const markdown = renderApiParityMarkdown(ledger);

  if (options.check) {
    const [existingJson, existingMarkdown] = await Promise.all([
      readExisting(JSON_OUTPUT),
      readExisting(MARKDOWN_OUTPUT),
    ]);
    const stale = [];
    if (existingJson !== json) {
      stale.push("GWCAjs/Generated/api-parity.json");
    }
    if (existingMarkdown !== markdown) {
      stale.push("GWCAjs/Generated/API_PARITY.md");
    }
    if (stale.length) {
      throw new Error(
        `Generated API parity files are missing or stale: ${stale.join(", ")}`
      );
    }
    console.log(
      `API parity is current: ${ledger.totals.implemented}/${ledger.totals.nativeMethods} implemented, ${ledger.totals.adapted} adapted`
    );
    return;
  }

  await mkdir(dirname(JSON_OUTPUT), { recursive: true });
  await Promise.all([
    writeFile(JSON_OUTPUT, json),
    writeFile(MARKDOWN_OUTPUT, markdown),
  ]);
  console.log(
    `Generated API parity: ${ledger.totals.implemented}/${ledger.totals.nativeMethods} implemented, ${ledger.totals.adapted} adapted`
  );
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
