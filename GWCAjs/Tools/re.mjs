#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  findInternalCallDefinition,
  listInternalCallDefinitions,
} from "../Evidence/InternalCalls.js";
import {
  getBuildManifest,
  listBuildManifests,
} from "../../assets/public/gw-runtime/build-manifests.js";

const TOOL_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TOOL_DIRECTORY, "../..");
const DEFAULT_MAPPING = resolve(
  ROOT,
  "GWCAjs/SymbolMapping/38615/function-map.json"
);
const DEFAULT_JSON_OUTPUT = resolve(
  ROOT,
  "GWCAjs/Evidence/internal-calls.json"
);
const DEFAULT_MARKDOWN_OUTPUT = resolve(
  ROOT,
  "GWCAjs/Evidence/INTERNAL_CALLS.md"
);
const VERIFICATION_STATES = new Set([
  "candidate",
  "mapped",
  "static-verified",
  "abi-verified",
  "static-tested",
  "live-readonly",
  "live-action",
  "rejected",
  "deprecated",
]);

function parseArguments(argv) {
  const options = {
    command: argv[0] || "help",
    json: false,
    manager: null,
    mapping: DEFAULT_MAPPING,
    query: null,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      options.command = "help";
      continue;
    }
    if (!argument.startsWith("--") && !options.query) {
      options.query = argument;
      continue;
    }
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}`);
    }
    const key = argument.slice(2);
    if (!(key in options)) {
      throw new Error(`Unknown option: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}`);
    }
    options[key] = key === "mapping" ? resolve(ROOT, value) : value;
    index += 1;
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node GWCAjs/Tools/re.mjs list [--manager NAME] [--json]
  node GWCAjs/Tools/re.mjs show QUERY [--json]
  node GWCAjs/Tools/re.mjs verify QUERY [--json]
  node GWCAjs/Tools/re.mjs audit [--json]
  node GWCAjs/Tools/re.mjs check
  node GWCAjs/Tools/re.mjs generate

QUERY may be a ledger ID, export name, function index, or exact function name.

Commands:
  list       List evidence-ledger entries
  show       Join one entry with symbol-mapping and patch-manifest evidence
  verify     Audit one entry and print its joined evidence
  audit      Check the full ledger against manifests, mappings, and source paths
  check      Audit and verify generated evidence files are current
  generate   Regenerate Evidence/internal-calls.json and INTERNAL_CALLS.md`);
}

async function loadMapping(path) {
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(await readFile(path, "utf8"));
}

function findMapping(ledger, definition) {
  return (
    ledger?.mappings?.find(
      (mapping) => mapping.currentIndex === definition.functionIndex
    ) || null
  );
}

function findManifestPatch(definition) {
  const manifest = getBuildManifest(definition.buildId);
  const patch =
    manifest?.exportPatches.find(
      (entry) => entry.name === definition.exportName
    ) || null;
  return { manifest, patch };
}

function sourcePathStatus(definition) {
  return definition.evidence.map((path) => ({
    exists: existsSync(resolve(ROOT, path)),
    path,
  }));
}

function joinDefinition(definition, mappingLedger) {
  const { manifest, patch } = findManifestPatch(definition);
  return {
    definition,
    evidencePaths: sourcePathStatus(definition),
    manifest: manifest
      ? {
          buildId: manifest.buildId,
          gameBuild: manifest.gameBuild,
          patch,
          variant: manifest.variant,
        }
      : null,
    symbolMapping: findMapping(mappingLedger, definition),
  };
}

