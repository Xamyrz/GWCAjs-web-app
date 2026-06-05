import { createModule } from "./stdafx.js";

const PLAYER_OFFSETS = Object.freeze({
  activeTitleTier: 0x30,
  agentId: 0x00,
  appearanceBitmap: 0x10,
  flags: 0x14,
  nameEncPtr: 0x24,
  namePtr: 0x28,
  partyLeaderPlayerNumber: 0x2c,
  partySize: 0x3c,
  playerNumber: 0x38,
  primary: 0x18,
  reforgedFlags: 0x34,
  secondary: 0x1c,
});

const PLAYER_SIZE = 0x50;

const TITLE_OFFSETS = Object.freeze({
  currentPoints: 0x04,
  currentTitleTierIndex: 0x08,
  maxTitleRank: 0x18,
  maxTitleTierIndex: 0x1c,
  nextTitleTierIndex: 0x10,
  pointsDescPtr: 0x24,
  pointsNeededCurrentRank: 0x0c,
  pointsNeededNextRank: 0x14,
  props: 0x00,
  textPtr: 0x28,
});

const TITLE_SIZE = 0x2c;
const TITLE_ID_NONE = 0xff;
const PLAYER_ADDRESS_CACHE_TTL_MS = 1000;
const TITLE_CLIENT_DATA_ADDRESS = 0x276f60;
const TITLE_CLIENT_DATA_STRIDE = 0x0c;
const TITLE_CLIENT_DATA_OFFSETS = Object.freeze({
  nameId: 0x08,
  titleId: 0x04,
  unknown0: 0x00,
});
const TITLE_NAMES = Object.freeze([
  "Hero",
  "TyrianCarto",
  "CanthanCarto",
  "Gladiator",
  "Champion",
  "Kurzick",
  "Luxon",
  "Drunkard",
  "Deprecated_SkillHunter",
  "Survivor",
  "KoaBD",
  "Deprecated_TreasureHunter",
  "Deprecated_Wisdom",
  "ProtectorTyria",
  "ProtectorCantha",
  "Lucky",
  "Unlucky",
  "Sunspear",
  "ElonianCarto",
  "ProtectorElona",
  "Lightbringer",
  "LDoA",
  "Commander",
  "Gamer",
  "SkillHunterTyria",
  "VanquisherTyria",
  "SkillHunterCantha",
  "VanquisherCantha",
  "SkillHunterElona",
  "VanquisherElona",
  "LegendaryCarto",
  "LegendaryGuardian",
  "LegendarySkillHunter",
  "LegendaryVanquisher",
  "Sweets",
  "GuardianTyria",
  "GuardianCantha",
  "GuardianElona",
  "Asuran",
  "Deldrimor",
  "Vanguard",
  "Norn",
  "MasterOfTheNorth",
  "Party",
  "Zaishen",
  "TreasureHunter",
  "Wisdom",
  "Codex",
]);
const TITLE_NAME_TO_ID = new Map(
  TITLE_NAMES.map((name, titleId) => [name.toLowerCase(), titleId])
);

const GAME_CONTEXT_OFFSETS = Object.freeze({
  character: 0x44,
  map: 0x14,
  world: 0x2c,
});
const GAME_CONTEXT_WORLD_POINTER_OFFSETS = Object.freeze([
  0x00, 0x04, 0x08, 0x0c, 0x10, 0x14, 0x18, 0x1c,
  0x20, 0x24, 0x28, 0x2c, 0x30, 0x34, 0x38, 0x3c,
  0x40, 0x44, 0x48, 0x4c, 0x50, 0x54, 0x58, 0x5c,
  0x60, 0x64, 0x68, 0x6c, 0x70, 0x74, 0x78, 0x7c,
]);
const CHAR_CONTEXT_DEBUG_OFFSETS = Object.freeze([
  0x00, 0x04, 0x08, 0x0c, 0x10, 0x14, 0x18, 0x1c,
  0x20, 0x24, 0x28, 0x2c, 0x30, 0x34, 0x38, 0x3c,
  0x40, 0x44, 0x48, 0x4c, 0x50, 0x54, 0x58, 0x5c,
  0x60, 0x64, 0x68, 0x6c, 0x70, 0x74, 0x78, 0x7c,
  0x280, 0x284, 0x288, 0x28c, 0x290, 0x294, 0x298, 0x29c,
  0x2a0, 0x2a4, 0x2a8, 0x2ac, 0x2b0, 0x2b4, 0x2b8, 0x2bc,
  0x2c0, 0x2c4, 0x2c8, 0x2cc, 0x2d0, 0x2d4, 0x2d8, 0x2dc,
]);
const CHAR_CONTEXT_POINTER_SCAN_BYTES = 0x500;

const WORLD_CONTEXT_OFFSETS = Object.freeze({
  playerControlledChar: 0x680,
  playerNumber: 0x67c,
  players: 0x80c,
  titles: 0x81c,
});

const CHAR_CONTEXT_OFFSETS = Object.freeze({
  playerNumber: 0x2ac,
});

const PLAYER_CONTROLLED_CHARACTER_OFFSETS = Object.freeze({
  agentId: 0x14,
  compositeId: 0x18,
});

const INTERNAL_FUNCTIONS = Object.freeze({
  ChangeSecondProfession: Object.freeze({
    address: "ram:80c50e1e",
    callable: false,
    calls: "SendOrderSetProfessionSecondary",
    disabled: true,
    exportName: "__gwca_change_second_profession",
    functionName: "CharCliProfSetSecondary(unsigned long, ECharProfession)",
    functionIndex: 9265,
    reason:
      "Disabled: exporting the containing WASM function enters the wrong asyncify/prologue path.",
    rawWasmSignature: "(i32, i32, i32, i32) -> nil",
    signature: "void(agentId, profession)",
  }),
  DepositFaction: Object.freeze({
    address: "ram:80c4c3a0",
    callable: false,
    calls: "SendOrderGuildAdjustFaction",
    disabled: true,
    exportName: "__gwca_deposit_faction",
    functionName:
      "CharCliPlayerOrderGuildAdjustFaction(unsigned int, ECharFaction, unsigned int)",
    functionIndex: 9222,
    reason:
      "Disabled: exporting the containing WASM function enters the wrong asyncify/prologue path.",
    rawWasmSignature: "(i32, f32, i32, i32, i32) -> nil",
    signature: "void(always0, allegiance, amount)",
  }),
  GetTitleData: Object.freeze({
    address: "ram:818b4f92",
    callable: false,
    dataAddress: TITLE_CLIENT_DATA_ADDRESS,
    functionName: "ConstGetTitleClientData(ETitle)",
    functionIndex: 17415,
    reason: "Read directly from its resolved linear-memory data table.",
    rawWasmSignature: "(i32) -> nil",
    signature: "TitleClientData*(titleId)",
  }),
  RemoveActiveTitle: Object.freeze({
    address: "ram:80c501af",
    callable: false,
    calls: "SendSetTitleNone",
    disabled: true,
    exportName: "__gwca_remove_active_title",
    functionName: "CharCliPlayerSetTitleNone()",
    functionIndex: 9253,
    reason:
      "Disabled: exporting the containing WASM function enters the wrong asyncify/prologue path.",
    rawWasmSignature: "(i32) -> i32",
    signature: "void()",
  }),
  SetActiveTitle: Object.freeze({
    address: "ram:80c500f6",
    callable: false,
    calls: "SendSetTitle",
    disabled: true,
    exportName: "__gwca_set_active_title",
    functionName: "CharCliPlayerSetTitle(unsigned int)",
    functionIndex: 9252,
    reason:
      "Disabled: exporting the containing WASM function enters the wrong asyncify/prologue path.",
    rawWasmSignature: "(i32) -> i32",
    signature: "void(titleId)",
  }),
  SendOrderGuildAdjustFaction: Object.freeze({
    address: "ram:80a148d6",
    callable: false,
    exportName: "__gwca_msg_send_order_guild_adjust_faction",
    functionName:
      "CharMsgSendOrderGuildAdjustFaction(unsigned int, ECharFaction, unsigned int)",
    functionIndex: 6893,
    message: Object.freeze({
      opcode: 0x35,
      size: 0x10,
      fields: Object.freeze(["opcode", "always0", "allegiance", "amount"]),
    }),
    reason:
      "Experimental: lower-level message sender patched into the runtime exports.",
    rawWasmSignature: "(i32, i32, i32) -> nil",
    signature: "void(always0, allegiance, amount)",
  }),
  SendOrderSetProfessionSecondary: Object.freeze({
    address: "ram:80a15825",
    callable: false,
    exportName: "__gwca_msg_send_order_set_profession_secondary",
    functionName:
      "CharMsgSendOrderSetProfessionSecondary(unsigned long, ECharProfession)",
    functionIndex: 6903,
    message: Object.freeze({
      opcode: 0x41,
      size: 0x0c,
      fields: Object.freeze(["opcode", "agentId", "profession"]),
    }),
    reason:
      "Experimental: lower-level message sender patched into the runtime exports.",
    rawWasmSignature: "(i32, i32) -> nil",
    signature: "void(agentId, profession)",
  }),
  SendSetTitle: Object.freeze({
    address: "ram:80a19238",
    callable: false,
    exportName: "__gwca_msg_send_set_title",
    functionName: "CharMsgSendSetTitle(unsigned int)",
    functionIndex: 6924,
    message: Object.freeze({
      opcode: 0x58,
      size: 0x08,
      fields: Object.freeze(["opcode", "titleId"]),
    }),
    reason:
      "Experimental: lower-level message sender patched into the runtime exports.",
    rawWasmSignature: "(i32) -> nil",
    signature: "void(titleId)",
  }),
  SendSetTitleNone: Object.freeze({
    address: "ram:80a1938b",
    callable: false,
    exportName: "__gwca_msg_send_set_title_none",
    functionName: "CharMsgSendSetTitleNone()",
    functionIndex: 6925,
    message: Object.freeze({
      opcode: 0x59,
      size: 0x04,
      fields: Object.freeze(["opcode"]),
    }),
    reason:
      "Experimental: lower-level message sender patched into the runtime exports.",
    rawWasmSignature: "() -> nil",
    signature: "void()",
  }),
});

