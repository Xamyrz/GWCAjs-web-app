#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  createReadStream,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { createInterface } from "node:readline";

const DEFAULTS = {
  oldDisassembly:
    "extracted/older version/analysis/Gw.jspi.disassembly.txt",
  oldDetails: "extracted/older version/analysis/Gw.jspi.details.txt",
  oldWasm: "extracted/older version/Gw.jspi.wasm",
  currentDisassembly: "extracted/38615/analysis/Gw.jspi.disassembly.txt",
  currentDetails: "extracted/38615/analysis/Gw.jspi.details.txt",
  currentWasm: "extracted/38615/Gw.jspi.wasm",
  outputDirectory: "GWCAjs/SymbolMapping/38615",
};

const DEFAULT_FUNCTION_NAME = /^(?:unnamed_function|FUN|func)_?\d+$/i;
const HASHES = ["strictHash", "callHash", "relaxedHash", "shapeHash"];

function parseArguments(argv) {
  const options = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
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
    options[key] = value;
    index += 1;
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node GWCAjs/Tools/map-jspi-symbols.mjs [options]

Options:
  --oldDisassembly PATH
  --oldDetails PATH
  --oldWasm PATH
  --currentDisassembly PATH
  --currentDetails PATH
  --currentWasm PATH
  --outputDirectory PATH

The script correlates old named JSPI functions with the current JSPI build,
writes JSON/CSV/Markdown reports, and appends a confidence-gated WebAssembly
name section to a copy of the current binary.`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseFunctionDetails(path) {
  const text = readFileSync(path, "utf8");
  const functions = new Map();
  const regex =
    /^ - func\[(\d+)\] sig=(\d+)(?: <(.+?)>)?(?: <- ([^. ]+)\.(.+))?$/gm;
  let match;
  while ((match = regex.exec(text))) {
    const index = Number(match[1]);
    functions.set(index, {
      index,
      importModule: match[4] || null,
      importName: match[5] || null,
      name: match[3] || null,
      signatureIndex: Number(match[2]),
    });
  }
  return functions;
}

function stripSymbolAnnotation(instruction) {
  return instruction.replace(/\s+<[^>]*>\s*$/, "");
}

function normalizeInstruction(instruction, mode) {
  let value = stripSymbolAnnotation(instruction.trim())
    .replace(/\s+/g, " ")
    .replace(/^([a-z0-9_.]+)\s+/, "$1 ");

  if (mode !== "strict") {
    value = value.replace(/\bcall \d+\b/, "call @");
    value = value.replace(/\bref\.func \d+\b/, "ref.func @");
  }

  if (mode === "relaxed") {
    value = value.replace(/\bi32\.const (-?\d+)\b/g, (_, raw) => {
      const number = Number(raw);
      return Math.abs(number) > 0xffff
        ? "i32.const <large>"
        : `i32.const ${raw}`;
    });
    value = value.replace(/\bi64\.const (-?\d+)\b/g, (_, raw) => {
      const number = Number(raw);
      return Math.abs(number) > 0xffff
        ? "i64.const <large>"
        : `i64.const ${raw}`;
    });
  }
  if (mode === "shape") {
    value = value
      .replace(/\bcall \d+\b/, "call @")
      .replace(/\bref\.func \d+\b/, "ref.func @")
      .replace(/-?(?:0x[0-9a-f]+|\d+)(?:\.\d+)?/gi, "@");
  }
  return value;
}

function finalizeFunction(record) {
  if (!record) {
    return null;
  }
  const strict = record.instructions
    .map((instruction) => normalizeInstruction(instruction, "strict"))
    .join("\n");
  const calls = record.instructions
    .map((instruction) => normalizeInstruction(instruction, "calls"))
    .join("\n");
  const relaxed = record.instructions
    .map((instruction) => normalizeInstruction(instruction, "relaxed"))
    .join("\n");
  const shape = record.instructions
    .map((instruction) => normalizeInstruction(instruction, "shape"))
    .join("\n");
  const opcodeCounts = Object.create(null);
  const opcodeTokens = [];
  for (const instruction of record.instructions) {
    const normalized = instruction.trim().replace(/^\s+/, "");
    const opcode = /^([a-z0-9_.]+)/i.exec(normalized)?.[1] || normalized;
    opcodeTokens.push(opcode);
    opcodeCounts[opcode] = (opcodeCounts[opcode] || 0) + 1;
  }
  const opcodeShingles = new Set();
  for (let index = 0; index + 2 < opcodeTokens.length; index += 1) {
    opcodeShingles.add(
      sha256(opcodeTokens.slice(index, index + 3).join("|")).slice(0, 12)
    );
  }
  record.instructionCount = record.instructions.length;
  record.strictHash = sha256(strict);
  record.callHash = sha256(calls);
  record.relaxedHash = sha256(relaxed);
  record.shapeHash = sha256(shape);
  record.opcodeCounts = opcodeCounts;
  record.opcodeShingles = opcodeShingles;
  delete record.instructions;
  return record;
}

async function parseDisassembly(path, details) {
  const functions = new Map();
  const input = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let current = null;

  for await (const line of lines) {
    const header = /^([0-9a-f]+) func\[(\d+)\](?: <(.*)>)?:$/.exec(line);
    if (header) {
      const finalized = finalizeFunction(current);
      if (finalized) {
        functions.set(finalized.index, finalized);
      }
      const index = Number(header[2]);
      const detail = details.get(index) || {};
      current = {
        fileOffset: Number.parseInt(header[1], 16),
        index,
        instructions: [],
        name: header[3] || detail.name || null,
        signatureIndex: detail.signatureIndex ?? null,
      };
      continue;
    }
    if (!current) {
      continue;
    }
    const instruction = /^\s*[0-9a-f]+:.*\|\s?(.*)$/.exec(line);
    if (instruction) {
      current.instructions.push(instruction[1]);
    }
  }

  const finalized = finalizeFunction(current);
  if (finalized) {
    functions.set(finalized.index, finalized);
  }
  return functions;
}

function addImports(functions, details) {
  for (const detail of details.values()) {
    if (!detail.importModule || functions.has(detail.index)) {
      continue;
    }
    const importIdentity = `${detail.importModule}.${detail.importName}`;
    functions.set(detail.index, {
      callHash: sha256(`import:${importIdentity}`),
      fileOffset: null,
      importModule: detail.importModule,
      importName: detail.importName,
      index: detail.index,
      instructionCount: 0,
      name: detail.name || detail.importName,
      opcodeCounts: {},
      opcodeShingles: new Set(),
      relaxedHash: sha256(`import:${importIdentity}`),
      shapeHash: sha256(`import:${importIdentity}`),
      signatureIndex: detail.signatureIndex,
      strictHash: sha256(`import:${importIdentity}`),
    });
  }
}

function isUsefulName(name) {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    !DEFAULT_FUNCTION_NAME.test(name)
  );
}

function addressFor(record) {
  if (!record || record.fileOffset === null) {
    return null;
  }
  return `ram:${(0x80000000 + record.fileOffset).toString(16)}`;
}

function compositeKey(record, hashField) {
  return `${record.signatureIndex}:${record[hashField]}`;
}

function indexByHash(functions, hashField, excluded = new Set()) {
  const result = new Map();
  for (const record of functions.values()) {
    if (excluded.has(record.index)) {
      continue;
    }
    const key = compositeKey(record, hashField);
    const list = result.get(key) || [];
    list.push(record);
    result.set(key, list);
  }
  return result;
}

function createMapping(oldFunction, currentFunction, method, confidence, extras = {}) {
  return {
    apply: confidence === "exact" || confidence === "high",
    confidence,
    currentAddress: addressFor(currentFunction),
    currentIndex: currentFunction.index,
    currentInstructionCount: currentFunction.instructionCount,
    currentName: currentFunction.name,
    evidence: extras.evidence || [],
    localNamesSafe: !!extras.localNamesSafe,
    method,
    oldAddress: addressFor(oldFunction),
    oldIndex: oldFunction.index,
    oldInstructionCount: oldFunction.instructionCount,
    oldName: oldFunction.name,
    signatureIndex: oldFunction.signatureIndex,
  };
}

function correlateFunctions(oldFunctions, currentFunctions) {
  const mappings = new Map();
  const usedCurrent = new Set();

  function accept(oldFunction, currentFunction, method, confidence, extras) {
    if (
      mappings.has(oldFunction.index) ||
      usedCurrent.has(currentFunction.index) ||
      oldFunction.signatureIndex !== currentFunction.signatureIndex
    ) {
      return false;
    }
    mappings.set(
      oldFunction.index,
      createMapping(oldFunction, currentFunction, method, confidence, extras)
    );
    usedCurrent.add(currentFunction.index);
    return true;
  }

  for (const oldFunction of oldFunctions.values()) {
    if (!oldFunction.importModule) {
      continue;
    }
    const currentFunction = currentFunctions.get(oldFunction.index);
    if (
      currentFunction?.importModule === oldFunction.importModule &&
      currentFunction?.importName === oldFunction.importName
    ) {
      accept(oldFunction, currentFunction, "same-import", "exact", {
        evidence: ["same import module/name/index and signature"],
        localNamesSafe: true,
      });
    }
  }

  for (const oldFunction of oldFunctions.values()) {
    if (mappings.has(oldFunction.index)) {
      continue;
    }
    const currentFunction = currentFunctions.get(oldFunction.index);
    if (
      currentFunction &&
      oldFunction.strictHash === currentFunction.strictHash &&
      oldFunction.signatureIndex === currentFunction.signatureIndex
    ) {
      accept(oldFunction, currentFunction, "same-index-strict", "exact", {
        evidence: ["same index, signature, and strict instruction body"],
        localNamesSafe: true,
      });
    }
  }

  for (const hashField of HASHES) {
    const oldIndex = indexByHash(oldFunctions, hashField, new Set(mappings.keys()));
    const currentIndex = indexByHash(currentFunctions, hashField, usedCurrent);
    for (const [key, oldMatches] of oldIndex) {
      const currentMatches = currentIndex.get(key) || [];
      if (oldMatches.length !== 1 || currentMatches.length !== 1) {
        continue;
      }
      const oldFunction = oldMatches[0];
      const currentFunction = currentMatches[0];
      const method = `unique-${hashField.replace("Hash", "")}`;
      const confidence =
        hashField === "relaxedHash" || hashField === "shapeHash"
          ? "high"
          : "exact";
      accept(oldFunction, currentFunction, method, confidence, {
        evidence: [
          `unique ${hashField} match with same signature`,
          `index delta ${currentFunction.index - oldFunction.index}`,
        ],
        localNamesSafe:
          hashField !== "relaxedHash" && hashField !== "shapeHash",
      });
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    const anchors = [...mappings.values()]
      .filter((mapping) => mapping.apply)
      .sort((left, right) => left.oldIndex - right.oldIndex);

    for (let index = 0; index + 1 < anchors.length; index += 1) {
      const left = anchors[index];
      const right = anchors[index + 1];
      const oldGap = right.oldIndex - left.oldIndex - 1;
      const currentGap = right.currentIndex - left.currentIndex - 1;
      if (oldGap <= 0 || oldGap !== currentGap) {
        continue;
      }
      for (let offset = 1; offset <= oldGap; offset += 1) {
        const oldFunction = oldFunctions.get(left.oldIndex + offset);
        const currentFunction = currentFunctions.get(left.currentIndex + offset);
        if (
          !oldFunction ||
          !currentFunction ||
          mappings.has(oldFunction.index) ||
          usedCurrent.has(currentFunction.index) ||
          oldFunction.signatureIndex !== currentFunction.signatureIndex
        ) {
          continue;
        }
        const matchingHash = HASHES.find(
          (field) => oldFunction[field] === currentFunction[field]
        );
        if (!matchingHash) {
          continue;
        }
        const confidence =
          matchingHash === "relaxedHash" || matchingHash === "shapeHash"
            ? "high"
            : "exact";
        if (
          accept(oldFunction, currentFunction, "equal-anchor-gap", confidence, {
            evidence: [
              `equal-size gap between ${left.oldIndex}/${left.currentIndex} and ${right.oldIndex}/${right.currentIndex}`,
              `${matchingHash} and signature match`,
            ],
            localNamesSafe:
              matchingHash !== "relaxedHash" && matchingHash !== "shapeHash",
          })
        ) {
          changed = true;
        }
      }
    }
  }

  const sortedAnchors = [...mappings.values()]
    .filter((mapping) => mapping.apply)
    .sort((left, right) => left.oldIndex - right.oldIndex);

  for (const oldFunction of oldFunctions.values()) {
    if (mappings.has(oldFunction.index)) {
      continue;
    }
    let previous = null;
    let next = null;
    for (const anchor of sortedAnchors) {
      if (anchor.oldIndex < oldFunction.index) {
        previous = anchor;
        continue;
      }
      next = anchor;
      break;
    }
    if (!previous || !next) {
      continue;
    }
    const previousDelta = previous.currentIndex - previous.oldIndex;
    const nextDelta = next.currentIndex - next.oldIndex;
    if (previousDelta !== nextDelta) {
      continue;
    }
    const currentFunction = currentFunctions.get(oldFunction.index + previousDelta);
    if (
      !currentFunction ||
      usedCurrent.has(currentFunction.index) ||
      oldFunction.signatureIndex !== currentFunction.signatureIndex
    ) {
      continue;
    }
    const countRatio =
      Math.min(oldFunction.instructionCount, currentFunction.instructionCount) /
      Math.max(1, oldFunction.instructionCount, currentFunction.instructionCount);
    if (countRatio < 0.9) {
      continue;
    }
    if (oldFunction.shapeHash === currentFunction.shapeHash) {
      accept(oldFunction, currentFunction, "stable-anchor-shape", "high", {
        evidence: [
          `same index delta ${previousDelta} between surrounding high-confidence anchors`,
          "same signature and normalized instruction shape",
        ],
        localNamesSafe: false,
      });
      continue;
    }
    accept(oldFunction, currentFunction, "stable-anchor-delta", "high", {
      evidence: [
        `same index delta ${previousDelta} between surrounding high-confidence anchors`,
        "equal old/current interval size, same signature, and similar instruction count",
      ],
      localNamesSafe: false,
    });
  }

  function opcodeCosine(left, right) {
    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;
    for (const count of Object.values(left.opcodeCounts)) {
      leftNorm += count * count;
    }
    for (const count of Object.values(right.opcodeCounts)) {
      rightNorm += count * count;
    }
    for (const [opcode, count] of Object.entries(left.opcodeCounts)) {
      dot += count * (right.opcodeCounts[opcode] || 0);
    }
    return dot / Math.max(1, Math.sqrt(leftNorm * rightNorm));
  }

  function shingleJaccard(left, right) {
    if (left.opcodeShingles.size === 0 && right.opcodeShingles.size === 0) {
      return 1;
    }
    let intersection = 0;
    const smaller =
      left.opcodeShingles.size <= right.opcodeShingles.size
        ? left.opcodeShingles
        : right.opcodeShingles;
    const larger = smaller === left.opcodeShingles
      ? right.opcodeShingles
      : left.opcodeShingles;
    for (const value of smaller) {
      if (larger.has(value)) {
        intersection += 1;
      }
    }
    const union =
      left.opcodeShingles.size + right.opcodeShingles.size - intersection;
    return intersection / Math.max(1, union);
  }

  function similarity(left, right) {
    if (left.signatureIndex !== right.signatureIndex) {
      return 0;
    }
    const countRatio =
      Math.min(left.instructionCount, right.instructionCount) /
      Math.max(1, left.instructionCount, right.instructionCount);
    return (
      opcodeCosine(left, right) * 0.55 +
      shingleJaccard(left, right) * 0.3 +
      countRatio * 0.15
    );
  }

  const unresolvedOld = [...oldFunctions.values()].filter(
    (record) => !mappings.has(record.index)
  );
  const unresolvedCurrent = [...currentFunctions.values()].filter(
    (record) => !usedCurrent.has(record.index)
  );
  const candidatesByOld = new Map();
  const candidatesByCurrent = new Map();

  for (const oldFunction of unresolvedOld) {
    const candidates = unresolvedCurrent
      .filter(
        (currentFunction) =>
          currentFunction.signatureIndex === oldFunction.signatureIndex
      )
      .map((currentFunction) => ({
        currentFunction,
        score: similarity(oldFunction, currentFunction),
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          Math.abs(left.currentFunction.index - oldFunction.index) -
            Math.abs(right.currentFunction.index - oldFunction.index)
      )
      .slice(0, 5);
    candidatesByOld.set(oldFunction.index, candidates);
    for (const candidate of candidates) {
      const list = candidatesByCurrent.get(candidate.currentFunction.index) || [];
      list.push({ oldFunction, score: candidate.score });
      candidatesByCurrent.set(candidate.currentFunction.index, list);
    }
  }
  for (const candidates of candidatesByCurrent.values()) {
    candidates.sort((left, right) => right.score - left.score);
  }

  const similarityPairs = [];
  for (const oldFunction of unresolvedOld) {
    const candidates = candidatesByOld.get(oldFunction.index) || [];
    const best = candidates[0];
    if (!best) {
      continue;
    }
    const secondScore = candidates[1]?.score || 0;
    const reverse = candidatesByCurrent.get(best.currentFunction.index) || [];
    const reverseBest = reverse[0];
    const reverseSecondScore = reverse[1]?.score || 0;
    const mutualBest = reverseBest?.oldFunction.index === oldFunction.index;
    const margin = Math.min(
      best.score - secondScore,
      best.score - reverseSecondScore
    );
    similarityPairs.push({
      best,
      margin,
      mutualBest,
      oldFunction,
    });
  }
  similarityPairs.sort(
    (left, right) =>
      right.best.score - left.best.score || right.margin - left.margin
  );

  for (const pair of similarityPairs) {
    const { best, margin, mutualBest, oldFunction } = pair;
    if (
      mappings.has(oldFunction.index) ||
      usedCurrent.has(best.currentFunction.index) ||
      !mutualBest
    ) {
      continue;
    }
    const accepted =
      (best.score >= 0.9 && margin >= 0.03) ||
      (best.score >= 0.82 && margin >= 0.08);
    if (!accepted) {
      continue;
    }
    accept(
      oldFunction,
      best.currentFunction,
      "mutual-opcode-similarity",
      "high",
      {
        evidence: [
          `mutual best unmatched function score ${best.score.toFixed(4)}`,
          `candidate margin ${margin.toFixed(4)}`,
          "same signature",
        ],
        localNamesSafe: false,
      }
    );
  }

  const finalAnchors = [...mappings.values()]
    .filter((mapping) => mapping.apply)
    .sort((left, right) => left.oldIndex - right.oldIndex);
  const reviewAssignments = new Map();
  const reviewUsedCurrent = new Set(usedCurrent);
  const remainingOld = [...oldFunctions.values()].filter(
    (record) => !mappings.has(record.index)
  );
  const remainingCurrent = [...currentFunctions.values()].filter(
    (record) => !usedCurrent.has(record.index)
  );
  const reviewPairs = [];

  function expectedCurrentIndex(oldIndex) {
    let previous = null;
    let next = null;
    for (const anchor of finalAnchors) {
      if (anchor.oldIndex < oldIndex) {
        previous = anchor;
        continue;
      }
      next = anchor;
      break;
    }
    if (previous && next && next.currentIndex > previous.currentIndex) {
      const fraction =
        (oldIndex - previous.oldIndex) /
        Math.max(1, next.oldIndex - previous.oldIndex);
      return (
        previous.currentIndex +
        fraction * (next.currentIndex - previous.currentIndex)
      );
    }
    if (previous) {
      return oldIndex + (previous.currentIndex - previous.oldIndex);
    }
    if (next) {
      return oldIndex + (next.currentIndex - next.oldIndex);
    }
    return oldIndex;
  }

  for (const oldFunction of remainingOld) {
    const expected = expectedCurrentIndex(oldFunction.index);
    for (const currentFunction of remainingCurrent) {
      if (oldFunction.signatureIndex !== currentFunction.signatureIndex) {
        continue;
      }
      const bodyScore = similarity(oldFunction, currentFunction);
      const distance = Math.abs(currentFunction.index - expected);
      const proximityScore = 1 / (1 + distance / 25);
      reviewPairs.push({
        bodyScore,
        currentFunction,
        expected,
        oldFunction,
        score: bodyScore * 0.9 + proximityScore * 0.1,
      });
    }
  }
  reviewPairs.sort(
    (left, right) =>
      right.score - left.score ||
      Math.abs(left.currentFunction.index - left.expected) -
        Math.abs(right.currentFunction.index - right.expected)
  );
  for (const pair of reviewPairs) {
    if (
      reviewAssignments.has(pair.oldFunction.index) ||
      reviewUsedCurrent.has(pair.currentFunction.index)
    ) {
      continue;
    }
    reviewAssignments.set(pair.oldFunction.index, pair);
    reviewUsedCurrent.add(pair.currentFunction.index);
  }

  const rows = [];
  for (const oldFunction of [...oldFunctions.values()].sort(
    (left, right) => left.index - right.index
  )) {
    const mapping = mappings.get(oldFunction.index);
    if (mapping) {
      rows.push(mapping);
      continue;
    }
    const review = reviewAssignments.get(oldFunction.index);
    rows.push({
      apply: false,
      confidence: review ? "review" : "unmapped",
      currentAddress: review ? addressFor(review.currentFunction) : null,
      currentIndex: review?.currentFunction.index ?? null,
      currentInstructionCount:
        review?.currentFunction.instructionCount ?? null,
      currentName: review?.currentFunction.name ?? null,
      evidence: review
        ? [
            `one-to-one review score ${review.score.toFixed(4)}`,
            `opcode similarity ${review.bodyScore.toFixed(4)}`,
            `anchor-predicted index ${review.expected.toFixed(2)}`,
            "same signature; manual review required",
          ]
        : [],
      localNamesSafe: false,
      method: review ? "ordered-review-candidate" : "unmapped",
      oldAddress: addressFor(oldFunction),
      oldIndex: oldFunction.index,
      oldInstructionCount: oldFunction.instructionCount,
      oldName: oldFunction.name,
      signatureIndex: oldFunction.signatureIndex,
    });
  }
  return rows;
}

function readVarUint(bytes, start) {
  let value = 0;
  let shift = 0;
  let offset = start;
  while (offset < bytes.length) {
    const byte = bytes[offset];
    offset += 1;
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return { offset, value: value >>> 0 };
    }
    shift += 7;
    if (shift > 35) {
      throw new Error("Invalid varuint32");
    }
  }
  throw new Error("Unexpected EOF in varuint32");
}

function writeVarUint(value) {
  const output = [];
  let remaining = value >>> 0;
  do {
    let byte = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining) {
      byte |= 0x80;
    }
    output.push(byte);
  } while (remaining);
  return Buffer.from(output);
}

function readName(bytes, start) {
  const length = readVarUint(bytes, start);
  const end = length.offset + length.value;
  if (end > bytes.length) {
    throw new Error("Invalid WASM name");
  }
  return {
    offset: end,
    value: bytes.subarray(length.offset, end).toString("utf8"),
  };
}

function writeName(value) {
  const encoded = Buffer.from(value, "utf8");
  return Buffer.concat([writeVarUint(encoded.length), encoded]);
}

function findCustomSection(bytes, targetName) {
  let offset = 8;
  while (offset < bytes.length) {
    const sectionStart = offset;
    const id = bytes[offset];
    offset += 1;
    const size = readVarUint(bytes, offset);
    const payloadStart = size.offset;
    const payloadEnd = payloadStart + size.value;
    if (payloadEnd > bytes.length) {
      throw new Error("Invalid WASM section size");
    }
    if (id === 0) {
      const name = readName(bytes, payloadStart);
      if (name.value === targetName) {
        return {
          payload: bytes.subarray(name.offset, payloadEnd),
          sectionEnd: payloadEnd,
          sectionStart,
        };
      }
    }
    offset = payloadEnd;
  }
  return null;
}

function parseNameMap(bytes) {
  let offset = 0;
  const count = readVarUint(bytes, offset);
  offset = count.offset;
  const entries = new Map();
  for (let index = 0; index < count.value; index += 1) {
    const itemIndex = readVarUint(bytes, offset);
    const name = readName(bytes, itemIndex.offset);
    entries.set(itemIndex.value, name.value);
    offset = name.offset;
  }
  return entries;
}

function writeNameMap(entries) {
  const sorted = [...entries.entries()].sort((left, right) => left[0] - right[0]);
  const parts = [writeVarUint(sorted.length)];
  for (const [index, name] of sorted) {
    parts.push(writeVarUint(index), writeName(name));
  }
  return Buffer.concat(parts);
}

function parseIndirectNameMap(bytes) {
  let offset = 0;
  const count = readVarUint(bytes, offset);
  offset = count.offset;
  const entries = new Map();
  for (let index = 0; index < count.value; index += 1) {
    const functionIndex = readVarUint(bytes, offset);
    offset = functionIndex.offset;
    const mapCount = readVarUint(bytes, offset);
    offset = mapCount.offset;
    const names = new Map();
    for (let item = 0; item < mapCount.value; item += 1) {
      const itemIndex = readVarUint(bytes, offset);
      const name = readName(bytes, itemIndex.offset);
      names.set(itemIndex.value, name.value);
      offset = name.offset;
    }
    entries.set(functionIndex.value, names);
  }
  return entries;
}

function writeIndirectNameMap(entries) {
  const sorted = [...entries.entries()].sort((left, right) => left[0] - right[0]);
  const parts = [writeVarUint(sorted.length)];
  for (const [functionIndex, names] of sorted) {
    parts.push(writeVarUint(functionIndex), writeNameMap(names));
  }
  return Buffer.concat(parts);
}

function parseNameSection(payload) {
  let offset = 0;
  const subsections = new Map();
  while (offset < payload.length) {
    const id = payload[offset];
    offset += 1;
    const size = readVarUint(payload, offset);
    const end = size.offset + size.value;
    if (end > payload.length) {
      throw new Error("Invalid WASM name subsection");
    }
    subsections.set(id, Buffer.from(payload.subarray(size.offset, end)));
    offset = end;
  }
  return subsections;
}

function writeSubsection(id, payload) {
  return Buffer.concat([Buffer.from([id]), writeVarUint(payload.length), payload]);
}

function buildMappedNameSection(oldWasm, mappings) {
  const oldNameSection = findCustomSection(oldWasm, "name");
  if (!oldNameSection) {
    throw new Error("Old WASM does not contain a name section");
  }
  const oldSubsections = parseNameSection(oldNameSection.payload);
  const byOldIndex = new Map(
    mappings
      .filter((mapping) => mapping.apply)
      .map((mapping) => [mapping.oldIndex, mapping])
  );
  const output = [];

  if (oldSubsections.has(0)) {
    output.push(writeSubsection(0, oldSubsections.get(0)));
  }

  const oldFunctions = parseNameMap(oldSubsections.get(1) || Buffer.from([0]));
  const newFunctions = new Map();
  for (const [oldIndex, name] of oldFunctions) {
    const mapping = byOldIndex.get(oldIndex);
    if (mapping && isUsefulName(name)) {
      newFunctions.set(mapping.currentIndex, name);
    }
  }
  output.push(writeSubsection(1, writeNameMap(newFunctions)));

  for (const subsectionId of [2, 3]) {
    if (!oldSubsections.has(subsectionId)) {
      continue;
    }
    const oldIndirect = parseIndirectNameMap(oldSubsections.get(subsectionId));
    const newIndirect = new Map();
    for (const [oldIndex, names] of oldIndirect) {
      const mapping = byOldIndex.get(oldIndex);
      if (mapping?.localNamesSafe) {
        newIndirect.set(mapping.currentIndex, names);
      }
    }
    output.push(writeSubsection(subsectionId, writeIndirectNameMap(newIndirect)));
  }

  for (const [subsectionId, payload] of oldSubsections) {
    if (subsectionId >= 4) {
      output.push(writeSubsection(subsectionId, payload));
    }
  }

  const payload = Buffer.concat([writeName("name"), ...output]);
  return {
    functionNameCount: newFunctions.size,
    section: Buffer.concat([
      Buffer.from([0]),
      writeVarUint(payload.length),
      payload,
    ]),
  };
}

function csvEscape(value) {
  if (value === null || typeof value === "undefined") {
    return "";
  }
  const text = Array.isArray(value) ? value.join("; ") : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeReports(outputDirectory, mappings, metadata) {
  mkdirSync(outputDirectory, { recursive: true });
  const buildId = basename(outputDirectory);
  const jsonPath = resolve(outputDirectory, "function-map.json");
  const csvPath = resolve(outputDirectory, "function-map.csv");
  const summaryPath = resolve(outputDirectory, "SUMMARY.md");

  writeFileSync(
    jsonPath,
    `${JSON.stringify({ metadata, mappings }, null, 2)}\n`,
    "utf8"
  );

  const columns = [
    "oldIndex",
    "currentIndex",
    "oldAddress",
    "currentAddress",
    "oldName",
    "currentName",
    "signatureIndex",
    "oldInstructionCount",
    "currentInstructionCount",
    "method",
    "confidence",
    "apply",
    "localNamesSafe",
    "evidence",
  ];
  const csv = [
    columns.join(","),
    ...mappings.map((mapping) =>
      columns.map((column) => csvEscape(mapping[column])).join(",")
    ),
  ].join("\n");
  writeFileSync(csvPath, `${csv}\n`, "utf8");

  const counts = Object.create(null);
  const methods = Object.create(null);
  for (const mapping of mappings) {
    counts[mapping.confidence] = (counts[mapping.confidence] || 0) + 1;
    methods[mapping.method] = (methods[mapping.method] || 0) + 1;
  }
  const applied = mappings.filter((mapping) => mapping.apply).length;
  const namedApplied = mappings.filter(
    (mapping) => mapping.apply && isUsefulName(mapping.oldName)
  ).length;
  const unresolved = mappings.filter((mapping) => !mapping.apply);
  const summary = `# JSPI Symbol Mapping Summary

Generated: ${new Date().toISOString()}

## Inputs

- Old: \`${metadata.oldWasm}\`
- Current: \`${metadata.currentWasm}\`
- Old SHA-256: \`${metadata.oldSha256}\`
- Current SHA-256: \`${metadata.currentSha256}\`

## Coverage

- Old functions/imports: ${mappings.length}
- Automatically accepted mappings: ${applied}
- Useful function names written: ${namedApplied}
- Review or unmapped entries: ${unresolved.length}

### Confidence

${Object.entries(counts)
  .sort()
  .map(([name, count]) => `- ${name}: ${count}`)
  .join("\n")}

### Methods

${Object.entries(methods)
  .sort((left, right) => right[1] - left[1])
  .map(([name, count]) => `- ${name}: ${count}`)
  .join("\n")}

## Outputs

- \`function-map.json\`: complete machine-readable evidence ledger
- \`function-map.csv\`: review-friendly mapping table
- \`${basename(metadata.namedWasm)}\`: current JSPI binary with accepted names

The named binary is an analysis artifact. It must not replace the live game
binary. Import it as \`/${buildId}-symbol-map/Gw.jspi.named.wasm\`, then use
\`apply-jspi-symbols-ghidra.mjs\` with the explicit map, source, and
\`/${buildId}/Gw.jspi.wasm\` target paths. Review candidates must only be
annotated until independent evidence resolves them.
`;
  writeFileSync(summaryPath, summary, "utf8");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  for (const key of Object.keys(DEFAULTS)) {
    options[key] = resolve(options[key]);
  }

  console.log("Parsing function signatures...");
  const oldDetails = parseFunctionDetails(options.oldDetails);
  const currentDetails = parseFunctionDetails(options.currentDetails);

  console.log("Streaming old disassembly...");
  const oldFunctions = await parseDisassembly(options.oldDisassembly, oldDetails);
  console.log("Streaming current disassembly...");
  const currentFunctions = await parseDisassembly(
    options.currentDisassembly,
    currentDetails
  );
  addImports(oldFunctions, oldDetails);
  addImports(currentFunctions, currentDetails);

  console.log(
    `Correlating ${oldFunctions.size} old and ${currentFunctions.size} current functions...`
  );
  const mappings = correlateFunctions(oldFunctions, currentFunctions);

  const oldWasm = readFileSync(options.oldWasm);
  const currentWasm = readFileSync(options.currentWasm);
  const nameSection = buildMappedNameSection(oldWasm, mappings);
  const namedWasm = resolve(options.outputDirectory, "Gw.jspi.named.wasm");
  mkdirSync(dirname(namedWasm), { recursive: true });
  writeFileSync(namedWasm, Buffer.concat([currentWasm, nameSection.section]));

  const metadata = {
    currentSha256: sha256(currentWasm),
    currentWasm: options.currentWasm,
    functionNameCount: nameSection.functionNameCount,
    namedSha256: sha256(readFileSync(namedWasm)),
    namedWasm,
    oldSha256: sha256(oldWasm),
    oldWasm: options.oldWasm,
  };
  writeReports(options.outputDirectory, mappings, metadata);

  const applied = mappings.filter((mapping) => mapping.apply).length;
  const review = mappings.filter(
    (mapping) => mapping.confidence === "review"
  ).length;
  const unmapped = mappings.filter(
    (mapping) => mapping.confidence === "unmapped"
  ).length;
  console.log(
    `Accepted ${applied}; review ${review}; unmapped ${unmapped}; names ${nameSection.functionNameCount}`
  );
  console.log(`Wrote ${options.outputDirectory}`);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