function auditDefinition(definition, mappingLedger) {
  const errors = [];
  const warnings = [];
  const { manifest, patch } = findManifestPatch(definition);

  if (!VERIFICATION_STATES.has(definition.verification)) {
    errors.push(`unknown verification state ${definition.verification}`);
  }
  if (!Array.isArray(definition.evidence) || definition.evidence.length === 0) {
    errors.push("no evidence paths");
  }
  for (const evidence of sourcePathStatus(definition)) {
    if (!evidence.exists) {
      errors.push(`missing evidence path ${evidence.path}`);
    }
  }
  if (
    definition.rawWasmSignature &&
    !/^\([^)]*\)\s*->\s*[A-Za-z0-9]+$/.test(
      definition.rawWasmSignature
    )
  ) {
    errors.push(`invalid WASM signature ${definition.rawWasmSignature}`);
  }

  const shouldBePatched = !!definition.exportName && !definition.disabled;
  if (shouldBePatched && !manifest) {
    errors.push(`missing build manifest ${definition.buildId}`);
  }
  if (shouldBePatched && !patch) {
    errors.push(`missing export patch ${definition.exportName}`);
  }
  if (patch) {
    if (patch.functionIndex !== definition.functionIndex) {
      errors.push(
        `manifest index ${patch.functionIndex} != ledger index ${definition.functionIndex}`
      );
    }
    if (patch.typeIndex !== definition.typeIndex) {
      errors.push(
        `manifest type ${patch.typeIndex} != ledger type ${definition.typeIndex}`
      );
    }
    if (patch.verification !== definition.verification) {
      warnings.push(
        `manifest verification ${patch.verification} != ledger verification ${definition.verification}`
      );
    }
  }

  if (Number.isInteger(definition.functionIndex)) {
    const mapping = findMapping(mappingLedger, definition);
    if (!mapping) {
      errors.push(`function ${definition.functionIndex} is absent from symbol mapping`);
    } else if (
      definition.functionName &&
      mapping.oldName &&
      mapping.oldName !== definition.functionName
    ) {
      warnings.push(`mapped old name differs: ${mapping.oldName}`);
    }
  }
  return {
    errors,
    id: definition.id,
    ok: errors.length === 0,
    warnings,
  };
}

function auditAll(definitions, mappingLedger) {
  const entries = definitions.map((definition) =>
    auditDefinition(definition, mappingLedger)
  );
  const manifestOnlyPatches = [];
  for (const manifest of listBuildManifests()) {
    for (const patch of manifest.exportPatches) {
      const matched = definitions.some(
        (definition) =>
          definition.buildId === manifest.buildId &&
          definition.exportName === patch.name &&
          definition.functionIndex === patch.functionIndex
      );
      if (!matched) {
        manifestOnlyPatches.push({
          buildId: manifest.buildId,
          exportName: patch.name,
          functionIndex: patch.functionIndex,
        });
      }
    }
  }
  return {
    entries,
    errorCount:
      entries.reduce((total, entry) => total + entry.errors.length, 0) +
      manifestOnlyPatches.length,
    manifestOnlyPatches,
    ok:
      entries.every((entry) => entry.ok) &&
      manifestOnlyPatches.length === 0,
    warningCount: entries.reduce(
      (total, entry) => total + entry.warnings.length,
      0
    ),
  };
}

function printJoined(joined) {
  const { definition, manifest, symbolMapping } = joined;
  console.log(`${definition.id}`);
  console.log(`  verification: ${definition.verification}`);
  console.log(`  export: ${definition.exportName || "-"}`);
  console.log(`  function: ${definition.functionIndex ?? "-"} ${definition.functionName || ""}`);
  console.log(`  address: ${definition.address || "-"}`);
  console.log(`  ABI: ${definition.rawWasmSignature || "-"}`);
  console.log(
    `  patch: ${
      manifest?.patch
        ? `${manifest.variant} index=${manifest.patch.functionIndex} type=${manifest.patch.typeIndex}`
        : "-"
    }`
  );
  console.log(
    `  mapping: ${
      symbolMapping
        ? `${symbolMapping.confidence}/${symbolMapping.method} old=${symbolMapping.oldName || "-"}`
        : "-"
    }`
  );
  console.log(
    `  evidence: ${joined.evidencePaths
      .map((entry) => `${entry.exists ? "ok" : "missing"}:${entry.path}`)
      .join(", ")}`
  );
}

function markdownFor(definitions, audit) {
  const rows = definitions
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((definition) => {
      const status = audit.entries.find((entry) => entry.id === definition.id);
      return `| \`${definition.id}\` | \`${definition.verification}\` | \`${definition.functionIndex ?? "-"}\` | \`${definition.exportName || "-"}\` | \`${definition.rawWasmSignature || "-"}\` | ${status?.ok ? "yes" : "no"} |`;
    });
  return `# Internal Call Evidence

Generated by \`node GWCAjs/Tools/re.mjs generate\`.

Build ID: \`${definitions[0]?.buildId || "-"}\`

| ID | Verification | Function | Export | WASM ABI | Audit |
| --- | --- | ---: | --- | --- | --- |
${rows.join("\n")}

Audit errors: ${audit.errorCount}

Audit warnings: ${audit.warningCount}
`;
}