const UNSUPPORTED_ACTIONS = Object.freeze({
  ChangeSecondProfession:
    "The CharCli wrapper is disabled; using the lower-level SendOrderSetProfessionSecondary target.",
  DepositFaction:
    "The CharCli wrapper is disabled; using the lower-level SendOrderGuildAdjustFaction target.",
  RemoveActiveTitle:
    "The CharCli wrapper is disabled; using the lower-level SendSetTitleNone target.",
  SetActiveTitle:
    "The CharCli wrapper is disabled; using the lower-level SendSetTitle target.",
});

const contextChainCache = new WeakMap();
const currentPlayerAddressCache = new WeakMap();
const playerAddressCache = new WeakMap();

function getStoredCharacterName(global = globalThis) {
  try {
    return global.localStorage?.getItem("gw.characterName") ?? null;
  } catch (error) {
    return null;
  }
}

function getRuntimePlayer(global = globalThis) {
  return global.GW?.player || null;
}

function safeRead(state, type, address) {
  if (!state?.memory || !address) {
    return null;
  }
  try {
    return state.memory.readType(type, address);
  } catch (error) {
    return null;
  }
}

function safeReadUtf16(state, address, maxUnits = 64) {
  const hook = state?.hook;
  if (!hook || typeof hook.readU16 !== "function" || !address) {
    return "";
  }

  const chars = [];
  const limit = Math.max(0, maxUnits | 0);
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

function safeWriteUtf16(state, address, text, maxUnits) {
  const hook = state?.hook;
  if (!hook || typeof hook.writeU16 !== "function" || !address) {
    return false;
  }

  const value = String(text ?? "");
  const limit = Math.max(0, maxUnits | 0);
  try {
    for (let index = 0; index < limit; index += 1) {
      const codeUnit = index < value.length ? value.charCodeAt(index) : 0;
      hook.writeU16(address + index * 2, codeUnit);
    }
    return true;
  } catch (error) {
    return false;
  }
}

function getDefinition(state, path) {
  return state?.scanner?.getDefinition(path);
}

function getMemoryLimit(state) {
  return Math.max(
    state?.memory?.byteLength || 0,
    state?.hook?.memory?.buffer?.byteLength || 0
  );
}

function isReasonablePointer(state, value) {
  const limit = getMemoryLimit(state);
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0x10000 &&
    value < limit
  );
}

function isReasonablePlayerNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 0x10000;
}

function isReasonableAgentId(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 0x10000000;
}

function isReasonableProfession(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10;
}

function isReasonablePartySize(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 12;
}

function getConfiguredCharacterName(state, global = globalThis) {
  const stored = state.player?.storedCharacterName || getStoredCharacterName(global);
  if (typeof stored === "string" && stored.trim()) {
    return stored.trim();
  }

  const charContextAddress = state.anchors?.charContextAddress || 0;
  if (!charContextAddress) {
    return null;
  }

  const nameOffset = getDefinition(state, "modules.gameplay.charContextAddress.nameOffset");
  const offset =
    typeof nameOffset === "number" && Number.isFinite(nameOffset)
      ? nameOffset | 0
      : 0x74;
  const liveName = safeReadUtf16(state, charContextAddress + offset, 20);
  return liveName || null;
}

function getPlayerNumberFromMapState(state, global = globalThis) {
  const runtimePlayer = getRuntimePlayer(global);
  if (runtimePlayer && typeof runtimePlayer.getPlayerNumber === "function") {
    try {
      const value = runtimePlayer.getPlayerNumber({ scan: false });
      if (isReasonablePlayerNumber(value)) {
        return value | 0;
      }
    } catch (error) {
      // Fall through to GWCAjs-owned state.
    }
  }

  const currentState = state.map?.api?.GetState?.() || state.map?.state || null;
  const value = currentState?.playerNumber;
  if (isReasonablePlayerNumber(value)) {
    return value | 0;
  }
  return getWorldPlayerNumber(state);
}

function readArrayAtAddress(state, address, stride) {
  if (!address) {
    return null;
  }

  const buffer = safeRead(state, "u32", address);
  const capacity = safeRead(state, "u32", address + 4);
  const size = safeRead(state, "u32", address + 8);
  const param = safeRead(state, "u32", address + 12);

  if (!isReasonablePointer(state, buffer)) {
    return null;
  }

  const normalizedSize =
    typeof size === "number" && Number.isFinite(size) && size > 0 ? size : 0;
  const normalizedCapacity =
    typeof capacity === "number" && Number.isFinite(capacity) && capacity > 0
      ? Math.max(capacity, normalizedSize)
      : normalizedSize;
  if (normalizedCapacity <= 0) {
    return null;
  }

  const limit = getMemoryLimit(state);
  const bufferEnd = buffer + normalizedCapacity * stride;
  if (bufferEnd <= buffer || bufferEnd > limit) {
    return null;
  }

  return {
    address,
    buffer,
    bufferEnd,
    capacity: normalizedCapacity,
    param,
    rawCapacity: typeof capacity === "number" && Number.isFinite(capacity) ? capacity : null,
    size: normalizedSize,
    stride,
  };
}

function readArrayHeaderDebugAtAddress(state, address, stride) {
  const normalizedAddress =
    typeof address === "number" && Number.isFinite(address) ? address >>> 0 : 0;
  const normalizedStride =
    typeof stride === "number" && Number.isFinite(stride) && stride > 0
      ? stride | 0
      : PLAYER_SIZE;
  if (!normalizedAddress) {
    return null;
  }

  const buffer = safeRead(state, "u32", normalizedAddress);
  const capacity = safeRead(state, "u32", normalizedAddress + 4);
  const size = safeRead(state, "u32", normalizedAddress + 8);
  const param = safeRead(state, "u32", normalizedAddress + 0xc);
  const slotCount =
    Math.max(
      typeof capacity === "number" && Number.isFinite(capacity) ? capacity : 0,
      typeof size === "number" && Number.isFinite(size) ? size : 0
    ) | 0;
  const bufferEnd =
    typeof buffer === "number" && Number.isFinite(buffer) && slotCount > 0
      ? buffer + slotCount * normalizedStride
      : 0;
  const limit = getMemoryLimit(state);

  return {
    address: normalizedAddress,
    buffer,
    bufferEnd,
    bufferReasonable: isReasonablePointer(state, buffer),
    capacity,
    param,
    size,
    slotCount,
    stride: normalizedStride,
    withinMemory:
      bufferEnd > buffer &&
      typeof buffer === "number" &&
      Number.isFinite(buffer) &&
      bufferEnd <= limit,
  };
}

function readU32RowsAtOffsets(state, address, offsets) {
  const normalizedAddress =
    typeof address === "number" && Number.isFinite(address) ? address >>> 0 : 0;
  if (!normalizedAddress || !Array.isArray(offsets)) {
    return [];
  }

  return offsets.map((offset) => {
    const normalizedOffset =
      typeof offset === "number" && Number.isFinite(offset) ? offset | 0 : 0;
    const slotAddress = (normalizedAddress + normalizedOffset) >>> 0;
    const value = safeRead(state, "u32", slotAddress);
    return {
      isReasonablePointer: isReasonablePointer(state, value),
      offset: normalizedOffset,
      slotAddress,
      value,
    };
  });
}

function getArraySlotCount(array) {
  if (!array) {
    return 0;
  }
  const size =
    typeof array.size === "number" && Number.isFinite(array.size) && array.size > 0
      ? array.size
      : 0;
  const capacity =
    typeof array.capacity === "number" &&
    Number.isFinite(array.capacity) &&
    array.capacity > 0
      ? array.capacity
      : 0;
  return Math.max(size, capacity) | 0;
}

function getCharContextPlayerNumber(state) {
  const charContextAddress = state.anchors?.charContextAddress || 0;
  if (!charContextAddress) {
    return 0;
  }
  const playerNumber = safeRead(
    state,
    "u32",
    charContextAddress + CHAR_CONTEXT_OFFSETS.playerNumber
  );
  return isReasonablePlayerNumber(playerNumber) ? playerNumber | 0 : 0;
}

function findReferencesToAddress(state, targetAddress, options = {}) {
  const normalizedTarget =
    typeof targetAddress === "number" && Number.isFinite(targetAddress)
      ? targetAddress >>> 0
      : 0;
  if (!normalizedTarget) {
    return [];
  }

  const limit =
    typeof options.limit === "number" && options.limit > 0 ? options.limit | 0 : 512;
  const start =
    typeof options.start === "number" && options.start >= 0 ? options.start | 0 : 0;
  const end =
    typeof options.end === "number" && options.end > start
      ? Math.min(options.end | 0, getMemoryLimit(state))
      : getMemoryLimit(state);

  if (typeof state?.hook?.scanU32 === "function") {
    try {
      return state.hook.scanU32(normalizedTarget, start, end, limit);
    } catch (error) {
      return [];
    }
  }

  const buffer = state?.hook?.memory?.buffer;
  if (!buffer || start >= end) {
    return [];
  }

  const view = new DataView(buffer);
  const alignedStart = start + ((4 - (start % 4)) % 4);
  const alignedEnd = Math.min(end, buffer.byteLength);
  const matches = [];
  for (
    let address = alignedStart;
    address <= alignedEnd - 4 && matches.length < limit;
    address += 4
  ) {
    if (view.getUint32(address, true) === normalizedTarget) {
      matches.push(address);
    }
  }
  return matches;
}

function validateWorldContextCandidate(state, worldContextAddress, expectedPlayerNumber) {
  if (!isReasonablePointer(state, worldContextAddress)) {
    return null;
  }

  const worldPlayerNumber = safeRead(
    state,
    "u32",
    worldContextAddress + WORLD_CONTEXT_OFFSETS.playerNumber
  );
  if (!isReasonablePlayerNumber(worldPlayerNumber)) {
    return null;
  }
  if (
    isReasonablePlayerNumber(expectedPlayerNumber) &&
    worldPlayerNumber !== expectedPlayerNumber
  ) {
    return null;
  }

  const stride = getDefinition(state, "modules.player.propArrayLayout.stride");
  const normalizedStride =
    typeof stride === "number" && stride > 0 ? stride | 0 : 0x50;
  const playerArray = readArrayAtAddress(
    state,
    worldContextAddress + WORLD_CONTEXT_OFFSETS.players,
    normalizedStride
  );
  if (!playerArray) {
    return null;
  }

  const playerControlledCharAddress = safeRead(
    state,
    "u32",
    worldContextAddress + WORLD_CONTEXT_OFFSETS.playerControlledChar
  );
  const hasPlayerControlledChar = isReasonablePointer(
    state,
    playerControlledCharAddress
  );

  return {
    controlledCharacterAgentId: hasPlayerControlledChar
      ? safeRead(
          state,
          "u32",
          playerControlledCharAddress + PLAYER_CONTROLLED_CHARACTER_OFFSETS.agentId
        )
      : null,
    controlledCharacterCompositeId: hasPlayerControlledChar
      ? safeRead(
          state,
          "u32",
          playerControlledCharAddress + PLAYER_CONTROLLED_CHARACTER_OFFSETS.compositeId
        )
      : null,
    playerArray,
    playerControlledCharAddress: hasPlayerControlledChar
      ? playerControlledCharAddress >>> 0
      : null,
    worldContextAddress: worldContextAddress >>> 0,
    worldPlayerNumber: worldPlayerNumber | 0,
  };
}

