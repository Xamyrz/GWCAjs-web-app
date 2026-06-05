const STORAGE_KEY = "gw.inspector.state.v1";
const WATCH_PREVIEW_LIMIT = 160;

const STRUCT_PRESETS = Object.freeze({
  charContextNative: {
    defaultSource: "mapState",
    fields: [
      ["worldFlags", 0x190, "u32"],
      ["token1", 0x194, "u32"],
      ["mapIdDesktop", 0x198, "u32"],
      ["isExplorable", 0x19c, "u32"],
      ["token2", 0x1b8, "u32"],
      ["districtId", 0x228, "i32"],
      ["language", 0x22c, "u32"],
      ["observeMapId", 0x230, "u32"],
      ["currentMapId", 0x234, "u32"],
      ["observeMapType", 0x238, "u32"],
      ["currentMapType", 0x23c, "u32"],
      ["playerNumber", 0x2ac, "u32"],
      ["playerName@0x74", 0x74, "utf16", 20],
      ["playerName@0x8c", 0x8c, "utf16", 20],
      ["playerEmail@0x3c0", 0x3c0, "utf16", 64],
      ["playerEmail@0x3d8", 0x3d8, "utf16", 64],
    ],
    pointerBytes: 0x440,
  },
  playerNative: {
    defaultSource: "manual",
    fields: [
      ["agentId", 0x00, "u32"],
      ["appearanceBitmap", 0x10, "u32"],
      ["flags", 0x14, "u32"],
      ["primary", 0x18, "u32"],
      ["secondary", 0x1c, "u32"],
      ["nameEncPtr", 0x24, "ptr"],
      ["namePtr", 0x28, "ptr"],
      ["partyLeaderPlayerNumber", 0x2c, "u32"],
      ["activeTitleTier", 0x30, "u32"],
      ["reforgedFlags", 0x34, "u32"],
      ["playerNumber", 0x38, "u32"],
      ["partySize", 0x3c, "u32"],
    ],
    pointerBytes: 0x50,
  },
  agentLivingNative: {
    defaultSource: "manual",
    fields: [
      ["agentId", 0x2c, "u32"],
      ["z", 0x30, "f32"],
      ["x", 0x74, "f32"],
      ["y", 0x78, "f32"],
      ["type", 0x9c, "u32"],
      ["moveX", 0xa0, "f32"],
      ["moveY", 0xa4, "f32"],
      ["owner", 0xc4, "u32"],
      ["playerNumber", 0xf4, "u16"],
      ["agentModelType", 0xf6, "u16"],
      ["transmogNpcId", 0xf8, "u32"],
      ["primary", 0x10e, "u8"],
      ["secondary", 0x10f, "u8"],
      ["level", 0x110, "u8"],
      ["teamId", 0x111, "u8"],
      ["energyRegen", 0x118, "f32"],
      ["energy", 0x120, "f32"],
      ["maxEnergy", 0x124, "u32"],
      ["hpPips", 0x12c, "f32"],
      ["hp", 0x134, "f32"],
      ["maxHp", 0x138, "u32"],
      ["effects", 0x13c, "u32"],
      ["modelState", 0x158, "u32"],
      ["typeMap", 0x15c, "u32"],
      ["loginNumber", 0x184, "u32"],
      ["animationSpeed", 0x188, "f32"],
      ["animationCode", 0x18c, "u32"],
      ["animationId", 0x190, "u32"],
      ["weaponType", 0x1b6, "u16"],
      ["skill", 0x1b8, "u16"],
    ],
    pointerBytes: 0x1c4,
  },
  desktopGameContext: {
    defaultSource: "gameplayContext",
    fields: [
      ["agent", 0x08, "ptr"],
      ["map", 0x14, "ptr"],
      ["textParser", 0x18, "ptr"],
      ["account", 0x28, "ptr"],
      ["world", 0x2c, "ptr"],
      ["cinematic", 0x30, "ptr"],
      ["gadget", 0x38, "ptr"],
      ["guild", 0x3c, "ptr"],
      ["items", 0x40, "ptr"],
      ["character", 0x44, "ptr"],
      ["party", 0x4c, "ptr"],
      ["trade", 0x58, "ptr"],
    ],
    pointerBytes: 0x80,
  },
  gameplayRootObserved: {
    defaultSource: "gameplayContext",
    fields: [
      ["branch+0x20", 0x20, "ptr"],
      ["scalar+0x24", 0x24, "u32"],
      ["scalar+0x28", 0x28, "u32"],
      ["scalar+0x2c", 0x2c, "u32"],
      ["scalar+0x30", 0x30, "u32"],
      ["scalar+0x34", 0x34, "u32"],
      ["scalar+0x38", 0x38, "u32"],
      ["branch+0x54", 0x54, "ptr"],
      ["branch+0x64", 0x64, "ptr"],
      ["branch+0x78", 0x78, "ptr"],
      ["u32+0x80", 0x80, "u32"],
      ["u32+0x84", 0x84, "u32"],
    ],
    pointerBytes: 0x140,
  },
  pointerBlock: {
    defaultSource: "manual",
    fields: [],
    pointerBytes: 0x100,
  },
});