async function generate(definitions, mappingLedger) {
  const audit = auditAll(definitions, mappingLedger);
  const json = `${JSON.stringify({
    audit: {
      errorCount: audit.errorCount,
      ok: audit.ok,
      warningCount: audit.warningCount,
    },
    schemaVersion: 1,
    entries: definitions,
  }, null, 2)}\n`;
  const markdown = markdownFor(definitions, audit);
  await mkdir(dirname(DEFAULT_JSON_OUTPUT), { recursive: true });
  await writeFile(DEFAULT_JSON_OUTPUT, json);
  await writeFile(DEFAULT_MARKDOWN_OUTPUT, markdown);
  console.log(
    `Generated ${relative(ROOT, DEFAULT_JSON_OUTPUT)} and ${relative(ROOT, DEFAULT_MARKDOWN_OUTPUT)}`
  );
  if (!audit.ok) {
    process.exitCode = 1;
  }
}

async function checkGenerated(definitions, mappingLedger) {
  const audit = auditAll(definitions, mappingLedger);
  const expectedJson = `${JSON.stringify({
    audit: {
      errorCount: audit.errorCount,
      ok: audit.ok,
      warningCount: audit.warningCount,
    },
    schemaVersion: 1,
    entries: definitions,
  }, null, 2)}\n`;
  const expectedMarkdown = markdownFor(definitions, audit);
  const stale = [];
  for (const [path, expected] of [
    [DEFAULT_JSON_OUTPUT, expectedJson],
    [DEFAULT_MARKDOWN_OUTPUT, expectedMarkdown],
  ]) {
    let actual = null;
    try {
      actual = await readFile(path, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
    if (actual !== expected) {
      stale.push(relative(ROOT, path));
    }
  }
  if (stale.length) {
    console.log(`Stale generated evidence: ${stale.join(", ")}`);
  }
  console.log(
    `Evidence check: ${audit.ok && stale.length === 0 ? "PASS" : "FAIL"} (${audit.errorCount} errors, ${audit.warningCount} warnings, ${stale.length} stale files)`
  );
  if (!audit.ok || stale.length) {
    process.exitCode = 1;
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.command === "help") {
    printHelp();
    return;
  }
  const definitions = listInternalCallDefinitions();
  const mappingLedger = await loadMapping(options.mapping);

  if (options.command === "list") {
    const filtered = options.manager
      ? definitions.filter(
          (definition) =>
            definition.manager.toLowerCase() === options.manager.toLowerCase()
        )
      : definitions;
    if (options.json) {
      console.log(JSON.stringify(filtered, null, 2));
    } else {
      for (const definition of filtered) {
        console.log(
          `${definition.id.padEnd(36)} ${definition.verification.padEnd(15)} ${String(definition.functionIndex ?? "-").padStart(5)} ${definition.exportName || "-"}`
        );
      }
    }
    return;
  }

  if (options.command === "audit") {
    const audit = auditAll(definitions, mappingLedger);
    if (options.json) {
      console.log(JSON.stringify(audit, null, 2));
    } else {
      for (const entry of audit.entries) {
        for (const error of entry.errors) {
          console.log(`ERROR ${entry.id}: ${error}`);
        }
        for (const warning of entry.warnings) {
          console.log(`WARN  ${entry.id}: ${warning}`);
        }
      }
      for (const patch of audit.manifestOnlyPatches) {
        console.log(
          `ERROR manifest-only patch ${patch.exportName} at ${patch.functionIndex}`
        );
      }
      console.log(
        `Audit: ${audit.ok ? "PASS" : "FAIL"} (${audit.errorCount} errors, ${audit.warningCount} warnings)`
      );
    }
    if (!audit.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (options.command === "generate") {
    await generate(definitions, mappingLedger);
    return;
  }

  if (options.command === "check") {
    await checkGenerated(definitions, mappingLedger);
    return;
  }

  if (options.command === "show" || options.command === "verify") {
    const definition = findInternalCallDefinition(options.query);
    if (!definition) {
      throw new Error(`Evidence entry not found: ${options.query || "-"}`);
    }
    const joined = joinDefinition(definition, mappingLedger);
    const audit = auditDefinition(definition, mappingLedger);
    const result = { ...joined, audit };
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printJoined(joined);
      if (options.command === "verify") {
        for (const error of audit.errors) {
          console.log(`  ERROR: ${error}`);
        }
        for (const warning of audit.warnings) {
          console.log(`  WARN: ${warning}`);
        }
        console.log(`  audit: ${audit.ok ? "PASS" : "FAIL"}`);
      }
    }
    if (options.command === "verify" && !audit.ok) {
      process.exitCode = 1;
    }
    return;
  }

  throw new Error(`Unknown command: ${options.command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