function describeWorldContextCandidate(state, worldContextAddress, expectedPlayerNumber) {
  const normalizedAddress =
    typeof worldContextAddress === "number" && Number.isFinite(worldContextAddress)
      ? worldContextAddress >>> 0
      : 0;
  const stride = getDefinition(state, "modules.player.propArrayLayout.stride");
  const normalizedStride =
    typeof stride === "number" && stride > 0 ? stride | 0 : PLAYER_SIZE;
  const playerNumber = normalizedAddress
    ? safeRead(state, "u32", normalizedAddress + WORLD_CONTEXT_OFFSETS.playerNumber)
    : null;
  const playerControlledCharAddress = normalizedAddress
    ? safeRead(
        state,
        "u32",
        normalizedAddress + WORLD_CONTEXT_OFFSETS.playerControlledChar
      )
    : null;
  const playerArrayHeader = normalizedAddress
    ? readArrayHeaderDebugAtAddress(
        state,
        normalizedAddress + WORLD_CONTEXT_OFFSETS.players,
        normalizedStride
      )
    : null;
  const titleArrayHeader = normalizedAddress
    ? readArrayHeaderDebugAtAddress(
        state,
        normalizedAddress + WORLD_CONTEXT_OFFSETS.titles,
        TITLE_SIZE
      )
    : null;

  let rejection = null;
  if (!isReasonablePointer(state, normalizedAddress)) {
    rejection = "not-pointer";
  } else if (!isReasonablePlayerNumber(playerNumber)) {
    rejection = "player-number-invalid";
  } else if (
    isReasonablePlayerNumber(expectedPlayerNumber) &&
    playerNumber !== expectedPlayerNumber
  ) {
    rejection = "player-number-mismatch";
  } else if (
    !playerArrayHeader?.bufferReasonable ||
    !playerArrayHeader?.withinMemory ||
    playerArrayHeader.slotCount <= 0
  ) {
    rejection = "player-array-invalid";
  }

  return {
    rejection,
    playerArrayHeader,
    playerControlledCharAddress,
    playerControlledCharPointer: isReasonablePointer(state, playerControlledCharAddress),
    playerNumber,
    titleArrayHeader,
  };
}

function getPointerRowsInRange(state, address, byteLength) {
  const normalizedAddress =
    typeof address === "number" && Number.isFinite(address) ? address >>> 0 : 0;
  const normalizedByteLength =
    typeof byteLength === "number" && Number.isFinite(byteLength) && byteLength > 0
      ? byteLength | 0
      : 0;
  if (!normalizedAddress || normalizedByteLength <= 0) {
    return [];
  }

  const rows = [];
  for (let offset = 0; offset < normalizedByteLength; offset += 4) {
    const slotAddress = (normalizedAddress + offset) >>> 0;
    const value = safeRead(state, "u32", slotAddress);
    if (!isReasonablePointer(state, value)) {
      continue;
    }
    rows.push({
      offset,
      slotAddress,
      value: value >>> 0,
    });
  }
  return rows;
}

function validateGameContextCandidate(state, gameContextAddress, source) {
  if (!isReasonablePointer(state, gameContextAddress)) {
    return null;
  }

  const charContextAddress = state.anchors?.charContextAddress || 0;
  if (charContextAddress) {
    const candidateCharContext = safeRead(
      state,
      "u32",
      gameContextAddress + GAME_CONTEXT_OFFSETS.character
    );
    if (candidateCharContext !== charContextAddress) {
      return null;
    }
  }

  const expectedPlayerNumber = getCharContextPlayerNumber(state);
  const worldContextAddress = safeRead(
    state,
    "u32",
    gameContextAddress + GAME_CONTEXT_OFFSETS.world
  );
  const world = validateWorldContextCandidate(
    state,
    worldContextAddress,
    expectedPlayerNumber
  );
  if (!world) {
    return null;
  }

  return {
    ...world,
    charContextAddress: charContextAddress || 0,
    expectedPlayerNumber: expectedPlayerNumber || 0,
    gameContextAddress: gameContextAddress >>> 0,
    source,
  };
}

function describeGameContextCandidate(state, gameContextAddress, expectedPlayerNumber) {
  const normalizedAddress =
    typeof gameContextAddress === "number" && Number.isFinite(gameContextAddress)
      ? gameContextAddress >>> 0
      : 0;
  const charContextAddress = state.anchors?.charContextAddress || 0;
  const candidateCharContext = normalizedAddress
    ? safeRead(state, "u32", normalizedAddress + GAME_CONTEXT_OFFSETS.character)
    : null;
  const worldContextAddress = normalizedAddress
    ? safeRead(state, "u32", normalizedAddress + GAME_CONTEXT_OFFSETS.world)
    : null;
  const worldDetail = describeWorldContextCandidate(
    state,
    worldContextAddress,
    expectedPlayerNumber
  );

  let rejection = null;
  if (!isReasonablePointer(state, normalizedAddress)) {
    rejection = "not-pointer";
  } else if (charContextAddress && candidateCharContext !== charContextAddress) {
    rejection = "char-context-mismatch";
  } else if (worldDetail.rejection) {
    rejection = "world-" + worldDetail.rejection;
  }

  return {
    candidateCharContext,
    charContextMatches:
      !!charContextAddress && candidateCharContext === charContextAddress,
    rejection,
    worldContextAddress,
    worldDetail,
  };
}

function normalizeOffsetList(value, fallback) {
  if (!Array.isArray(value)) {
    return fallback.slice();
  }

  const offsets = value
    .filter((offset) => typeof offset === "number" && Number.isFinite(offset))
    .map((offset) => offset | 0)
    .filter((offset) => offset >= 0);
  return offsets.length > 0 ? Array.from(new Set(offsets)) : fallback.slice();
}

function createAlignedOffsets(start, end, step = 4) {
  const offsets = [];
  const normalizedStart =
    typeof start === "number" && Number.isFinite(start) ? start | 0 : 0;
  const normalizedEnd =
    typeof end === "number" && Number.isFinite(end) ? end | 0 : normalizedStart;
  const normalizedStep =
    typeof step === "number" && Number.isFinite(step) && step > 0 ? step | 0 : 4;
  for (
    let offset = Math.max(0, normalizedStart);
    offset <= normalizedEnd;
    offset += normalizedStep
  ) {
    offsets.push(offset);
  }
  return offsets;
}

function findGameContextCandidates(state, options = {}) {
  const charContextAddress =
    typeof options.charContextAddress === "number" &&
    Number.isFinite(options.charContextAddress)
      ? options.charContextAddress >>> 0
      : state.anchors?.charContextAddress || 0;
  if (!isReasonablePointer(state, charContextAddress)) {
    return {
      candidates: [],
      charContextAddress,
      error: "missing-char-context",
      referenceSlots: [],
    };
  }

  const strict = options.strict !== false;
  const charOffsets = normalizeOffsetList(
    options.charOffsets,
    strict
      ? [GAME_CONTEXT_OFFSETS.character]
      : createAlignedOffsets(0, 0x80)
  );
  const worldOffsets = normalizeOffsetList(
    options.worldOffsets,
    strict
      ? [GAME_CONTEXT_OFFSETS.world]
      : createAlignedOffsets(0, 0x80)
  );
  const referenceSlots = findReferencesToAddress(state, charContextAddress, {
    end: options.end,
    limit:
      typeof options.referenceLimit === "number" && options.referenceLimit > 0
        ? options.referenceLimit | 0
        : 4096,
    start: options.start,
  });
  const expectedPlayerNumber = getCharContextPlayerNumber(state);
  const maxRejected =
    typeof options.maxRejected === "number" && options.maxRejected >= 0
      ? options.maxRejected | 0
      : 64;
  const rejected = [];
  const results = [];
  const seen = new Set();

  for (const referenceSlot of referenceSlots) {
    for (const charOffset of charOffsets) {
      const gameContextAddress = (referenceSlot - charOffset) >>> 0;
      if (!isReasonablePointer(state, gameContextAddress)) {
        continue;
      }

      const candidateCharContext = safeRead(
        state,
        "u32",
        gameContextAddress + charOffset
      );
      if (candidateCharContext !== charContextAddress) {
        continue;
      }

      for (const worldOffset of worldOffsets) {
        const worldContextAddress = safeRead(
          state,
          "u32",
          gameContextAddress + worldOffset
        );
        const worldDetail = describeWorldContextCandidate(
          state,
          worldContextAddress,
          expectedPlayerNumber
        );
        const valid = !worldDetail.rejection;
        const key =
          gameContextAddress + ":" + charOffset + ":" + worldOffset + ":" + worldContextAddress;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);

        const entry = {
          charContextAddress,
          charOffset,
          expectedPlayerNumber,
          gameContextAddress,
          referenceSlot,
          valid,
          worldContextAddress,
          worldDetail,
          worldOffset,
        };
        if (valid) {
          results.push(entry);
        } else if (rejected.length < maxRejected) {
          rejected.push(entry);
        }
      }
    }
  }

  results.sort((left, right) => {
    if (left.charOffset !== right.charOffset) {
      return left.charOffset - right.charOffset;
    }
    if (left.worldOffset !== right.worldOffset) {
      return left.worldOffset - right.worldOffset;
    }
    return left.gameContextAddress - right.gameContextAddress;
  });

  return {
    candidates: results.slice(
      0,
      typeof options.limit === "number" && options.limit > 0 ? options.limit | 0 : 32
    ),
    charContextAddress,
    charOffsets,
    expectedPlayerNumber,
    referenceSlots,
    rejected,
    worldOffsets,
  };
}

