import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const EXTRA_NATIVE_APIS = Object.freeze({
  AgentMgr: Object.freeze([
    "inline Agent *GetObservingAgent()",
    "inline Agent *GetTarget()",
    "bool InteractAgent(const Agent* agent, bool call_target = false)",
  ]),
  GameThreadMgr: Object.freeze([
    "void Enqueue(std::function<void ()> f)",
  ]),
  GuildMgr: Object.freeze([
    "Guild* GetPlayerGuild()",
  ]),
  MapMgr: Object.freeze([
    "inline AreaInfo *GetCurrentMapInfo()",
  ]),
  MemoryMgr: Object.freeze([
    "static uint32_t GetGWVersion()",
    "static bool Scan()",
    "static DWORD GetSkillTimer()",
    "static HWND GetGWWindowHandle()",
    "static void* MemAlloc(size_t size)",
    "static void* MemRealloc(void* buf, size_t newSize)",
    "static void MemFree(void* buf)",
  ]),
  SkillbarMgr: Object.freeze([
    "void RegisterUseSkillCallback(HookEntry* entry, const UseSkillCallback& callback)",
    "void RemoveUseSkillCallback(HookEntry* entry)",
  ]),
});

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, " ");
}

function normalizeDeclaration(declaration) {
  return declaration
    .replace(/\bGWCA_API(?:_C)?\b/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,;)])/g, "$1")
    .replace(/([(,])\s+/g, "$1")
    .trim()
    .replace(/;$/, "");
}