const elements = {
  bookmarkAddress: document.getElementById("bookmark-address"),
  bookmarkAdd: document.getElementById("bookmark-add"),
  bookmarkCurrentState: document.getElementById("bookmark-current-state"),
  bookmarkCurrentViewer: document.getElementById("bookmark-current-viewer"),
  bookmarkLabel: document.getElementById("bookmark-label"),
  bookmarkTable: document.getElementById("bookmark-table"),
  buildId: document.getElementById("build-id"),
  buildNotes: document.getElementById("build-notes"),
  buildSummary: document.getElementById("build-summary"),
  captureStatus: document.getElementById("capture-status"),
  connectTarget: document.getElementById("connect-target"),
  diffCapture: document.getElementById("diff-capture"),
  diffLength: document.getElementById("diff-length"),
  diffResults: document.getElementById("diff-results"),
  diffRun: document.getElementById("diff-run"),
  diffStart: document.getElementById("diff-start"),
  diffZoneWatch: document.getElementById("diff-zone-watch"),
  frame: document.getElementById("target-frame"),
  frameCaption: document.getElementById("frame-caption"),
  liveContextPills: document.getElementById("live-context-pills"),
  loadTarget: document.getElementById("load-target"),
  mapStatus: document.getElementById("map-status"),
  notesSave: document.getElementById("notes-save"),
  offsetLabel: document.getElementById("offset-label"),
  offsetSaveCurrent: document.getElementById("offset-save-current"),
  offsetTable: document.getElementById("offset-table"),
  offsetTargetKey: document.getElementById("offset-target-key"),
  pathAnchorBytes: document.getElementById("path-anchor-bytes"),
  pathDepth: document.getElementById("path-depth"),
  pathMaxNodes: document.getElementById("path-max-nodes"),
  pathMaxResults: document.getElementById("path-max-results"),
  pathMode: document.getElementById("path-mode"),
  pathNodeBytes: document.getElementById("path-node-bytes"),
  pathResults: document.getElementById("path-results"),
  pathTargetAddress: document.getElementById("path-target-address"),
  pathsRun: document.getElementById("paths-run"),
  playerAgentId: document.getElementById("player-agent-id"),
  playerFindAgent: document.getElementById("player-find-agent"),
  playerFindStruct: document.getElementById("player-find-struct"),
  playerName: document.getElementById("player-name"),
  playerNumber: document.getElementById("player-number"),
  playerResults: document.getElementById("player-results"),
  playerSearchLimit: document.getElementById("player-search-limit"),
  refsResults: document.getElementById("refs-results"),
  refsRun: document.getElementById("refs-run"),
  runtimeStatus: document.getElementById("runtime-status"),
  searchEnd: document.getElementById("search-end"),
  searchLimit: document.getElementById("search-limit"),
  searchMode: document.getElementById("search-mode"),
  searchQuery: document.getElementById("search-query"),
  searchResults: document.getElementById("search-results"),
  searchRun: document.getElementById("search-run"),
  searchStart: document.getElementById("search-start"),
  statusText: document.getElementById("status-text"),
  targetStatus: document.getElementById("target-status"),
  targetUrl: document.getElementById("target-url"),
  viewerAddress: document.getElementById("viewer-address"),
  viewerMeta: document.getElementById("viewer-meta"),
  viewerPreset: document.getElementById("viewer-preset"),
  viewerRefresh: document.getElementById("viewer-refresh"),
  viewerSource: document.getElementById("viewer-source"),
  viewerTable: document.getElementById("viewer-table"),
  watchAdd: document.getElementById("watch-add"),
  watchExpression: document.getElementById("watch-expression"),
  watchInterval: document.getElementById("watch-interval"),
  watchLabel: document.getElementById("watch-label"),
  watchRefresh: document.getElementById("watch-refresh"),
  watchTable: document.getElementById("watch-table"),
};

const state = {
  buildId: "unknown",
  buildInfo: null,
  diff: {
    baseline: null,
    lastMapId: null,
  },
  runtime: null,
  storage: loadStorage(),
  watchLoopHandle: null,
  watchLoopPending: false,
  watches: [],
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatHex(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  return "0x" + (value >>> 0).toString(16);
}

function formatAddress(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "";
  }
  return formatHex(value) + " (" + value + ")";
}

function parseNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return fallback;
  }
  const text = value.trim();
  if (!text) {
    return fallback;
  }
  if (/^-?0x[0-9a-f]+$/i.test(text)) {
    return Number.parseInt(text, 16);
  }
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readUtf16(hook, address, maxUnits = 64) {
  if (!hook || typeof hook.readU16 !== "function" || !address) {
    return "";
  }
  const limit = Math.max(0, maxUnits | 0);
  const chars = [];
  for (let index = 0; index < limit; index += 1) {
    let codeUnit = 0;
    try {
      codeUnit = hook.readU16(address + index * 2);
    } catch (error) {
      return "";
    }
    if (!codeUnit) {
      break;
    }
    chars.push(codeUnit);
  }
  return chars.length > 0 ? String.fromCharCode(...chars) : "";
}

function readValueByType(hook, address, type, length) {
  switch (type) {
    case "u8":
      return hook.readU8(address);
    case "u16":
      return hook.readU16(address);
    case "u32":
    case "ptr":
      return hook.readU32(address);
    case "i32":
      return hook.readI32(address);
    case "f32":
      return hook.readF32(address);
    case "utf16":
      return readUtf16(hook, address, length || 32);
    case "utf8":
      return hook.readUtf8(address, length || 64);
    default:
      return null;
  }
}

function previewValue(value, limit = WATCH_PREVIEW_LIMIT) {
  if (typeof value === "string") {
    return value.length > limit ? value.slice(0, limit) + "..." : value;
  }
  try {
    const text = JSON.stringify(value);
    return text && text.length > limit ? text.slice(0, limit) + "..." : text;
  } catch (error) {
    return String(value);
  }
}

function setPill(node, text, tone = "") {
  node.textContent = text;
  node.className = "pill" + (tone ? " status-" + tone : "");
}

function loadStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { builds: {} };
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : { builds: {} };
  } catch (error) {
    return { builds: {} };
  }
}

function saveStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.storage));
}

function getBuildBucket(buildId = state.buildId) {
  const key = buildId || "unknown";
  if (!state.storage.builds[key]) {
    state.storage.builds[key] = {
      bookmarks: [],
      notes: "",
      resolvedOffsets: [],
      watches: [],
    };
  }
  return state.storage.builds[key];
}

function currentRuntime() {
  if (!state.runtime || !state.runtime.win || !state.runtime.hook || !state.runtime.gw) {
    throw new Error("GW runtime is not connected");
  }
  return state.runtime;
}

function safeInvoke(fn, fallback = null) {
  try {
    return fn();
  } catch (error) {
    return fallback;
  }
}

async function waitFor(predicate, timeoutMs = 60000, intervalMs = 100) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = predicate();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Timed out while waiting for target runtime");
}

function resolveViewerAddress() {
  const source = elements.viewerSource.value;
  const manualAddress = parseNumber(elements.viewerAddress.value, 0);
  if (!state.runtime) {
    return manualAddress;
  }

  const { gw } = state.runtime;
  switch (source) {
    case "mapState":
      return safeInvoke(() => gw.map.getStateAddress(), manualAddress) || manualAddress;
    case "gameplayContext":
      return safeInvoke(() => gw.map.getGameplayContextAddress(), manualAddress) || manualAddress;
    case "charContext":
      return safeInvoke(() => gw.map.getCharContextAddress(), manualAddress) || manualAddress;
    case "mapContext":
      return safeInvoke(() => gw.map.getMapContextAddress(), manualAddress) || manualAddress;
    case "manual":
    default:
      return manualAddress;
  }
}

function setViewerAddress(address) {
  if (typeof address === "number" && Number.isFinite(address) && address > 0) {
    elements.viewerAddress.value = formatHex(address);
    renderStructViewer();
  }
}

function buildStatusSummary() {
  if (!state.runtime) {
    return "No runtime connected";
  }
  const mapState = safeInvoke(() => state.runtime.gw.map.getState(), null);
  const gameplay = safeInvoke(() => state.runtime.gw.map.getGameplayContextAddress(), null);
  const stateAddress = safeInvoke(() => state.runtime.gw.map.getStateAddress(), null);
  const parts = [];
  if (state.buildInfo?.debugFile) {
    parts.push("debug=" + state.buildInfo.debugFile);
  }
  if (typeof gameplay === "number" && gameplay > 0) {
    parts.push("gameplay=" + formatHex(gameplay));
  }
  if (typeof stateAddress === "number" && stateAddress > 0) {
    parts.push("state=" + formatHex(stateAddress));
  }
  if (mapState && typeof mapState.mapId === "number") {
    parts.push("mapId=" + mapState.mapId);
    parts.push("district=" + mapState.districtId);
  }
  return parts.join(" | ") || "Connected";
}

function syncPlayerDefaults() {
  if (!state.runtime) {
    return;
  }
  const runtime = state.runtime;
  const mapState = safeInvoke(() => runtime.gw.map.getState(), null);
  const charContext = safeInvoke(() => runtime.gw.map.getStateAddress(), null);

  if (charContext && !elements.bookmarkAddress.value) {
    elements.bookmarkAddress.value = formatHex(charContext);
  }
  if (mapState && typeof mapState.playerNumber === "number" && !elements.playerNumber.value) {
    elements.playerNumber.value = String(mapState.playerNumber);
  }
  if (!elements.playerName.value && runtime.gw?.map?.inspectNativeCharContext && charContext) {
    const native = safeInvoke(() => runtime.gw.map.inspectNativeCharContext(charContext), null);
    if (native?.playerName) {
      elements.playerName.value = native.playerName;
    }
  }
}

function updateRuntimeStatus() {
  const runtime = state.runtime;
  if (!runtime) {
    elements.buildId.textContent = "unknown";
    elements.buildSummary.textContent =
      "Load the client in the embedded frame, then connect once `GWHook` is ready.";
    setPill(elements.runtimeStatus, "not connected");
    setPill(elements.targetStatus, "waiting");
    setPill(elements.captureStatus, "unknown");
    setPill(elements.mapStatus, "unresolved");
    elements.liveContextPills.innerHTML = "";
    return;
  }

  const { gw, hook, win } = runtime;
  const captureState = safeInvoke(() => hook.getCaptureState(), null);
  const mapState = safeInvoke(() => gw.map.getState(), null);
  const mapDescribe = safeInvoke(() => gw.map.describe(), null);
  const gameplayContext = safeInvoke(() => gw.map.getGameplayContextAddress(), null);
  const stateAddress = safeInvoke(() => gw.map.getStateAddress(), null);

  elements.buildId.textContent = state.buildId;
  elements.buildSummary.textContent = buildStatusSummary();
  setPill(elements.runtimeStatus, "connected", "ok");
  setPill(elements.targetStatus, new URL(win.location.href).pathname, "ok");
  setPill(
    elements.captureStatus,
    captureState ? String(captureState.captures.length) + " captures" : "ready",
    "ok"
  );
  if (mapState && typeof mapState.mapId === "number") {
    setPill(elements.mapStatus, "map " + mapState.mapId, "ok");
  } else if (mapDescribe && mapDescribe.address) {
    setPill(elements.mapStatus, "state @" + formatHex(mapDescribe.address), "warn");
  } else {
    setPill(elements.mapStatus, "unresolved", "warn");
  }

  const pills = [];
  if (typeof gameplayContext === "number" && gameplayContext > 0) {
    pills.push("gameplay " + formatHex(gameplayContext));
  }
  if (typeof stateAddress === "number" && stateAddress > 0) {
    pills.push("state " + formatHex(stateAddress));
  }
  if (mapState && typeof mapState.mapId === "number") {
    pills.push("mapId " + mapState.mapId);
    pills.push("district " + mapState.districtId);
    pills.push("lang " + mapState.language);
  }
  elements.liveContextPills.innerHTML = pills
    .map((entry) => '<span class="pill"><strong>' + escapeHtml(entry) + "</strong></span>")
    .join("");
}