function getCharContextContextCandidates(state) {
  const charContextAddress = state.anchors?.charContextAddress || 0;
  if (!isReasonablePointer(state, charContextAddress)) {
    return [];
  }

  const expectedPlayerNumber = getCharContextPlayerNumber(state);
  const rows = getPointerRowsInRange(
    state,
    charContextAddress,
    CHAR_CONTEXT_POINTER_SCAN_BYTES
  );
  const candidates = [];
  const seen = new Set();

  for (const row of rows) {
    const game = validateGameContextCandidate(
      state,
      row.value,
      "charContextPointer+0x" + row.offset.toString(16)
    );
    if (game) {
      const key = "game:" + row.value;
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push({
          ...game,
          kind: "gameContext",
          pointerOffset: row.offset,
          pointerSlotAddress: row.slotAddress,
          pointerValue: row.value,
          valid: true,
        });
      }
      continue;
    }

    const world = validateWorldContextCandidate(
      state,
      row.value,
      expectedPlayerNumber
    );
    if (world) {
      const key = "world:" + row.value;
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push({
          ...world,
          expectedPlayerNumber: expectedPlayerNumber || 0,
          gameContextAddress: 0,
          kind: "worldContext",
          pointerOffset: row.offset,
          pointerSlotAddress: row.slotAddress,
          pointerValue: row.value,
          source: "charContextPointer+0x" + row.offset.toString(16),
          valid: true,
        });
      }
    }
  }

  return candidates;
}

function describeCharContextPointerCandidates(state, limit = 64) {
  const charContextAddress = state.anchors?.charContextAddress || 0;
  if (!isReasonablePointer(state, charContextAddress)) {
    return [];
  }

  const expectedPlayerNumber = getCharContextPlayerNumber(state);
  const rows = getPointerRowsInRange(
    state,
    charContextAddress,
    CHAR_CONTEXT_POINTER_SCAN_BYTES
  );

  return rows.map((row) => {
    const gameDetail = describeGameContextCandidate(
      state,
      row.value,
      expectedPlayerNumber
    );
    const worldDetail = describeWorldContextCandidate(
      state,
      row.value,
      expectedPlayerNumber
    );
    return {
      gameDetail,
      offset: row.offset,
      pointerSlotAddress: row.slotAddress,
      pointerValue: row.value,
      validGameContext: !gameDetail.rejection,
      validWorldContext: !worldDetail.rejection,
      worldDetail,
    };
  }).sort((left, right) => {
    const leftScore = (left.validGameContext ? 2 : 0) + (left.validWorldContext ? 1 : 0);
    const rightScore = (right.validGameContext ? 2 : 0) + (right.validWorldContext ? 1 : 0);
    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }
    return left.offset - right.offset;
  }).slice(0, Math.max(0, limit | 0));
}

function resolveContextChain(state, options = {}) {
  const allowReferenceScan = options.allowReferenceScan === true;
  const charContextAddress = state.anchors?.charContextAddress || 0;
  const expectedPlayerNumber = getCharContextPlayerNumber(state);
  const memoryLimit = getMemoryLimit(state);
  const cached = contextChainCache.get(state);
  if (
    cached &&
    cached.charContextAddress === charContextAddress &&
    cached.expectedPlayerNumber === expectedPlayerNumber &&
    cached.memoryLimit === memoryLimit
  ) {
    const validCached = validateGameContextCandidate(
      state,
      cached.gameContextAddress,
      cached.source
    );
    if (validCached) {
      return validCached;
    }
  }

  const anchorContextAddress = state.anchors?.gameplayContextAddress || 0;
  const direct = validateGameContextCandidate(
    state,
    anchorContextAddress,
    "anchorContextAddress"
  );
  if (direct) {
    contextChainCache.set(state, { ...direct, memoryLimit });
    return direct;
  }

  if (!charContextAddress) {
    return null;
  }

  const charContextCandidates = getCharContextContextCandidates(state);
  if (charContextCandidates.length > 0) {
    const resolved = charContextCandidates[0];
    contextChainCache.set(state, {
      ...resolved,
      memoryLimit,
    });
    return resolved;
  }

  if (!allowReferenceScan) {
    return null;
  }

  const referenceSlots = findReferencesToAddress(state, charContextAddress, {
    limit: 512,
  });
  for (const slotAddress of referenceSlots) {
    const gameContextAddress = (slotAddress - GAME_CONTEXT_OFFSETS.character) >>> 0;
    const resolved = validateGameContextCandidate(
      state,
      gameContextAddress,
      "charContextReference"
    );
    if (resolved) {
      contextChainCache.set(state, {
        ...resolved,
        memoryLimit,
      });
      return resolved;
    }
  }

  return null;
}

function promoteGameContextAddress(state, address) {
  const normalizedAddress =
    typeof address === "number" && Number.isFinite(address) ? address >>> 0 : 0;
  const resolved = validateGameContextCandidate(
    state,
    normalizedAddress,
    "promotedGameContext"
  );
  if (!resolved) {
    return {
      available: false,
      address: normalizedAddress,
      detail: describeGameContextCandidate(
        state,
        normalizedAddress,
        getCharContextPlayerNumber(state)
      ),
      error: "GameContext candidate did not validate",
    };
  }

  state.anchors = Object.freeze({
    ...(state.anchors || {}),
    charContextAddress: resolved.charContextAddress || state.anchors?.charContextAddress || 0,
    gameplayContextAddress: resolved.gameContextAddress,
    mapContextAddress:
      safeRead(state, "u32", resolved.gameContextAddress + GAME_CONTEXT_OFFSETS.map) ||
      state.anchors?.mapContextAddress ||
      0,
  });
  contextChainCache.set(state, {
    ...resolved,
    memoryLimit: getMemoryLimit(state),
  });

  return {
    available: true,
    ...resolved,
    anchors: state.anchors,
  };
}

function promoteGameContextFromCurrentCharContext(state, options = {}) {
  const search = findGameContextCandidates(state, {
    limit: 1,
    maxRejected: 32,
    referenceLimit: 8192,
    ...options,
    strict: options.strict !== false,
  });
  const candidate = search.candidates[0] || null;
  if (!candidate) {
    return {
      available: false,
      error: "No validating GameContext candidate found",
      search,
    };
  }

  const promoted = promoteGameContextAddress(state, candidate.gameContextAddress);
  return {
    ...promoted,
    candidate,
    search,
  };
}

function getWorldContextAddress(state) {
  return resolveContextChain(state)?.worldContextAddress || 0;
}

function getWorldPlayerNumber(state) {
  const resolved = resolveContextChain(state);
  return resolved?.worldPlayerNumber || 0;
}

function getDirectWorldContextAddress(state) {
  const gameContextAddress = state.anchors?.gameplayContextAddress || 0;
  const expectedPlayerNumber = getCharContextPlayerNumber(state);
  if (isReasonablePointer(state, gameContextAddress)) {
    for (const offset of GAME_CONTEXT_WORLD_POINTER_OFFSETS) {
      const worldContextAddress = safeRead(state, "u32", gameContextAddress + offset);
      const world = validateWorldContextCandidate(
        state,
        worldContextAddress,
        expectedPlayerNumber
      );
      if (world) {
        return world.worldContextAddress;
      }
    }
  }

  const anchoredMapContextAddress = state.anchors?.mapContextAddress || 0;
  const anchoredWorld = validateWorldContextCandidate(
    state,
    anchoredMapContextAddress,
    expectedPlayerNumber
  );
  if (anchoredWorld?.worldContextAddress) {
    return anchoredWorld.worldContextAddress;
  }

  const charContextCandidates = getCharContextContextCandidates(state);
  return charContextCandidates[0]?.worldContextAddress || 0;
}

function getDirectCurrentPlayerNumber(state) {
  const playerNumber = getMissionPlayerNumber(
    state,
    getCharContextPlayerNumber(state)
  );
  if (isReasonablePlayerNumber(playerNumber)) {
    return playerNumber | 0;
  }

  const worldContextAddress = getDirectWorldContextAddress(state);
  if (!worldContextAddress) {
    return 0;
  }

  const worldPlayerNumber = safeRead(
    state,
    "u32",
    worldContextAddress + WORLD_CONTEXT_OFFSETS.playerNumber
  );
  return isReasonablePlayerNumber(worldPlayerNumber) ? worldPlayerNumber | 0 : 0;
}

function resolveCurrentPlayerAddressFromPropContext(state) {
  const playerNumber = getDirectCurrentPlayerNumber(state);
  if (!isReasonablePlayerNumber(playerNumber)) {
    return 0;
  }

  const playerPropId = getDefinition(state, "modules.player.playerPropId");
  if (typeof playerPropId !== "number" || !Number.isFinite(playerPropId)) {
    return 0;
  }

  const playerArray = readPropArrayById(state, playerPropId | 0);
  if (!playerArray || playerNumber >= getArraySlotCount(playerArray)) {
    return 0;
  }

  const address = (playerArray.buffer + playerNumber * playerArray.stride) >>> 0;
  const agentId = safeRead(state, "u32", address + PLAYER_OFFSETS.agentId);
  if (!isReasonableAgentId(agentId)) {
    return 0;
  }

  setCurrentPlayerAddressCache(state, address, playerNumber);
  return address;
}

function resolveCurrentPlayerAddressFast(state) {
  const cachedAgentId = getCachedCurrentPlayerAgentId(state);
  const cached = currentPlayerAddressCache.get(state);
  if (cachedAgentId && isReasonablePointer(state, cached?.address)) {
    return cached.address >>> 0;
  }

  const propAddress = resolveCurrentPlayerAddressFromPropContext(state);
  if (propAddress) {
    return propAddress;
  }

  const worldContextAddress = getDirectWorldContextAddress(state);
  const playerNumber = getDirectCurrentPlayerNumber(state);
  if (!worldContextAddress || !isReasonablePlayerNumber(playerNumber)) {
    return 0;
  }

  const stride = getDefinition(state, "modules.player.propArrayLayout.stride");
  const normalizedStride =
    typeof stride === "number" && stride > 0 ? stride | 0 : PLAYER_SIZE;
  const playerArray = readArrayAtAddress(
    state,
    worldContextAddress + WORLD_CONTEXT_OFFSETS.players,
    normalizedStride
  );
  if (!playerArray || playerNumber >= getArraySlotCount(playerArray)) {
    return 0;
  }

  const address = (playerArray.buffer + playerNumber * playerArray.stride) >>> 0;
  const agentId = safeRead(state, "u32", address + PLAYER_OFFSETS.agentId);
  if (isReasonableAgentId(agentId)) {
    setCurrentPlayerAddressCache(state, address, playerNumber);
    return address;
  }
  return 0;
}