function getFunctionName(declaration) {
  return declaration.match(/([A-Za-z_]\w*)\s*\(/)?.[1] || null;
}

export function parseNativeHeader(source, manager) {
  const stripped = stripComments(source);
  const declarations = [];
  const declarationPattern = /\bGWCA_API(?:_C)?\b[\s\S]*?;/g;
  for (const match of stripped.matchAll(declarationPattern)) {
    const signature = normalizeDeclaration(match[0]);
    const name = getFunctionName(signature);
    if (name) {
      declarations.push({
        exported: true,
        name,
        signature,
      });
    }
  }
  for (const signature of EXTRA_NATIVE_APIS[manager] || []) {
    declarations.push({
      exported: false,
      name: getFunctionName(signature),
      signature: normalizeDeclaration(signature),
    });
  }

  const methods = new Map();
  for (const declaration of declarations) {
    if (!declaration.name) {
      continue;
    }
    const current = methods.get(declaration.name) || {
      exported: false,
      name: declaration.name,
      signatures: [],
    };
    current.exported ||= declaration.exported;
    if (!current.signatures.includes(declaration.signature)) {
      current.signatures.push(declaration.signature);
    }
    methods.set(declaration.name, current);
  }
  return [...methods.values()].sort((left, right) =>
    left.name.localeCompare(right.name)
  );
}

export function parseBrowserManager(source) {
  const methods = new Map();
  const entryPattern = /^    ([A-Z][A-Za-z0-9_]*)(\s*\(|\s*:)(.*)$/gm;
  for (const match of source.matchAll(entryPattern)) {
    const name = match[1];
    const expression = `${match[2]}${match[3]}`.trim();
    methods.set(name, {
      expression,
      name,
      unavailable: /\bunsupported\b/.test(expression),
    });
  }
  return [...methods.values()].sort((left, right) =>
    left.name.localeCompare(right.name)
  );
}

export function buildManagerParity({
  browserMethods,
  headerPath,
  manager,
  nativeMethods,
  sourcePath,
}) {
  const browserByName = new Map(
    browserMethods.map((method) => [method.name, method])
  );
  const nativeNames = new Set(nativeMethods.map((method) => method.name));
  const methods = nativeMethods.map((nativeMethod) => {
    const browserMethod = browserByName.get(nativeMethod.name) || null;
    let state = "not-started";
    let adaptation = null;
    if (browserMethod?.unavailable) {
      state = "adapted";
      adaptation = "explicit-unavailable";
    } else if (browserMethod) {
      state = "implemented";
      adaptation = "exact-name";
    }
    return {
      adaptation,
      browserExpression: browserMethod?.expression || null,
      name: nativeMethod.name,
      nativeExported: nativeMethod.exported,
      nativeSignatures: nativeMethod.signatures,
      state,
    };
  });
  const browserOnly = browserMethods
    .filter((method) => !nativeNames.has(method.name))
    .map((method) => ({
      expression: method.expression,
      name: method.name,
    }));
  const counts = {
    adapted: methods.filter((method) => method.state === "adapted").length,
    browserOnly: browserOnly.length,
    implemented: methods.filter((method) => method.state === "implemented")
      .length,
    nativeMethods: methods.length,
    notStarted: methods.filter((method) => method.state === "not-started")
      .length,
  };
  return {
    browserOnly,
    counts,
    headerPath,
    manager,
    methods,
    sourcePath,
  };
}

export async function buildApiParityLedger({
  managerDirectory,
  root,
  sourceDirectory,
}) {
  const managerNames = [
    "AgentMgr",
    "CameraMgr",
    "ChatMgr",
    "EffectMgr",
    "EventMgr",
    "FriendListMgr",
    "GameThreadMgr",
    "GuildMgr",
    "ItemMgr",
    "MapMgr",
    "MemoryMgr",
    "MerchantMgr",
    "PartyMgr",
    "PlayerMgr",
    "QuestMgr",
    "RenderMgr",
    "SkillbarMgr",
    "StoCMgr",
    "TradeMgr",
    "UIMgr",
  ];
  const managers = [];
  for (const manager of managerNames) {
    const headerFile = resolve(managerDirectory, `${manager}.h`);
    const sourceFile = resolve(sourceDirectory, `${manager}.js`);
    const [headerSource, browserSource] = await Promise.all([
      readFile(headerFile, "utf8"),
      readFile(sourceFile, "utf8"),
    ]);
    managers.push(
      buildManagerParity({
        browserMethods: parseBrowserManager(browserSource),
        headerPath: headerFile.slice(resolve(root).length + 1),
        manager,
        nativeMethods: parseNativeHeader(headerSource, manager),
        sourcePath: sourceFile.slice(resolve(root).length + 1),
      })
    );
  }

  const totals = managers.reduce(
    (result, manager) => {
      for (const key of Object.keys(result)) {
        result[key] += manager.counts[key];
      }
      return result;
    },
    {
      adapted: 0,
      browserOnly: 0,
      implemented: 0,
      nativeMethods: 0,
      notStarted: 0,
    }
  );
  return {
    managers,
    schemaVersion: 1,
    scope: {
      browser:
        "Top-level capitalized entries in each GWCAjs manager API object.",
      native:
        "Unique GWCA_API declarations plus a conservative allowlist of public inline or non-exported manager helpers.",
      verification:
        "Representation only. Static and live proof are tracked in the evidence ledger.",
    },
    totals,
  };
}

function escapeTable(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("|", "&#124;");
}

export function renderApiParityMarkdown(ledger) {
  const lines = [
    "# Generated GWCAjs API Parity",
    "",
    "This file is generated by `node GWCAjs/Tools/generate-api-parity.mjs`.",
    "Do not edit it by hand.",
    "",
    "The state describes browser API representation, not reverse-engineering",
    "verification. Use `GWCAjs/Evidence/INTERNAL_CALLS.md` for callable-function",
    "evidence and verification state.",
    "",
    "## Summary",
    "",
    "| Native methods | Implemented | Adapted | Not started | Browser-only |",
    "| ---: | ---: | ---: | ---: | ---: |",
    `| ${ledger.totals.nativeMethods} | ${ledger.totals.implemented} | ${ledger.totals.adapted} | ${ledger.totals.notStarted} | ${ledger.totals.browserOnly} |`,
    "",
    "## Managers",
    "",
    "| Manager | Native | Implemented | Adapted | Not started | Browser-only |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const manager of ledger.managers) {
    lines.push(
      `| ${manager.manager} | ${manager.counts.nativeMethods} | ${manager.counts.implemented} | ${manager.counts.adapted} | ${manager.counts.notStarted} | ${manager.counts.browserOnly} |`
    );
  }

  for (const manager of ledger.managers) {
    lines.push(
      "",
      `## ${manager.manager}`,
      "",
      `Native: \`${manager.headerPath}\`  `,
      `Browser: \`${manager.sourcePath}\``,
      "",
      "| API | State | Native signature(s) | Browser mapping |",
      "| --- | --- | --- | --- |"
    );
    for (const method of manager.methods) {
      const signatures = method.nativeSignatures
        .map((signature) => `<code>${escapeTable(signature)}</code>`)
        .join("<br>");
      const mapping = method.browserExpression
        ? `<code>${escapeTable(method.browserExpression)}</code>`
        : "";
      lines.push(
        `| ${method.name} | ${method.state} | ${signatures} | ${mapping} |`
      );
    }
    if (manager.browserOnly.length) {
      lines.push(
        "",
        "Browser-only diagnostics and compatibility helpers:",
        "",
        manager.browserOnly
          .map((method) => `- \`${method.name}\``)
          .join("\n")
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function getManagerName(path) {
  return basename(path, ".h");
}