function normalizeStructRows(address, preset) {
  const runtime = currentRuntime();
  const { hook, gw } = runtime;
  const rows = [];
  if (!address) {
    return rows;
  }

  if (preset === "pointerBlock") {
    const byteLength =
      STRUCT_PRESETS.pointerBlock.pointerBytes ||
      parseNumber(elements.pathNodeBytes.value, 0x100);
    const dump = safeInvoke(
      () => gw.map.dumpAddressPointers(address, byteLength, 4, { minPointerAddress: 0x10000 }),
      []
    );
    for (const entry of dump) {
      rows.push({
        field: "slot+" + formatHex(entry.offset),
        offset: entry.offset,
        text: entry.isLikelyPointer ? formatAddress(entry.value) : String(entry.value),
        value: entry.value,
      });
    }
    return rows;
  }

  for (const [fieldName, offset, type, length] of STRUCT_PRESETS[preset].fields) {
    const fieldAddress = address + offset;
    const value = safeInvoke(() => readValueByType(hook, fieldAddress, type, length), null);

    rows.push({
      field: fieldName,
      offset,
      text:
        typeof value === "number"
          ? type === "ptr"
            ? formatAddress(value)
            : String(value)
          : value || "",
      value,
    });
  }

  return rows;
}

function renderStructViewer() {
  elements.viewerTable.innerHTML = "";
  elements.viewerMeta.innerHTML = "";

  if (!state.runtime) {
    return;
  }

  const preset = elements.viewerPreset.value;
  const address = resolveViewerAddress();
  const rows = normalizeStructRows(address, preset);

  const meta = [
    ["preset", preset],
    ["source", elements.viewerSource.value],
    ["address", address ? formatHex(address) : "unset"],
  ];
  elements.viewerMeta.innerHTML = meta
    .map(
      ([label, value]) =>
        '<span class="pill"><span class="muted">' +
        escapeHtml(label) +
        '</span><strong>' +
        escapeHtml(value) +
        "</strong></span>"
    )
    .join("");

  elements.viewerTable.innerHTML = rows
    .map((row) => {
      const valueText =
        typeof row.value === "number" ? escapeHtml(String(row.value)) : escapeHtml(row.text);
      const hexText =
        typeof row.value === "number" ? escapeHtml(formatHex(row.value)) : escapeHtml(row.text);
      return (
        "<tr>" +
        "<td>" +
        escapeHtml(row.field) +
        "</td>" +
        "<td>" +
        escapeHtml(formatHex(row.offset)) +
        "</td>" +
        "<td>" +
        valueText +
        "</td>" +
        "<td>" +
        hexText +
        "</td>" +
        "</tr>"
      );
    })
    .join("");
}

function renderBookmarks() {
  const bucket = getBuildBucket();
  elements.bookmarkTable.innerHTML = bucket.bookmarks
    .map(
      (entry) =>
        "<tr>" +
        "<td>" +
        escapeHtml(entry.label || "bookmark") +
        "</td>" +
        "<td>" +
        escapeHtml(formatAddress(entry.address)) +
        "</td>" +
        '<td><div class="list-actions">' +
        '<button type="button" data-action="use-bookmark" data-id="' +
        escapeHtml(entry.id) +
        '">Use</button>' +
        '<button type="button" data-action="delete-bookmark" data-id="' +
        escapeHtml(entry.id) +
        '">Delete</button>' +
        "</div></td>" +
        "</tr>"
    )
    .join("");
}

function addBookmark(label, address) {
  if (!address) {
    return;
  }
  const bucket = getBuildBucket();
  bucket.bookmarks.unshift({
    id: crypto.randomUUID(),
    address: address >>> 0,
    label: label || "bookmark",
    createdAt: new Date().toISOString(),
  });
  saveStorage();
  renderBookmarks();
}

function renderResolvedOffsets() {
  const bucket = getBuildBucket();
  elements.offsetTable.innerHTML = bucket.resolvedOffsets
    .map(
      (entry) =>
        "<tr>" +
        "<td>" +
        escapeHtml(entry.label || "entry") +
        "</td>" +
        "<td>" +
        escapeHtml(entry.targetKey || "") +
        "</td>" +
        "<td>" +
        escapeHtml(formatAddress(entry.address)) +
        "</td>" +
        '<td><div class="list-actions">' +
        '<button type="button" data-action="use-offset" data-id="' +
        escapeHtml(entry.id) +
        '">Use</button>' +
        '<button type="button" data-action="delete-offset" data-id="' +
        escapeHtml(entry.id) +
        '">Delete</button>' +
        "</div></td>" +
        "</tr>"
    )
    .join("");
}

function saveCurrentResolvedOffset() {
  const address = resolveViewerAddress();
  if (!address) {
    return;
  }
  const bucket = getBuildBucket();
  bucket.resolvedOffsets.unshift({
    id: crypto.randomUUID(),
    address: address >>> 0,
    label: elements.offsetLabel.value.trim() || "resolved",
    targetKey: elements.offsetTargetKey.value.trim() || "modules.map.stateAddress",
    createdAt: new Date().toISOString(),
  });
  saveStorage();
  renderResolvedOffsets();
}