function describeFastPlayerPath(state) {
  const charContextAddress = state.anchors?.charContextAddress || 0;
  const contextSlotAddress = state.anchors?.contextSlotAddress || 0;
  const gameplayContextAddress = state.anchors?.gameplayContextAddress || 0;
  const expectedPlayerNumber = getCharContextPlayerNumber(state);
  const playerPropId = getDefinition(state, "modules.player.playerPropId");
  const missionPropId = getDefinition(state, "modules.player.missionPropId");
  const missionPlayerNumber = getMissionPlayerNumber(state, 0);
  const propPlayerNumber = getMissionPlayerNumber(state, expectedPlayerNumber);
  const propPlayerArray =
    typeof playerPropId === "number"
      ? readPropArrayById(state, playerPropId | 0)
      : null;
  const propPlayerAddress =
    propPlayerArray &&
    isReasonablePlayerNumber(propPlayerNumber) &&
    propPlayerNumber < getArraySlotCount(propPlayerArray)
      ? (propPlayerArray.buffer + propPlayerNumber * propPlayerArray.stride) >>> 0
      : 0;
  const propPlayerAgentId = propPlayerAddress
    ? safeRead(state, "u32", propPlayerAddress + PLAYER_OFFSETS.agentId)
    : null;
  const contextSlotValue = isReasonablePointer(state, contextSlotAddress)
    ? safeRead(state, "u32", contextSlotAddress)
    : null;
  const gameContextCharSlotValue = isReasonablePointer(state, gameplayContextAddress)
    ? safeRead(state, "u32", gameplayContextAddress + GAME_CONTEXT_OFFSETS.character)
    : null;
  const worldCandidates = GAME_CONTEXT_WORLD_POINTER_OFFSETS.map((offset) => {
    const address = isReasonablePointer(state, gameplayContextAddress)
      ? safeRead(state, "u32", gameplayContextAddress + offset)
      : null;
    const world = validateWorldContextCandidate(
      state,
      address,
      expectedPlayerNumber
    );
    const detail = describeWorldContextCandidate(
      state,
      address,
      expectedPlayerNumber
    );
    return {
      address,
      offset,
      rejection: detail.rejection,
      valid: !!world,
      playerArrayHeader: detail.playerArrayHeader,
      playerControlledCharAddress: detail.playerControlledCharAddress,
      playerControlledCharPointer: detail.playerControlledCharPointer,
      rawWorldPlayerNumber: detail.playerNumber,
      titleArrayHeader: detail.titleArrayHeader,
      worldPlayerNumber: world?.worldPlayerNumber ?? null,
    };
  });
  const worldContextAddress = getDirectWorldContextAddress(state);
  const charPlayerNumber = getCharContextPlayerNumber(state);
  const worldPlayerNumber = worldContextAddress
    ? safeRead(state, "u32", worldContextAddress + WORLD_CONTEXT_OFFSETS.playerNumber)
    : null;
  const playerNumber = getDirectCurrentPlayerNumber(state);
  const stride = getDefinition(state, "modules.player.propArrayLayout.stride");
  const normalizedStride =
    typeof stride === "number" && stride > 0 ? stride | 0 : PLAYER_SIZE;
  const playerArray = worldContextAddress
    ? readArrayAtAddress(
        state,
        worldContextAddress + WORLD_CONTEXT_OFFSETS.players,
        normalizedStride
      )
    : null;
  const playerAddress =
    playerArray &&
    isReasonablePlayerNumber(playerNumber) &&
    playerNumber < getArraySlotCount(playerArray)
      ? (playerArray.buffer + playerNumber * playerArray.stride) >>> 0
      : 0;
  const playerAgentId = playerAddress
    ? safeRead(state, "u32", playerAddress + PLAYER_OFFSETS.agentId)
    : null;
  const playerControlledCharAddress = worldContextAddress
    ? safeRead(
        state,
        "u32",
        worldContextAddress + WORLD_CONTEXT_OFFSETS.playerControlledChar
      )
    : null;
  const controlledAgentId = isReasonablePointer(state, playerControlledCharAddress)
    ? safeRead(
        state,
        "u32",
        playerControlledCharAddress + PLAYER_CONTROLLED_CHARACTER_OFFSETS.agentId
      )
    : null;

  return {
    cachedAgentId: getCachedCurrentPlayerAgentId(state),
    charContextAddress,
    charContextDebugRows: readU32RowsAtOffsets(
      state,
      charContextAddress,
      CHAR_CONTEXT_DEBUG_OFFSETS
    ),
    charContextPointerCandidates: describeCharContextPointerCandidates(state),
    charContextMatchesGameplayContext:
      !!charContextAddress && charContextAddress === gameplayContextAddress,
    charContextMatchesContextSlotValue:
      !!charContextAddress && charContextAddress === contextSlotValue,
    charPlayerNumber,
    contextSlotAddress,
    contextSlotValue,
    controlledAgentId,
    controlledAgentIdReasonable: isReasonableAgentId(controlledAgentId),
    gameContextCharSlotValue,
    gameContextCharSlotMatchesCharContext:
      !!charContextAddress && gameContextCharSlotValue === charContextAddress,
    gameplayContextAddress,
    missionContextAddress:
      typeof missionPropId === "number" ? getPropHandle(state, missionPropId | 0) : null,
    missionPropDebug:
      typeof missionPropId === "number" ? readPropArrayDebug(state, missionPropId | 0) : null,
    missionPlayerNumber,
    playerAddress,
    playerAgentId,
    playerAgentIdReasonable: isReasonableAgentId(playerAgentId),
    playerArray,
    playerControlledCharAddress,
    playerNumber,
    playerPropArray: propPlayerArray,
    playerPropDebug:
      typeof playerPropId === "number" ? readPropArrayDebug(state, playerPropId | 0) : null,
    playerPropId,
    propContextActiveTableAddress: getPropContextTableAddressActiveOnly(state),
    propContextTableAddress: getPropContextTableAddress(state),
    propContextTableInfo: getPropContextTableInfo(state),
    propPlayerAddress,
    propPlayerAgentId,
    propPlayerAgentIdReasonable: isReasonableAgentId(propPlayerAgentId),
    propPlayerNumber,
    resolvedFastAddress: resolveCurrentPlayerAddressFast(state),
    worldContextAddress,
    worldCandidates,
    worldPlayerNumber,
  };
}

function getControlledCharacterAgentId(state, options = {}) {
  const allowSlowFallback = options.allowSlowFallback === true;
  const cachedAgentId = getCachedCurrentPlayerAgentId(state);
  if (cachedAgentId) {
    return cachedAgentId;
  }

  const currentPlayerAddress = resolveCurrentPlayerAddressFast(state);
  if (currentPlayerAddress) {
    const playerAgentId = safeRead(
      state,
      "u32",
      currentPlayerAddress + PLAYER_OFFSETS.agentId
    );
    if (isReasonableAgentId(playerAgentId)) {
      return playerAgentId >>> 0;
    }
  }

  const worldContextAddress = getDirectWorldContextAddress(state);
  if (worldContextAddress) {
    const playerControlledCharAddress = safeRead(
      state,
      "u32",
      worldContextAddress + WORLD_CONTEXT_OFFSETS.playerControlledChar
    );
    if (isReasonablePointer(state, playerControlledCharAddress)) {
      const agentId = safeRead(
        state,
        "u32",
        playerControlledCharAddress + PLAYER_CONTROLLED_CHARACTER_OFFSETS.agentId
      );
      if (isReasonableAgentId(agentId)) {
        return agentId >>> 0;
      }
    }
  }

  if (!allowSlowFallback) {
    return 0;
  }

  const resolved = resolveContextChain(state);
  return isReasonableAgentId(resolved?.controlledCharacterAgentId)
    ? resolved.controlledCharacterAgentId >>> 0
    : 0;
}

function resolveWorldPlayerArray(state) {
  const resolved = resolveContextChain(state);
  if (!resolved?.worldContextAddress) {
    return null;
  }

  const array = resolved.playerArray;
  return array
    ? {
        ...array,
        contextSource: resolved.source,
        gameContextAddress: resolved.gameContextAddress,
        source: "worldContext",
        worldContextAddress: resolved.worldContextAddress,
      }
    : null;
}

function getPropContextTableInfo(state) {
  const slotAddress = getDefinition(state, "modules.player.propContextTableSlotAddress");
  const normalizedSlotAddress =
    typeof slotAddress === "number" && Number.isFinite(slotAddress) && slotAddress > 0
      ? slotAddress >>> 0
      : 0;
  const slotValue = normalizedSlotAddress
    ? safeRead(state, "u32", normalizedSlotAddress)
    : null;
  if (isReasonablePointer(state, slotValue)) {
    return {
      address: slotValue >>> 0,
      defaultAddress: getDefinition(state, "modules.player.propContextDefaultAddress") || 0,
      source: "activeSlot",
      slotAddress: normalizedSlotAddress,
      slotValue,
    };
  }

  const defaultAddress = getDefinition(state, "modules.player.propContextDefaultAddress");
  const normalizedDefaultAddress =
    typeof defaultAddress === "number" &&
    Number.isFinite(defaultAddress) &&
    defaultAddress > 0
      ? defaultAddress >>> 0
      : 0;
  if (isReasonablePointer(state, normalizedDefaultAddress)) {
    return {
      address: normalizedDefaultAddress,
      defaultAddress: normalizedDefaultAddress,
      source: "defaultTable",
      slotAddress: normalizedSlotAddress,
      slotValue,
    };
  }

  return {
    address: 0,
    defaultAddress: normalizedDefaultAddress,
    source: "missing",
    slotAddress: normalizedSlotAddress,
    slotValue,
  };
}

function getPropContextTableAddress(state) {
  return getPropContextTableInfo(state).address || 0;
}

