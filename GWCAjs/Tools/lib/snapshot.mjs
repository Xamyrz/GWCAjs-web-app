const ADDRESS_KEY = /(?:address(?:es)?|pointer(?:s)?|ptrs?)$/i;
const SENSITIVE_KEY =
  /(?:account|advertisement|alias|announcement|author|character|chat|email|guild.*name|leader.*name|message|name|password|player.*name|token|uuid)/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const UUID =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const TOKEN = /\b(?:eyJ[A-Za-z0-9_-]{12,}|[A-Fa-f0-9]{32,})\b/g;

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sanitizeString(key, value) {
  if (/(?:buildId|sha256)$/i.test(key)) {
    return value;
  }
  if (SENSITIVE_KEY.test(key)) {
    return "<redacted>";
  }
  return value
    .replace(EMAIL, "<redacted-email>")
    .replace(UUID, "<redacted-uuid>")
    .replace(TOKEN, "<redacted-token>");
}

export function sanitizeSnapshot(input, options = {}) {
  const maxArrayLength = options.maxArrayLength ?? 128;
  const maxDepth = options.maxDepth ?? 12;
  const maxNodes = options.maxNodes ?? 20_000;
  const pointerLabels = new Map();
  let nodeCount = 0;
  let redactedStringCount = 0;
  let truncatedCount = 0;

  function pointerLabel(value) {
    const normalized = value >>> 0;
    if (!pointerLabels.has(normalized)) {
      pointerLabels.set(normalized, `@p${pointerLabels.size + 1}`);
    }
    return pointerLabels.get(normalized);
  }

  function visit(value, key, depth) {
    nodeCount += 1;
    if (nodeCount > maxNodes) {
      truncatedCount += 1;
      return "<truncated-node-limit>";
    }
    if (depth > maxDepth) {
      truncatedCount += 1;
      return "<truncated-depth>";
    }
    if (value == null || typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      if (
        Number.isInteger(value) &&
        value > 0 &&
        value <= 0xffffffff &&
        ADDRESS_KEY.test(key)
      ) {
        return pointerLabel(value);
      }
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string") {
      if (ADDRESS_KEY.test(key) && /^0x[0-9a-f]{1,8}$/i.test(value)) {
        return pointerLabel(Number.parseInt(value.slice(2), 16));
      }
      const sanitized = sanitizeString(key, value);
      if (sanitized !== value) {
        redactedStringCount += 1;
      }
      return sanitized;
    }
    if (typeof value === "bigint") {
      return value.toString();
    }
    if (Array.isArray(value)) {
      if (value.length > maxArrayLength) {
        truncatedCount += value.length - maxArrayLength;
      }
      return value
        .slice(0, maxArrayLength)
        .map((entry) => visit(entry, key, depth + 1));
    }
    if (!isPlainObject(value)) {
      return String(value);
    }
    const output = {};
    for (const property of Object.keys(value).sort()) {
      output[property] = visit(value[property], property, depth + 1);
    }
    return output;
  }

  const data = visit(input, "root", 0);
  return {
    data,
    sanitization: {
      nodeCount,
      pointerCount: pointerLabels.size,
      redactedStringCount,
      truncatedCount,
    },
    schemaVersion: 1,
  };
}

export function getPath(value, path) {
  if (!path) {
    return value;
  }
  return path.split(".").reduce((current, segment) => {
    if (current == null) {
      return undefined;
    }
    const index = /^\d+$/.test(segment) ? Number(segment) : segment;
    return current[index];
  }, value);
}

function compareAssertion(value, assertion, stepsByName) {
  switch (assertion.op) {
    case "equals":
      return Object.is(value, assertion.expected);
    case "exists":
      return value !== undefined && value !== null;
    case "nonzero":
      return typeof value === "number" && value !== 0;
    case "type":
      return assertion.expected === "array"
        ? Array.isArray(value)
        : typeof value === assertion.expected;
    case "length":
      return value?.length === assertion.expected;
    case "includes":
      return typeof value?.includes === "function"
        ? value.includes(assertion.expected)
        : false;
    case "matches":
      return typeof value === "string"
        ? new RegExp(assertion.expected).test(value)
        : false;
    case "same-as": {
      const otherStep = stepsByName.get(assertion.step);
      return Object.is(
        value,
        getPath(otherStep?.snapshot?.data, assertion.otherPath || assertion.path)
      );
    }
    case "changed-from": {
      const otherStep = stepsByName.get(assertion.step);
      return !Object.is(
        value,
        getPath(otherStep?.snapshot?.data, assertion.otherPath || assertion.path)
      );
    }
    default:
      throw new Error(`Unsupported scenario assertion: ${assertion.op}`);
  }
}

export function runScenario(scenario) {
  if (scenario?.schemaVersion !== 1 || !Array.isArray(scenario.steps)) {
    throw new Error("Scenario must use schemaVersion 1 and contain steps.");
  }
  const stepsByName = new Map(
    scenario.steps.map((step) => [step.name, step])
  );
  const results = [];
  for (const step of scenario.steps) {
    if (!step.name || step.snapshot?.schemaVersion !== 1) {
      throw new Error("Each scenario step needs a name and sanitized snapshot.");
    }
    for (const assertion of step.assertions || []) {
      const value = getPath(step.snapshot.data, assertion.path);
      let passed = false;
      let error = null;
      try {
        passed = compareAssertion(value, assertion, stepsByName);
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
      }
      results.push({
        assertion,
        error,
        passed,
        step: step.name,
        value,
      });
    }
  }
  return {
    failed: results.filter((result) => !result.passed).length,
    passed: results.filter((result) => result.passed).length,
    results,
    scenario: scenario.name,
  };
}