function renderNotes() {
  const bucket = getBuildBucket();
  elements.buildNotes.value = bucket.notes || "";
}

function saveNotes() {
  const bucket = getBuildBucket();
  bucket.notes = elements.buildNotes.value;
  saveStorage();
}

function renderJson(node, value) {
  node.textContent =
    typeof value === "string" ? value : JSON.stringify(value ?? null, null, 2);
}

function readPlayerStruct(address) {
  const runtime = currentRuntime();
  const hook = runtime.hook;
  const namePtr = safeInvoke(() => hook.readU32(address + 0x28), 0);
  const nameEncPtr = safeInvoke(() => hook.readU32(address + 0x24), 0);
  return {
    address,
    agentId: safeInvoke(() => hook.readU32(address + 0x00), null),
    appearanceBitmap: safeInvoke(() => hook.readU32(address + 0x10), null),
    flags: safeInvoke(() => hook.readU32(address + 0x14), null),
    name: namePtr ? readUtf16(hook, namePtr, 24) : "",
    nameEncPtr,
    namePtr,
    partyLeaderPlayerNumber: safeInvoke(() => hook.readU32(address + 0x2c), null),
    partySize: safeInvoke(() => hook.readU32(address + 0x3c), null),
    playerNumber: safeInvoke(() => hook.readU32(address + 0x38), null),
    primary: safeInvoke(() => hook.readU32(address + 0x18), null),
    secondary: safeInvoke(() => hook.readU32(address + 0x1c), null),
  };
}

function scorePlayerStructCandidate(candidate, expectedName, expectedPlayerNumber) {
  let score = 0;
  const reasons = [];
  if (candidate.name && expectedName && candidate.name === expectedName) {
    score += 10;
    reasons.push("nameExact");
  }
  if (
    candidate.name &&
    expectedName &&
    candidate.name.toLowerCase() === expectedName.toLowerCase()
  ) {
    score += 2;
    reasons.push("nameFolded");
  }
  if (typeof expectedPlayerNumber === "number" && expectedPlayerNumber > 0) {
    if (candidate.playerNumber === expectedPlayerNumber) {
      score += 8;
      reasons.push("playerNumber");
    }
    if (candidate.partyLeaderPlayerNumber === expectedPlayerNumber) {
      score += 1;
      reasons.push("partyLeaderPlayerNumber");
    }
  }
  if (
    typeof candidate.agentId === "number" &&
    candidate.agentId > 0 &&
    candidate.agentId < 0x10000000
  ) {
    score += 2;
    reasons.push("agentId");
  }
  if (
    typeof candidate.partySize === "number" &&
    candidate.partySize >= 0 &&
    candidate.partySize <= 12
  ) {
    score += 1;
    reasons.push("partySize");
  }
  return { score, reasons };
}

function findPlayerStructCandidatesByName(name, options = {}) {
  const runtime = currentRuntime();
  const hook = runtime.hook;
  const limit = Math.max(1, parseNumber(options.limit, 32));
  const expectedPlayerNumber = parseNumber(options.playerNumber, 0);
  const hits = hook.findAllUtf16(name, 0, hook.memory.buffer.byteLength, limit);
  const candidates = new Map();

  for (const hitAddress of hits) {
    const refs = runtime.gw.map.findReferencesToAddress(hitAddress, { limit: 256 });
    for (const slotAddress of refs) {
      const address = slotAddress - 0x28;
      if (address <= 0) {
        continue;
      }
      const candidate = readPlayerStruct(address);
      const scored = scorePlayerStructCandidate(candidate, name, expectedPlayerNumber);
      if (scored.score <= 0) {
        continue;
      }
      const entry = {
        ...candidate,
        hitAddress,
        namePointerSlot: slotAddress,
        reasons: scored.reasons,
        score: scored.score,
      };
      const previous = candidates.get(entry.address);
      if (!previous || entry.score > previous.score) {
        candidates.set(entry.address, entry);
      }
    }
  }

  return Array.from(candidates.values()).sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.address - right.address;
  });
}

function readAgentLivingStruct(address) {
  const runtime = currentRuntime();
  const hook = runtime.hook;
  return {
    address,
    agentId: safeInvoke(() => hook.readU32(address + 0x2c), null),
    hp: safeInvoke(() => hook.readF32(address + 0x134), null),
    level: safeInvoke(() => hook.readU8(address + 0x110), null),
    loginNumber: safeInvoke(() => hook.readU32(address + 0x184), null),
    maxHp: safeInvoke(() => hook.readU32(address + 0x138), null),
    playerNumber: safeInvoke(() => hook.readU16(address + 0xf4), null),
    teamId: safeInvoke(() => hook.readU8(address + 0x111), null),
    type: safeInvoke(() => hook.readU32(address + 0x9c), null),
    typeMap: safeInvoke(() => hook.readU32(address + 0x15c), null),
    x: safeInvoke(() => hook.readF32(address + 0x74), null),
    y: safeInvoke(() => hook.readF32(address + 0x78), null),
    z: safeInvoke(() => hook.readF32(address + 0x30), null),
  };
}