function getPropContextTableAddressActiveOnly(state) {
  const slotAddress = getDefinition(state, "modules.player.propContextTableSlotAddress");
  const normalizedSlotAddress =
    typeof slotAddress === "number" && Number.isFinite(slotAddress) && slotAddress > 0
      ? slotAddress >>> 0
      : 0;
  if (!normalizedSlotAddress) {
    return 0;
  }
  const tableAddress = safeRead(state, "u32", normalizedSlotAddress);
  if (isReasonablePointer(state, tableAddress)) {
    return tableAddress >>> 0;
  }
  return 0;
}

function getPropHandle(state, propId) {
  const tableAddress = getPropContextTableAddress(state);
  if (!tableAddress || !Number.isInteger(propId) || propId < 0) {
    return null;
  }
  const handle = safeRead(state, "u32", tableAddress + propId * 4);
  return typeof handle === "number" && Number.isFinite(handle) && handle !== 0
    ? handle >>> 0
    : null;
}

function readPropArrayById(state, propId) {
  const layout = getDefinition(state, "modules.player.propArrayLayout");
  if (!layout || typeof layout !== "object") {
    return null;
  }

  const handle = getPropHandle(state, propId);
  if (handle === null) {
    return null;
  }

  const bufferBase =
    typeof layout.bufferBase === "number" ? layout.bufferBase >>> 0 : 0;
  const capacityBase =
    typeof layout.capacityBase === "number" ? layout.capacityBase >>> 0 : 0;
  const sizeBase =
    typeof layout.sizeBase === "number" ? layout.sizeBase >>> 0 : 0;
  const paramBase =
    typeof layout.paramBase === "number" ? layout.paramBase >>> 0 : 0;
  const stride =
    typeof layout.stride === "number" && layout.stride > 0
      ? layout.stride | 0
      : 0x50;

  const buffer = safeRead(state, "u32", bufferBase + handle);
  const capacity = safeRead(state, "u32", capacityBase + handle);
  const size = safeRead(state, "u32", sizeBase + handle);
  const param = safeRead(state, "u32", paramBase + handle);

  if (!isReasonablePointer(state, buffer)) {
    return null;
  }

  const normalizedSize =
    typeof size === "number" && Number.isFinite(size) && size > 0 ? size : 0;
  const normalizedCapacity =
    typeof capacity === "number" && Number.isFinite(capacity) && capacity > 0
      ? Math.max(capacity, normalizedSize)
      : normalizedSize;
  if (normalizedCapacity <= 0) {
    return null;
  }

  const limit = getMemoryLimit(state);
  const bufferEnd = buffer + normalizedCapacity * stride;
  if (bufferEnd <= buffer || bufferEnd > limit) {
    return null;
  }

  return {
    buffer,
    bufferEnd,
    capacity: normalizedCapacity,
    handle,
    param,
    propId,
    rawCapacity: typeof capacity === "number" && Number.isFinite(capacity) ? capacity : null,
    rawSize: typeof size === "number" && Number.isFinite(size) ? size : null,
    size: normalizedSize,
    stride,
    tableAddress: getPropContextTableAddress(state),
    tableSource: getPropContextTableInfo(state).source,
  };
}

function readPropArrayDebug(state, propId) {
  const layout = getDefinition(state, "modules.player.propArrayLayout");
  const handle = getPropHandle(state, propId);
  if (!layout || typeof layout !== "object") {
    return {
      error: "missing-layout",
      handle,
      propId,
      tableInfo: getPropContextTableInfo(state),
    };
  }
  if (handle === null) {
    return {
      error: "missing-handle",
      handle,
      propId,
      tableInfo: getPropContextTableInfo(state),
    };
  }

  const bufferBase =
    typeof layout.bufferBase === "number" ? layout.bufferBase >>> 0 : 0;
  const capacityBase =
    typeof layout.capacityBase === "number" ? layout.capacityBase >>> 0 : 0;
  const sizeBase =
    typeof layout.sizeBase === "number" ? layout.sizeBase >>> 0 : 0;
  const paramBase =
    typeof layout.paramBase === "number" ? layout.paramBase >>> 0 : 0;
  const stride =
    typeof layout.stride === "number" && layout.stride > 0
      ? layout.stride | 0
      : 0x50;

  const bufferAddress = bufferBase + handle;
  const capacityAddress = capacityBase + handle;
  const sizeAddress = sizeBase + handle;
  const paramAddress = paramBase + handle;
  const buffer = safeRead(state, "u32", bufferAddress);
  const capacity = safeRead(state, "u32", capacityAddress);
  const size = safeRead(state, "u32", sizeAddress);
  const param = safeRead(state, "u32", paramAddress);

  return {
    buffer,
    bufferAddress,
    capacity,
    capacityAddress,
    handle,
    param,
    paramAddress,
    propId,
    size,
    sizeAddress,
    stride,
    tableAddress: getPropContextTableAddress(state),
    tableInfo: getPropContextTableInfo(state),
  };
}

function getMissionPlayerNumber(state, fallbackPlayerNumber) {
  const propId = getDefinition(state, "modules.player.missionPropId");
  const offset = getDefinition(state, "modules.player.missionPlayerNumberOffset");
  if (
    typeof propId !== "number" ||
    !Number.isFinite(propId) ||
    typeof offset !== "number" ||
    !Number.isFinite(offset)
  ) {
    return fallbackPlayerNumber;
  }

  const missionContext = getPropHandle(state, propId | 0);
  if (!isReasonablePointer(state, missionContext)) {
    return fallbackPlayerNumber;
  }

  const missionPlayerNumber = safeRead(state, "u32", missionContext + (offset | 0));
  return isReasonablePlayerNumber(missionPlayerNumber)
    ? missionPlayerNumber | 0
    : fallbackPlayerNumber;
}

function readPlayerStruct(state, address, options = {}) {
  const includeName = options.includeName !== false;
  const namePtr = safeRead(state, "u32", address + PLAYER_OFFSETS.namePtr);
  return {
    address,
    activeTitleTier: safeRead(state, "u32", address + PLAYER_OFFSETS.activeTitleTier),
    agentId: safeRead(state, "u32", address + PLAYER_OFFSETS.agentId),
    appearanceBitmap: safeRead(state, "u32", address + PLAYER_OFFSETS.appearanceBitmap),
    flags: safeRead(state, "u32", address + PLAYER_OFFSETS.flags),
    name: includeName && namePtr ? safeReadUtf16(state, namePtr, 24) : "",
    nameEncPtr: safeRead(state, "u32", address + PLAYER_OFFSETS.nameEncPtr),
    namePtr,
    partyLeaderPlayerNumber: safeRead(
      state,
      "u32",
      address + PLAYER_OFFSETS.partyLeaderPlayerNumber
    ),
    partySize: safeRead(state, "u32", address + PLAYER_OFFSETS.partySize),
    playerNumber: safeRead(state, "u32", address + PLAYER_OFFSETS.playerNumber),
    primary: safeRead(state, "u32", address + PLAYER_OFFSETS.primary),
    reforgedFlags: safeRead(state, "u32", address + PLAYER_OFFSETS.reforgedFlags),
    secondary: safeRead(state, "u32", address + PLAYER_OFFSETS.secondary),
  };
}

function readTitleStruct(state, address, titleId = null) {
  const props = safeRead(state, "u32", address + TITLE_OFFSETS.props);
  return {
    address,
    currentPoints: safeRead(state, "u32", address + TITLE_OFFSETS.currentPoints),
    currentTitleTierIndex: safeRead(
      state,
      "u32",
      address + TITLE_OFFSETS.currentTitleTierIndex
    ),
    hasTiers: (props & 3) === 2,
    isPercentageBased: (props & 1) !== 0,
    maxTitleRank: safeRead(state, "u32", address + TITLE_OFFSETS.maxTitleRank),
    maxTitleTierIndex: safeRead(state, "u32", address + TITLE_OFFSETS.maxTitleTierIndex),
    nextTitleTierIndex: safeRead(state, "u32", address + TITLE_OFFSETS.nextTitleTierIndex),
    pointsDescPtr: safeRead(state, "u32", address + TITLE_OFFSETS.pointsDescPtr),
    pointsNeededCurrentRank: safeRead(
      state,
      "u32",
      address + TITLE_OFFSETS.pointsNeededCurrentRank
    ),
    pointsNeededNextRank: safeRead(
      state,
      "u32",
      address + TITLE_OFFSETS.pointsNeededNextRank
    ),
    props,
    textPtr: safeRead(state, "u32", address + TITLE_OFFSETS.textPtr),
    titleId,
    titleName: isValidTitleId(titleId) ? TITLE_NAMES[titleId] : null,
  };
}

function isStructurallyPlausiblePlayer(state, candidate, expectedName = null) {
  if (!candidate || !candidate.address || !isReasonablePointer(state, candidate.address)) {
    return false;
  }
  if (!isReasonablePlayerNumber(candidate.playerNumber)) {
    return false;
  }
  if (!isReasonableProfession(candidate.primary)) {
    return false;
  }
  if (!isReasonableProfession(candidate.secondary)) {
    return false;
  }
  if (!isReasonablePartySize(candidate.partySize)) {
    return false;
  }
  if (candidate.namePtr && !isReasonablePointer(state, candidate.namePtr)) {
    return false;
  }
  if (candidate.nameEncPtr && !isReasonablePointer(state, candidate.nameEncPtr)) {
    return false;
  }
  if (expectedName && !candidate.name) {
    return false;
  }
  return true;
}

function namesEqual(left, right) {
  if (
    typeof left !== "string" ||
    typeof right !== "string" ||
    !left ||
    !right
  ) {
    return false;
  }
  return left === right || left.toLowerCase() === right.toLowerCase();
}

function normalizeTitleId(titleId) {
  if (typeof titleId === "number" && Number.isFinite(titleId)) {
    return titleId | 0;
  }
  if (typeof titleId === "string" && titleId.trim()) {
    const resolved = TITLE_NAME_TO_ID.get(titleId.trim().toLowerCase());
    return typeof resolved === "number" ? resolved : -1;
  }
  return -1;
}

function isValidTitleId(titleId) {
  return Number.isInteger(titleId) && titleId >= 0 && titleId < TITLE_NAMES.length;
}

