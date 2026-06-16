#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runScenario } from "./lib/snapshot.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DEFAULT_DIRECTORY = resolve(ROOT, "GWCAjs/Fixtures/Scenarios");

async function scenarioPaths(arguments_) {
  if (arguments_.length > 0) {
    return arguments_.map((path) => resolve(ROOT, path));
  }
  const entries = await readdir(DEFAULT_DIRECTORY, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => resolve(DEFAULT_DIRECTORY, entry.name))
    .sort();
}

async function main() {
  const paths = await scenarioPaths(process.argv.slice(2));
  let failureCount = 0;
  for (const path of paths) {
    const scenario = JSON.parse(await readFile(path, "utf8"));
    const result = runScenario(scenario);
    failureCount += result.failed;
    console.log(
      `${result.failed === 0 ? "PASS" : "FAIL"} ${result.scenario}: ${result.passed} passed, ${result.failed} failed`
    );
    for (const failure of result.results.filter((entry) => !entry.passed)) {
      console.log(
        `  ${failure.step} ${failure.assertion.path} ${failure.assertion.op}: ${failure.error || JSON.stringify(failure.value)}`
      );
    }
  }
  if (failureCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