function scoreAgentLivingCandidate(candidate, expectedAgentId, expectedPlayerNumber) {
  let score = 0;
  const reasons = [];
  if (candidate.agentId === expectedAgentId) {
    score += 10;
    reasons.push("agentId");
  }
  if ((candidate.type & 0xdb) !== 0) {
    score += 3;
    reasons.push("livingType");
  }
  if (
    typeof expectedPlayerNumber === "number" &&
    expectedPlayerNumber > 0 &&
    candidate.playerNumber === expectedPlayerNumber
  ) {
    score += 6;
    reasons.push("playerNumber");
  }
  if (typeof candidate.hp === "number" && candidate.hp >= 0 && candidate.hp <= 1.2) {
    score += 3;
    reasons.push("hp");
  }
  if (typeof candidate.level === "number" && candidate.level >= 1 && candidate.level <= 30) {
    score += 1;
    reasons.push("level");
  }
  return { score, reasons };
}

function findAgentLivingCandidatesByAgentId(agentId, options = {}) {
  const runtime = currentRuntime();
  const hook = runtime.hook;
  const limit = Math.max(1, parseNumber(options.limit, 64));
  const expectedPlayerNumber = parseNumber(options.playerNumber, 0);
  const hits = hook.scanU32(agentId >>> 0, 0, hook.memory.buffer.byteLength, limit);
  const candidates = new Map();

  for (const slotAddress of hits) {
    const address = slotAddress - 0x2c;
    if (address <= 0) {
      continue;
    }
    const candidate = readAgentLivingStruct(address);
    const scored = scoreAgentLivingCandidate(candidate, agentId, expectedPlayerNumber);
    if (scored.score <= 0) {
      continue;
    }
    const entry = {
      ...candidate,
      agentIdSlot: slotAddress,
      reasons: scored.reasons,
      score: scored.score,
    };
    const previous = candidates.get(entry.address);
    if (!previous || entry.score > previous.score) {
      candidates.set(entry.address, entry);
    }
  }

  return Array.from(candidates.values()).sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.address - right.address;
  });
}

function runPlayerStructDiscovery() {
  const name = elements.playerName.value.trim();
  const results = findPlayerStructCandidatesByName(name, {
    limit: elements.playerSearchLimit.value,
    playerNumber: elements.playerNumber.value,
  });
  if (results[0]?.agentId) {
    elements.playerAgentId.value = String(results[0].agentId);
  }
  renderJson(elements.playerResults, results.slice(0, 16));
}

function runAgentDiscovery() {
  const agentId = parseNumber(elements.playerAgentId.value, 0);
  const results = findAgentLivingCandidatesByAgentId(agentId, {
    limit: elements.playerSearchLimit.value,
    playerNumber: elements.playerNumber.value,
  });
  renderJson(elements.playerResults, results.slice(0, 16));
}

async function connectTarget() {
  const win = elements.frame.contentWindow;
  if (!win) {
    throw new Error("Target iframe is unavailable");
  }

  setPill(elements.runtimeStatus, "connecting", "warn");
  const hook = await waitFor(() => win.GWHook || null, 60000, 100);
  await hook.captured;
  await hook.ready;
  const gw = await waitFor(() => win.GW || null, 10000, 100);
  const buildInfo = safeInvoke(() => hook.getBuildInfo(), null);

  state.runtime = { buildInfo, gw, hook, win };
  state.buildInfo = buildInfo;
  state.buildId =
    buildInfo?.wasmBuildId || buildInfo?.buildId || safeInvoke(() => gw.version.getBuildId(), "unknown");

  hydrateWatches();
  updateRuntimeStatus();
  renderBookmarks();
  renderResolvedOffsets();
  renderNotes();
  renderStructViewer();
  syncPlayerDefaults();
  startWatchLoop();
}

function loadTarget() {
  const next = elements.targetUrl.value.trim() || "/";
  elements.frame.src = next;
  setPill(elements.targetStatus, next, "warn");
  state.runtime = null;
  updateRuntimeStatus();
}

function renderSearchResults(results, mode) {
  const formatted = results.map((value) => {
    if (typeof value === "number") {
      return { address: value, hex: formatHex(value), mode };
    }
    return value;
  });
  renderJson(elements.searchResults, formatted);
}

function runSearch() {
  const runtime = currentRuntime();
  const mode = elements.searchMode.value;
  const query = elements.searchQuery.value;
  const limit = parseNumber(elements.searchLimit.value, 32);
  const start = parseNumber(elements.searchStart.value, 0);
  const endText = elements.searchEnd.value.trim();
  const end = endText ? parseNumber(endText, 0) : runtime.hook.memory.buffer.byteLength;
  let results = [];

  if (mode === "utf16") {
    results = runtime.hook.findAllUtf16(query, start, end, limit);
  } else if (mode === "utf8") {
    const bytes = new TextEncoder().encode(query);
    results = runtime.hook.findAllBytes(bytes, start, end, limit);
  } else if (mode === "u32") {
    results = runtime.hook.scanU32(parseNumber(query, 0), start, end, limit);
  }

  renderSearchResults(results, mode);
}

function runReferenceScan() {
  const runtime = currentRuntime();
  const targetAddress = parseNumber(elements.pathTargetAddress.value, 0);
  const limit = parseNumber(elements.pathMaxResults.value, 16);
  const results = runtime.gw.map.findReferencesToAddress(targetAddress, { limit });
  renderJson(elements.refsResults, results);
}

function runPointerPathSearch() {
  const runtime = currentRuntime();
  const targetAddress = parseNumber(elements.pathTargetAddress.value, 0);
  const options = {
    anchorNodeBytes: parseNumber(elements.pathAnchorBytes.value, 0x800),
    depth: parseNumber(elements.pathDepth.value, 4),
    maxNodes: parseNumber(elements.pathMaxNodes.value, 4096),
    maxResults: parseNumber(elements.pathMaxResults.value, 16),
    nodeBytes: parseNumber(elements.pathNodeBytes.value, 0x100),
  };

  const results =
    elements.pathMode.value === "direct"
      ? runtime.gw.map.findPointerPathsToAddress(targetAddress, options)
      : runtime.gw.map.findAnchoredPathsToAddress(targetAddress, options);
  renderJson(elements.pathResults, results);
}