function resolvePlayerArray(state) {
  const worldArray = resolveWorldPlayerArray(state);
  if (worldArray) {
    return worldArray;
  }

  const playerPropId = getDefinition(state, "modules.player.playerPropId");
  if (typeof playerPropId !== "number" || !Number.isFinite(playerPropId)) {
    return null;
  }
  const propArray = readPropArrayById(state, playerPropId | 0);
  return propArray ? { ...propArray, source: "propContext" } : null;
}

function normalizePlayerId(state, playerId, global = globalThis) {
  if (typeof playerId === "number" && Number.isFinite(playerId) && playerId > 0) {
    return playerId | 0;
  }
  return getMissionPlayerNumber(state, getPlayerNumberFromMapState(state, global));
}

function getPlayerAddressCache(state) {
  let cache = playerAddressCache.get(state);
  if (!cache) {
    cache = new Map();
    playerAddressCache.set(state, cache);
  }
  return cache;
}

function setCurrentPlayerAddressCache(state, address, playerNumber) {
  if (!isReasonablePointer(state, address) || !isReasonablePlayerNumber(playerNumber)) {
    return;
  }
  currentPlayerAddressCache.set(state, {
    address: address >>> 0,
    playerNumber: playerNumber | 0,
  });
}

function getCachedCurrentPlayerAgentId(state) {
  const cached = currentPlayerAddressCache.get(state);
  if (
    !cached ||
    !isReasonablePointer(state, cached.address)
  ) {
    return 0;
  }

  const agentId = safeRead(state, "u32", cached.address + PLAYER_OFFSETS.agentId);
  return isReasonableAgentId(agentId) ? agentId >>> 0 : 0;
}

function isPlayerAddressCacheEntryValid(state, playerNumber, entry) {
  if (
    !entry ||
    typeof entry.cachedAt !== "number" ||
    Date.now() - entry.cachedAt > PLAYER_ADDRESS_CACHE_TTL_MS ||
    entry.memoryLimit !== getMemoryLimit(state) ||
    !isReasonablePointer(state, entry.address)
  ) {
    return false;
  }

  const candidate = readPlayerStruct(state, entry.address, { includeName: false });
  return (
    isStructurallyPlausiblePlayer(state, candidate) &&
    candidate.playerNumber === playerNumber
  );
}

function resolvePlayerAddress(state, global = globalThis, playerId = 0) {
  const isCurrentPlayerRequest = !(
    typeof playerId === "number" &&
    Number.isFinite(playerId) &&
    playerId > 0
  );
  const playerNumber = normalizePlayerId(state, playerId, global);
  if (!isReasonablePlayerNumber(playerNumber)) {
    return 0;
  }

  const cache = getPlayerAddressCache(state);
  const cached = cache.get(playerNumber);
  if (isPlayerAddressCacheEntryValid(state, playerNumber, cached)) {
    if (isCurrentPlayerRequest) {
      setCurrentPlayerAddressCache(state, cached.address, playerNumber);
    }
    return cached.address;
  }

  const playerArray = resolvePlayerArray(state);
  if (!playerArray || playerNumber >= getArraySlotCount(playerArray)) {
    cache.delete(playerNumber);
    return 0;
  }

  const candidateAddress = (playerArray.buffer + playerNumber * playerArray.stride) >>> 0;
  const candidate = readPlayerStruct(state, candidateAddress, { includeName: false });

  if (!isStructurallyPlausiblePlayer(state, candidate)) {
    cache.delete(playerNumber);
    return 0;
  }
  if (candidate.playerNumber !== playerNumber) {
    cache.delete(playerNumber);
    return 0;
  }

  cache.set(playerNumber, {
    address: candidateAddress,
    cachedAt: Date.now(),
    memoryLimit: getMemoryLimit(state),
  });
  if (isCurrentPlayerRequest) {
    setCurrentPlayerAddressCache(state, candidateAddress, playerNumber);
  }
  return candidateAddress;
}

function getPlayerStructById(state, global = globalThis, playerId = 0) {
  const address =
    playerId === 0
      ? resolveCurrentPlayerAddressFast(state)
      : resolvePlayerAddress(state, global, playerId);
  return address ? readPlayerStruct(state, address) : null;
}

function setPlayerNameById(state, global = globalThis, playerId = 0, replaceName = "") {
  const player = getPlayerStructById(state, global, playerId);
  if (!player?.nameEncPtr || !isReasonablePointer(state, player.nameEncPtr)) {
    return null;
  }

  const nextName = String(replaceName ?? "").slice(0, 20);
  const writeAddress = (player.nameEncPtr + 4) >>> 0;
  if (!safeWriteUtf16(state, writeAddress, nextName, 20)) {
    return null;
  }

  return {
    address: writeAddress,
    playerId: player.playerNumber,
    value: nextName,
  };
}

function getPlayerEncodedNameById(state, global = globalThis, playerId = 0) {
  const player = getPlayerStructById(state, global, playerId);
  if (!player?.nameEncPtr || !isReasonablePointer(state, player.nameEncPtr)) {
    return null;
  }
  return safeReadUtf16(state, (player.nameEncPtr + 4) >>> 0, 20) || null;
}

function getRawExports(state) {
  if (typeof state?.hook?.getRawExports !== "function") {
    return null;
  }
  try {
    return state.hook.getRawExports();
  } catch (error) {
    return null;
  }
}

function isInternalFunctionCallable(state, value) {
  if (value?.disabled) {
    return false;
  }
  const exportsObject = getRawExports(state);
  return !!(
    value?.exportName &&
    exportsObject &&
    typeof exportsObject[value.exportName] === "function"
  );
}

function cloneInternalFunctionInfo(state, value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const callable = isInternalFunctionCallable(state, value);
  return {
    ...value,
    callable,
    exportAvailable: callable,
    reason: callable
      ? "Export patched into the runtime; call semantics still need in-game verification."
      : value.reason,
  };
}

function getInternalFunctions(state) {
  return Object.fromEntries(
    Object.entries(INTERNAL_FUNCTIONS).map(([name, value]) => [
      name,
      cloneInternalFunctionInfo(state, value),
    ])
  );
}

function getUnsupportedAction(state, name) {
  const internalFunction = cloneInternalFunctionInfo(state, INTERNAL_FUNCTIONS[name]);
  const messageFunction = internalFunction?.calls
    ? cloneInternalFunctionInfo(state, INTERNAL_FUNCTIONS[internalFunction.calls])
    : null;
  return {
    available: false,
    internalFunction,
    messageFunction,
    reason:
      internalFunction?.reason ||
      UNSUPPORTED_ACTIONS[name] ||
      "Not implemented for the WASM runtime yet.",
  };
}

function callInternalFunction(state, name, args) {
  const info = INTERNAL_FUNCTIONS[name];
  const internalFunction = cloneInternalFunctionInfo(state, info);
  if (!info?.exportName) {
    return {
      called: false,
      internalFunction,
      reason: "Unknown internal function.",
    };
  }
  if (info.disabled) {
    return {
      called: false,
      internalFunction,
      reason: info.reason,
    };
  }
  if (!internalFunction?.callable || typeof state?.hook?.callExport !== "function") {
    return {
      called: false,
      internalFunction,
      reason: "Internal function export is not available in this runtime.",
    };
  }

  try {
    return {
      called: true,
      internalFunction,
      result: state.hook.callExport(info.exportName, ...args),
    };
  } catch (error) {
    return {
      called: false,
      error: error instanceof Error ? error.message : String(error),
      internalFunction,
      reason: "Internal function call failed.",
    };
  }
}

function callMessageFunction(state, name, args) {
  return callInternalFunction(state, name, args).called === true;
}

function resolveTitleArray(state) {
  const resolved = resolveContextChain(state);
  if (!resolved?.worldContextAddress) {
    return null;
  }
  const titleArray = readArrayAtAddress(
    state,
    resolved.worldContextAddress + WORLD_CONTEXT_OFFSETS.titles,
    TITLE_SIZE
  );
  return titleArray
    ? {
        ...titleArray,
        contextSource: resolved.source,
        gameContextAddress: resolved.gameContextAddress,
        source: "worldContext",
        worldContextAddress: resolved.worldContextAddress,
      }
    : null;
}

function getTitleTrackById(state, titleId) {
  const normalizedTitleId = normalizeTitleId(titleId);
  if (!isValidTitleId(normalizedTitleId)) {
    return null;
  }

  const titleArray = resolveTitleArray(state);
  if (!titleArray || normalizedTitleId >= titleArray.size) {
    return null;
  }

  return readTitleStruct(
    state,
    (titleArray.buffer + normalizedTitleId * titleArray.stride) >>> 0,
    normalizedTitleId
  );
}

function getTitleDataById(state, titleId) {
  const normalizedTitleId = normalizeTitleId(titleId);
  if (!isValidTitleId(normalizedTitleId)) {
    return null;
  }

  const address =
    (TITLE_CLIENT_DATA_ADDRESS + normalizedTitleId * TITLE_CLIENT_DATA_STRIDE) >>> 0;
  const tableTitleId = safeRead(
    state,
    "u32",
    address + TITLE_CLIENT_DATA_OFFSETS.titleId
  );
  const nameId = safeRead(state, "u32", address + TITLE_CLIENT_DATA_OFFSETS.nameId);
  const unknown0 = safeRead(
    state,
    "u32",
    address + TITLE_CLIENT_DATA_OFFSETS.unknown0
  );
  if (tableTitleId === normalizedTitleId && typeof nameId === "number") {
    return {
      address,
      clientDataAvailable: true,
      nameId,
      source: "ConstGetTitleClientData(ETitle)",
      titleId: tableTitleId,
      titleName: TITLE_NAMES[normalizedTitleId],
      unknown0,
    };
  }

  return {
    address,
    clientDataAvailable: false,
    nameId: null,
    source: "TitleID enum fallback",
    titleId: normalizedTitleId,
    titleName: TITLE_NAMES[normalizedTitleId],
    unknown0: null,
  };
}

function getActiveTitleId(state, global = globalThis) {
  const player = getPlayerStructById(state, global);
  if (!player?.activeTitleTier) {
    return TITLE_ID_NONE;
  }

  const titleArray = resolveTitleArray(state);
  if (!titleArray) {
    return TITLE_ID_NONE;
  }

  for (let titleId = 0; titleId < titleArray.size; titleId += 1) {
    const title = readTitleStruct(
      state,
      (titleArray.buffer + titleId * titleArray.stride) >>> 0,
      titleId
    );
    if (title.currentTitleTierIndex === player.activeTitleTier) {
      return titleId;
    }
  }
  return TITLE_ID_NONE;
}