function evaluateWatch(expression) {
  const runtime = currentRuntime();
  return runtime.win.eval(expression);
}

function hydrateWatches() {
  const bucket = getBuildBucket();
  state.watches = Array.isArray(bucket.watches) ? bucket.watches.slice() : [];
  renderWatches();
}

function persistWatches() {
  const bucket = getBuildBucket();
  bucket.watches = state.watches.map((entry) => ({
    expression: entry.expression,
    id: entry.id,
    intervalMs: entry.intervalMs,
    label: entry.label,
  }));
  saveStorage();
}

function renderWatches() {
  elements.watchTable.innerHTML = state.watches
    .map((entry) => {
      const preview = entry.error
        ? "ERR: " + entry.error
        : previewValue(entry.value ?? null);
      return (
        "<tr>" +
        "<td>" +
        escapeHtml(entry.label) +
        "</td>" +
        "<td>" +
        escapeHtml(entry.expression) +
        "</td>" +
        "<td>" +
        escapeHtml(preview || "") +
        "</td>" +
        '<td><div class="list-actions">' +
        '<button type="button" data-action="use-watch" data-id="' +
        escapeHtml(entry.id) +
        '">Use</button>' +
        '<button type="button" data-action="delete-watch" data-id="' +
        escapeHtml(entry.id) +
        '">Delete</button>' +
        "</div></td>" +
        "</tr>"
      );
    })
    .join("");
}

function addWatch() {
  const expression = elements.watchExpression.value.trim();
  if (!expression) {
    return;
  }
  state.watches.unshift({
    id: crypto.randomUUID(),
    label: elements.watchLabel.value.trim() || "watch",
    expression,
    intervalMs: Math.max(100, parseNumber(elements.watchInterval.value, 500)),
    lastRunAt: 0,
    value: null,
    error: null,
  });
  persistWatches();
  renderWatches();
}

async function refreshWatches(force = false) {
  if (!state.runtime || state.watchLoopPending) {
    return;
  }
  state.watchLoopPending = true;
  try {
    const now = Date.now();
    for (const entry of state.watches) {
      if (!force && now - entry.lastRunAt < entry.intervalMs) {
        continue;
      }
      entry.lastRunAt = now;
      try {
        entry.value = await Promise.resolve(evaluateWatch(entry.expression));
        entry.error = null;
      } catch (error) {
        entry.value = null;
        entry.error = error instanceof Error ? error.message : String(error);
      }
    }
    renderWatches();
    updateRuntimeStatus();
    maybeCaptureZoneDiff();
  } finally {
    state.watchLoopPending = false;
  }
}

function startWatchLoop() {
  if (state.watchLoopHandle) {
    clearInterval(state.watchLoopHandle);
  }
  state.watchLoopHandle = window.setInterval(() => {
    refreshWatches(false).catch((error) => {
      console.error("watch refresh failed", error);
    });
  }, 250);
}

function snapshotRegion() {
  const runtime = currentRuntime();
  const start = parseNumber(elements.diffStart.value, 0);
  const length = parseNumber(elements.diffLength.value, 0x100);
  return {
    bytes: Array.from(runtime.hook.readBytes(start, length)),
    capturedAt: new Date().toISOString(),
    length,
    start,
  };
}

function diffSnapshots(previous, current) {
  const changes = [];
  if (!previous || !current) {
    return changes;
  }
  const length = Math.min(previous.bytes.length, current.bytes.length);
  for (let index = 0; index < length; index += 1) {
    if (previous.bytes[index] !== current.bytes[index]) {
      changes.push({
        offset: index,
        address: current.start + index,
        before: previous.bytes[index],
        after: current.bytes[index],
      });
    }
  }
  return changes;
}

function captureDiffBaseline() {
  state.diff.baseline = snapshotRegion();
  renderJson(elements.diffResults, {
    baseline: {
      capturedAt: state.diff.baseline.capturedAt,
      length: state.diff.baseline.length,
      start: formatHex(state.diff.baseline.start),
    },
  });
}

function compareDiffBaseline() {
  const current = snapshotRegion();
  const changes = diffSnapshots(state.diff.baseline, current);
  renderJson(elements.diffResults, {
    baselineCapturedAt: state.diff.baseline?.capturedAt || null,
    changedByteCount: changes.length,
    currentCapturedAt: current.capturedAt,
    changes: changes.slice(0, 128),
  });
}

function maybeCaptureZoneDiff() {
  if (!elements.diffZoneWatch.checked || !state.runtime) {
    return;
  }
  const mapId = safeInvoke(() => state.runtime.gw.map.getMapId(), null);
  if (typeof mapId !== "number") {
    return;
  }
  if (state.diff.lastMapId === null) {
    state.diff.lastMapId = mapId;
    if (!state.diff.baseline) {
      state.diff.baseline = snapshotRegion();
    }
    return;
  }
  if (mapId === state.diff.lastMapId) {
    return;
  }
  const previous = state.diff.baseline;
  const current = snapshotRegion();
  const changes = diffSnapshots(previous, current);
  state.diff.baseline = current;
  state.diff.lastMapId = mapId;
  renderJson(elements.diffResults, {
    changedByteCount: changes.length,
    changes: changes.slice(0, 128),
    event: "mapId changed",
    mapId,
  });
}

function onFrameLoaded() {
  state.runtime = null;
  updateRuntimeStatus();
  elements.frameCaption.textContent = "loaded " + elements.frame.src;
}

function handleTableClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }
  const action = button.dataset.action;
  const id = button.dataset.id;
  const bucket = getBuildBucket();

  if (action === "use-bookmark") {
    const entry = bucket.bookmarks.find((item) => item.id === id);
    if (entry) {
      setViewerAddress(entry.address);
      elements.viewerSource.value = "manual";
    }
  } else if (action === "delete-bookmark") {
    bucket.bookmarks = bucket.bookmarks.filter((item) => item.id !== id);
    saveStorage();
    renderBookmarks();
  } else if (action === "use-offset") {
    const entry = bucket.resolvedOffsets.find((item) => item.id === id);
    if (entry) {
      setViewerAddress(entry.address);
      elements.viewerSource.value = "manual";
    }
  } else if (action === "delete-offset") {
    bucket.resolvedOffsets = bucket.resolvedOffsets.filter((item) => item.id !== id);
    saveStorage();
    renderResolvedOffsets();
  } else if (action === "use-watch") {
    const entry = state.watches.find((item) => item.id === id);
    const numeric = typeof entry?.value === "number" ? entry.value : parseNumber(String(entry?.value ?? ""), 0);
    if (numeric) {
      setViewerAddress(numeric);
      elements.viewerSource.value = "manual";
    }
  } else if (action === "delete-watch") {
    state.watches = state.watches.filter((item) => item.id !== id);
    persistWatches();
    renderWatches();
  }
}

function primeDefaults() {
  elements.viewerSource.value = STRUCT_PRESETS[elements.viewerPreset.value].defaultSource;
  elements.pathTargetAddress.value = "0x0";
}

function wireEvents() {
  elements.loadTarget.addEventListener("click", loadTarget);
  elements.connectTarget.addEventListener("click", () => {
    connectTarget().catch((error) => {
      setPill(elements.runtimeStatus, "connect failed", "bad");
      elements.buildSummary.textContent = error instanceof Error ? error.message : String(error);
    });
  });
  elements.frame.addEventListener("load", onFrameLoaded);
  elements.viewerPreset.addEventListener("change", () => {
    elements.viewerSource.value = STRUCT_PRESETS[elements.viewerPreset.value].defaultSource;
    renderStructViewer();
  });
  elements.viewerSource.addEventListener("change", renderStructViewer);
  elements.viewerAddress.addEventListener("change", renderStructViewer);
  elements.viewerRefresh.addEventListener("click", renderStructViewer);

  elements.bookmarkAdd.addEventListener("click", () => {
    addBookmark(elements.bookmarkLabel.value.trim(), parseNumber(elements.bookmarkAddress.value, 0));
  });
  elements.bookmarkCurrentViewer.addEventListener("click", () => {
    addBookmark(
      elements.bookmarkLabel.value.trim() || "viewer",
      resolveViewerAddress()
    );
  });
  elements.bookmarkCurrentState.addEventListener("click", () => {
    const address = safeInvoke(() => currentRuntime().gw.map.getStateAddress(), 0);
    addBookmark(elements.bookmarkLabel.value.trim() || "map-state", address);
  });

  elements.searchRun.addEventListener("click", () => {
    try {
      runSearch();
    } catch (error) {
      renderJson(elements.searchResults, { error: String(error) });
    }
  });

  elements.playerFindStruct.addEventListener("click", () => {
    try {
      runPlayerStructDiscovery();
    } catch (error) {
      renderJson(elements.playerResults, { error: String(error) });
    }
  });

  elements.playerFindAgent.addEventListener("click", () => {
    try {
      runAgentDiscovery();
    } catch (error) {
      renderJson(elements.playerResults, { error: String(error) });
    }
  });

  elements.refsRun.addEventListener("click", () => {
    try {
      runReferenceScan();
    } catch (error) {
      renderJson(elements.refsResults, { error: String(error) });
    }
  });

  elements.pathsRun.addEventListener("click", () => {
    try {
      runPointerPathSearch();
    } catch (error) {
      renderJson(elements.pathResults, { error: String(error) });
    }
  });

  elements.watchAdd.addEventListener("click", addWatch);
  elements.watchRefresh.addEventListener("click", () => {
    refreshWatches(true).catch((error) => console.error(error));
  });

  elements.diffCapture.addEventListener("click", () => {
    try {
      captureDiffBaseline();
    } catch (error) {
      renderJson(elements.diffResults, { error: String(error) });
    }
  });
  elements.diffRun.addEventListener("click", () => {
    try {
      compareDiffBaseline();
    } catch (error) {
      renderJson(elements.diffResults, { error: String(error) });
    }
  });
  elements.diffZoneWatch.addEventListener("change", () => {
    state.diff.lastMapId = null;
  });

  elements.notesSave.addEventListener("click", saveNotes);
  elements.offsetSaveCurrent.addEventListener("click", saveCurrentResolvedOffset);

  elements.bookmarkTable.addEventListener("click", handleTableClick);
  elements.offsetTable.addEventListener("click", handleTableClick);
  elements.watchTable.addEventListener("click", handleTableClick);
}

function boot() {
  primeDefaults();
  wireEvents();
  renderBookmarks();
  renderResolvedOffsets();
  renderNotes();
  renderWatches();
  updateRuntimeStatus();
  renderJson(elements.playerResults, "Player and agent discovery results will appear here.");
  renderJson(elements.searchResults, "Search results will appear here.");
  renderJson(elements.refsResults, "Reference scan results will appear here.");
  renderJson(elements.pathResults, "Pointer path results will appear here.");
  renderJson(elements.diffResults, "Region diff results will appear here.");
}

boot();