function createPlayerApi(state, global = globalThis) {
  const DISCOVERY_OPTIONS = Object.freeze({ scan: true });

  function getRuntimeDescribe() {
    const runtimePlayer = getRuntimePlayer(global);
    if (!runtimePlayer || typeof runtimePlayer.describe !== "function") {
      return null;
    }
    return runtimePlayer.describe({
      resolve: false,
      resolveAgent: false,
      resolveCharContext: true,
    });
  }

  function discoverPlayer() {
    const runtimePlayer = getRuntimePlayer(global);
    if (!runtimePlayer) {
      return null;
    }
    if (typeof runtimePlayer.discoverPlayer === "function") {
      return runtimePlayer.discoverPlayer(DISCOVERY_OPTIONS) || null;
    }
    if (typeof runtimePlayer.getPlayer === "function") {
      return runtimePlayer.getPlayer(DISCOVERY_OPTIONS) || null;
    }
    return null;
  }

  function discoverAgent() {
    const runtimePlayer = getRuntimePlayer(global);
    if (!runtimePlayer) {
      return null;
    }
    if (typeof runtimePlayer.discoverAgent === "function") {
      return runtimePlayer.discoverAgent(DISCOVERY_OPTIONS) || null;
    }
    if (typeof runtimePlayer.getAgent === "function") {
      return runtimePlayer.getAgent(DISCOVERY_OPTIONS) || null;
    }
    return null;
  }

  return Object.freeze({
    Describe() {
      const playerPropId = getDefinition(state, "modules.player.playerPropId");
      const missionPropId = getDefinition(state, "modules.player.missionPropId");
      const playerArray = resolvePlayerArray(state);
      const playerAddress = resolvePlayerAddress(state, global);
      const titleArray = resolveTitleArray(state);
      return {
        charContextAddress: state.anchors?.charContextAddress || 0,
        direct: {
          missionProp:
            typeof missionPropId === "number"
              ? readPropArrayDebug(state, missionPropId | 0)
              : null,
          playerAddress,
          playerArray,
          playerProp:
            typeof playerPropId === "number"
              ? readPropArrayDebug(state, playerPropId | 0)
              : null,
          playerNumber: getMissionPlayerNumber(
            state,
            getPlayerNumberFromMapState(state, global)
          ),
          propContextTableAddress: getPropContextTableAddress(state),
          contextChain: resolveContextChain(state),
          internalFunctions: getInternalFunctions(state),
          titleArray,
          titleDataSource: "ConstGetTitleClientData(ETitle) table at 0x276f60",
          unsupportedActions: UNSUPPORTED_ACTIONS,
          worldContextAddress: getWorldContextAddress(state),
          worldPlayerArray: resolveWorldPlayerArray(state),
          worldPlayerNumber: getWorldPlayerNumber(state),
        },
        runtime: getRuntimeDescribe(),
        storedCharacterName: state.player?.storedCharacterName || null,
      };
    },
    DiscoverAgent() {
      return discoverAgent();
    },
    DiscoverPlayer() {
      return discoverPlayer();
    },
    DescribeFastPlayerPath() {
      return describeFastPlayerPath(state);
    },
    FindGameContextCandidates(options = {}) {
      return findGameContextCandidates(state, options);
    },
    PromoteGameContextAddress(address) {
      return promoteGameContextAddress(state, address);
    },
    PromoteGameContextFromCurrentCharContext(options = {}) {
      return promoteGameContextFromCurrentCharContext(state, options);
    },
    GetAgent() {
      const runtimePlayer = getRuntimePlayer(global);
      return runtimePlayer && typeof runtimePlayer.getAgent === "function"
        ? runtimePlayer.getAgent({ scan: false }) || null
        : null;
    },
    GetAgentAddress() {
      const runtimePlayer = getRuntimePlayer(global);
      return runtimePlayer && typeof runtimePlayer.getAgentAddress === "function"
        ? runtimePlayer.getAgentAddress({ scan: false }) || null
        : null;
    },
    CallInternalFunction(name, ...args) {
      return callInternalFunction(state, name, args);
    },
    GetInternalFunction(name) {
      return cloneInternalFunctionInfo(state, INTERNAL_FUNCTIONS[name]);
    },
    GetInternalFunctions() {
      return getInternalFunctions(state);
    },
    GetUnsupportedAction(name) {
      return getUnsupportedAction(state, name);
    },
    GetCharacterName() {
      const player = getPlayerStructById(state, global);
      return player?.name || getConfiguredCharacterName(state, global);
    },
    GetAmountOfPlayersInInstance() {
      const playerArray = resolvePlayerArray(state);
      return playerArray && playerArray.size > 0 ? playerArray.size - 1 : 0;
    },
    GetPlayer(playerId = 0) {
      return getPlayerStructById(state, global, playerId);
    },
    GetPlayerAddress(playerId = 0) {
      return playerId === 0
        ? resolveCurrentPlayerAddressFast(state) || 0
        : resolvePlayerAddress(state, global, playerId) || 0;
    },
    GetPlayerAgentId(playerId = 0) {
      if (!playerId) {
        const controlledAgentId = getControlledCharacterAgentId(state);
        if (controlledAgentId) {
          return controlledAgentId;
        }
      }
      const player = getPlayerStructById(state, global, playerId);
      return player?.agentId || 0;
    },
    GetPlayerArray() {
      return resolvePlayerArray(state);
    },
    GetPlayerByID(playerId = 0) {
      return getPlayerStructById(state, global, playerId);
    },
    GetPlayerByName(name) {
      if (typeof name !== "string" || !name.trim()) {
        return null;
      }
      const playerArray = resolvePlayerArray(state);
      if (!playerArray) {
        return null;
      }
      for (let playerId = 0; playerId < playerArray.size; playerId += 1) {
        const player = readPlayerStruct(
          state,
          (playerArray.buffer + playerId * playerArray.stride) >>> 0
        );
        if (player?.name && namesEqual(player.name, name.trim())) {
          return player;
        }
      }
      return null;
    },
    GetPlayerName(playerId = 0) {
      const player = getPlayerStructById(state, global, playerId);
      return player?.name || null;
    },
    GetPlayerEncodedName(playerId = 0) {
      return getPlayerEncodedNameById(state, global, playerId);
    },
    GetPlayerNumber() {
      return getMissionPlayerNumber(state, getPlayerNumberFromMapState(state, global));
    },
    GetPosition() {
      const runtimePlayer = getRuntimePlayer(global);
      return runtimePlayer && typeof runtimePlayer.getPosition === "function"
        ? runtimePlayer.getPosition({ scan: false }) || null
        : null;
    },
    GetStoredCharacterName() {
      return state.player?.storedCharacterName || null;
    },
    SetPlayerName(playerId = 0, replaceName = "") {
      return setPlayerNameById(state, global, playerId, replaceName);
    },
    GetTitleArray() {
      return resolveTitleArray(state);
    },
    GetTitleIDs() {
      const titleArray = resolveTitleArray(state);
      if (!titleArray) {
        return [];
      }
      return Array.from({ length: titleArray.size }, (_, titleId) => titleId);
    },
    GetTitleIdByName(name) {
      return normalizeTitleId(name);
    },
    GetTitleName(titleId) {
      const normalizedTitleId = normalizeTitleId(titleId);
      return isValidTitleId(normalizedTitleId) ? TITLE_NAMES[normalizedTitleId] : null;
    },
    GetTitleNames() {
      return TITLE_NAMES.slice();
    },
    GetTitleTrack(titleId) {
      return getTitleTrackById(state, titleId);
    },
    GetActiveTitleId() {
      return getActiveTitleId(state, global);
    },
    GetActiveTitleName() {
      const titleId = getActiveTitleId(state, global);
      return titleId === TITLE_ID_NONE ? null : TITLE_NAMES[titleId] || null;
    },
    GetActiveTitle() {
      const titleId = getActiveTitleId(state, global);
      return titleId === TITLE_ID_NONE ? null : getTitleTrackById(state, titleId);
    },
    GetTitleData(titleId) {
      return getTitleDataById(state, titleId);
    },
    SetActiveTitle(titleId) {
      const normalizedTitleId = normalizeTitleId(titleId);
      return isValidTitleId(normalizedTitleId)
        ? callMessageFunction(state, "SendSetTitle", [normalizedTitleId])
        : false;
    },
    RemoveActiveTitle() {
      return callMessageFunction(state, "SendSetTitleNone", []);
    },
    ChangeSecondProfession(profession, heroIndex = 0) {
      const heroIndexValue = Number(heroIndex);
      const professionValue = Number(profession);
      if (
        !Number.isInteger(heroIndexValue) ||
        !Number.isInteger(professionValue) ||
        (heroIndexValue >>> 0) !== 0
      ) {
        return false;
      }
      const agentId = getControlledCharacterAgentId(
        state,
        {
          allowSlowFallback: false,
        }
      );
      const professionId = professionValue >>> 0;
      return agentId
        ? callMessageFunction(state, "SendOrderSetProfessionSecondary", [
            agentId,
            professionId,
          ])
        : false;
    },
    DepositFaction(allegiance, amount = 5000) {
      const allegianceValue = Number(allegiance);
      const amountValue = Number(amount);
      if (!Number.isInteger(allegianceValue) || !Number.isInteger(amountValue)) {
        return false;
      }
      const allegianceId = allegianceValue >>> 0;
      const factionAmount = amountValue >>> 0;
      if (allegianceId > 1 || factionAmount === 0) {
        return false;
      }
      return callMessageFunction(state, "SendOrderGuildAdjustFaction", [
        0,
        allegianceId,
        factionAmount,
      ]);
    },
    IsAvailable() {
      return this.GetPlayerAddress() !== 0;
    },
  });
}

export const PlayerModule = createModule("PlayerMgr", async function initModule(
  state,
  global = globalThis
) {
  state.player = Object.freeze({
    api: createPlayerApi(state, global),
    charContextAddress: state.anchors?.charContextAddress || 0,
    storedCharacterName: getStoredCharacterName(global),
  });

  return {
    charContextAddress: state.player.charContextAddress || null,
    storedCharacterName: state.player.storedCharacterName,
  };
});

export function getPlayerApi(global = globalThis) {
  return global.GWCAjs?.Player || null;
}
