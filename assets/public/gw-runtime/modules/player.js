import { CHARACTER_NAME_STORAGE_KEY } from "../resolver.js";

const PLAYER_OFFSETS = Object.freeze({
  agentId: 0x00,
  appearanceBitmap: 0x10,
  flags: 0x14,
  primary: 0x18,
  secondary: 0x1c,
  nameEncPtr: 0x24,
  namePtr: 0x28,
  partyLeaderPlayerNumber: 0x2c,
  activeTitleTier: 0x30,
  reforgedFlags: 0x34,
  playerNumber: 0x38,
  partySize: 0x3c,
});

const AGENT_LIVING_OFFSETS = Object.freeze({
  agentId: 0x2c,
  z: 0x30,
  x: 0x74,
  y: 0x78,
  type: 0x9c,
  owner: 0xc4,
  playerNumber: 0xf4,
  agentModelType: 0xf6,
  transmogNpcId: 0xf8,
  primary: 0x10e,
  secondary: 0x10f,
  level: 0x110,
  teamId: 0x111,
  energyRegen: 0x118,
  energy: 0x120,
  maxEnergy: 0x124,
  hpPips: 0x12c,
  hp: 0x134,
  maxHp: 0x138,
  effects: 0x13c,
  modelState: 0x158,
  typeMap: 0x15c,
  loginNumber: 0x184,
  animationSpeed: 0x188,
  animationCode: 0x18c,
  animationId: 0x190,
  weaponType: 0x1b6,
  skill: 0x1b8,
});

const AGENT_CONTEXT_OFFSETS = Object.freeze({
  agentArray: 0x14c,
  agentCount: 0x154,
  instanceTimer: 0x1ac,
  worldX0: 0x1b0,
  worldY0: 0x1b4,
  worldX1: 0x1b8,
  worldY1: 0x1bc,
});

const AGENT_OFFSETS = Object.freeze({
  stopMovementTime: 0x48,
  movementStartTime: 0x58,
  x: 0x78,
  y: 0x7c,
  z: 0x80,
  stoppedX: 0x88,
  stoppedY: 0x8c,
  stoppedZ: 0x90,
  velocityX: 0xb0,
  velocityY: 0xb4,
});

const PLAYER_CONTROLLED_CHARACTER_OFFSETS = Object.freeze({
  agentId: 0x14,
  compositeId: 0x18,
  moreFlags: 0x64,
  flags: 0x10c,
});

const GAME_CONTEXT_OFFSETS = Object.freeze({
  agent: 0x08,
  character: 0x44,
  map: 0x14,
  world: 0x2c,
});

const WORLD_CONTEXT_OFFSETS = Object.freeze({
  playerNumber: 0x67c,
  players: 0x80c,
});

export function createPlayerModule(runtime) {
  const cache = {
    agentAddress: 0,
    agentId: 0,
    gameContextAddress: 0,
    playerArray: null,
    playerAddress: 0,
    playerName: null,
    worldContextAddress: 0,
  };

  let cachedAgentContext = null;

  let promotedAgentAddress = 0;
  let promotedPlayerAddress = 0;

  function safeRead(readFn, address) {
    if (typeof readFn !== "function" || !address) {
      return null;
    }
    try {
      return readFn(address);
    } catch (error) {
      return null;
    }
  }

  function safeReadU8(address) {
    return safeRead(runtime.hook?.readU8, address);
  }

  function safeReadU16(address) {
    return safeRead(runtime.hook?.readU16, address);
  }

  function safeReadU32(address) {
    return safeRead(runtime.hook?.readU32, address);
  }

  function safeReadF32(address) {
    return safeRead(runtime.hook?.readF32, address);
  }

  function getDefinition(path) {
    return typeof runtime.resolver?.getDefinition === "function"
      ? runtime.resolver.getDefinition(path)
      : undefined;
  }

  function readUtf16(address, maxCodeUnits = 64) {
    if (!address || typeof runtime.hook?.readU16 !== "function") {
      return "";
    }

    const limit = Math.max(0, maxCodeUnits | 0);
    const codeUnits = [];

    for (let index = 0; index < limit; index += 1) {
      const value = safeReadU16(address + index * 2);
      if (!value) {
        break;
      }
      if (value < 0x20 || value > 0x7e) {
        if (value === 0x09 || value === 0x0a || value === 0x0d) {
          codeUnits.push(value);
          continue;
        }
        return "";
      }
      codeUnits.push(value);
    }

    if (codeUnits.length === 0) {
      return "";
    }

    try {
      return String.fromCharCode(...codeUnits);
    } catch (error) {
      return "";
    }
  }

  function getMemoryLimit() {
    return runtime.hook?.memory?.buffer?.byteLength || 0;
  }

  function getLiveCurrentPlayerName() {
    const expectedPlayerNumber = getExpectedPlayerNumber();
    const playerArray = getDirectPlayerArray();
    if (
      !playerArray ||
      !isReasonablePlayerNumber(expectedPlayerNumber) ||
      expectedPlayerNumber >= getArraySlotCount(playerArray)
    ) {
      return null;
    }

    const address =
      (playerArray.buffer + expectedPlayerNumber * playerArray.stride) >>> 0;
    const player = readPlayerStruct(address);
    if (
      isStructurallyPlausiblePlayer(player) &&
      player.playerNumber === expectedPlayerNumber &&
      typeof player.name === "string" &&
      player.name.trim()
    ) {
      return player.name.trim();
    }

    return null;
  }

  function getConfiguredCharacterName() {
    const livePlayerName = getLiveCurrentPlayerName();
    if (livePlayerName) {
      return livePlayerName;
    }

    const charContextAddress =
      typeof runtime.map?.getCharContextAddress === "function"
        ? runtime.map.getCharContextAddress()
        : 0;
    if (charContextAddress) {
      const name = readUtf16(charContextAddress + 0x74, 20);
      if (name) {
        return name;
      }
    }

    try {
      const storedName =
        globalThis.localStorage?.getItem(CHARACTER_NAME_STORAGE_KEY) ?? null;
      if (typeof storedName === "string" && storedName.trim()) {
        return storedName.trim();
      }
    } catch (error) {
      // Ignore localStorage failures and fall through to live inspection.
    }

    return null;
  }

  function shouldScan(options = {}) {
    return !!(
      options &&
      (options.scan === true || options.discover === true)
    );
  }

  function getExpectedPlayerNumber(options = {}) {
    if (
      typeof options.playerNumber === "number" &&
      Number.isFinite(options.playerNumber) &&
      options.playerNumber > 0
    ) {
      return options.playerNumber | 0;
    }

    const state =
      typeof runtime.map?.getState === "function" ? runtime.map.getState() : null;
    return state && typeof state.playerNumber === "number" && state.playerNumber > 0
      ? state.playerNumber | 0
      : 0;
  }

  function getCharContextAddress(options = {}) {
    if (
      typeof options.charContextAddress === "number" &&
      Number.isFinite(options.charContextAddress)
    ) {
      return options.charContextAddress >>> 0;
    }
    return typeof runtime.map?.getCharContextAddress === "function"
      ? runtime.map.getCharContextAddress() || 0
      : 0;
  }

  function getPlayerLayout() {
    const definition = getDefinition("modules.player.propArrayLayout");
    return definition && typeof definition === "object" ? definition : null;
  }

  function getConfiguredPropId(path) {
    const value = getDefinition(path);
    return typeof value === "number" && Number.isFinite(value) ? value | 0 : 0;
  }

  function getPropContextTableAddress() {
    const slotValue = getDefinition("modules.player.propContextTableSlotAddress");
    const legacyValue = getDefinition("modules.player.propContextTableAddress");
    const defaultValue = getDefinition("modules.player.propContextDefaultAddress");
    const slotAddress =
      typeof slotValue === "number" && Number.isFinite(slotValue)
        ? slotValue >>> 0
        : typeof legacyValue === "number" && Number.isFinite(legacyValue)
          ? legacyValue >>> 0
          : 0;

    if (slotAddress) {
      const dereferenced = safeReadU32(slotAddress);
      if (isReasonablePointer(dereferenced)) {
        return dereferenced >>> 0;
      }
    }

    const defaultAddress =
      typeof defaultValue === "number" && Number.isFinite(defaultValue)
        ? defaultValue >>> 0
        : 0;
    return isReasonablePointer(defaultAddress) ? defaultAddress : 0;
  }

  function getPropHandle(propId) {
    const tableAddress = getPropContextTableAddress();
    if (!tableAddress || !Number.isInteger(propId) || propId < 0) {
      return 0;
    }
    return safeReadU32(tableAddress + propId * 4) || 0;
  }

  function readPropArrayById(propId) {
    const layout = getPlayerLayout();
    const handle = getPropHandle(propId);
    if (!layout || !handle) {
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

    const buffer = safeReadU32(bufferBase + handle);
    const capacity = safeReadU32(capacityBase + handle);
    const size = safeReadU32(sizeBase + handle);
    const param = safeReadU32(paramBase + handle);

    if (!isReasonablePointer(buffer)) {
      return null;
    }

    // The live prop readers consistently use buffer + count. Capacity exists in
    // the context layout, but some prop contexts appear to leave it unset or out
    // of sync, so treat it as advisory rather than authoritative.
    const normalizedSize =
      typeof size === "number" && Number.isFinite(size) && size > 0 ? size : 0;
    const normalizedCapacity =
      typeof capacity === "number" && Number.isFinite(capacity) && capacity > 0
        ? Math.max(capacity, normalizedSize)
        : normalizedSize;
    if (normalizedCapacity <= 0) {
      return null;
    }

    const limit = getMemoryLimit();
    const bufferEnd = buffer + normalizedCapacity * stride;
    if (bufferEnd <= buffer || bufferEnd > limit) {
      return null;
    }

    return {
      buffer,
      bufferEnd,
      capacity: normalizedCapacity,
      rawCapacity:
        typeof capacity === "number" && Number.isFinite(capacity) ? capacity : null,
      handle,
      param,
      propId,
      rawSize: typeof size === "number" && Number.isFinite(size) ? size : null,
      size: normalizedSize,
      stride,
      tableAddress: getPropContextTableAddress(),
    };
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

  function getMissionPlayerNumberFromDirectPath() {
    const missionPropId = getConfiguredPropId("modules.player.missionPropId");
    const missionPlayerNumberOffset = getDefinition(
      "modules.player.missionPlayerNumberOffset"
    );
    const missionContext = getPropHandle(missionPropId);
    const offset =
      typeof missionPlayerNumberOffset === "number" &&
      Number.isFinite(missionPlayerNumberOffset)
        ? missionPlayerNumberOffset | 0
        : 0;

    if (!missionContext || !offset || !isReasonablePointer(missionContext)) {
      return 0;
    }

    const value = safeReadU32(missionContext + offset);
    return isReasonablePlayerNumber(value) ? value | 0 : 0;
  }

  function readPlayerStruct(address) {
    const namePtr = safeReadU32(address + PLAYER_OFFSETS.namePtr);
    return {
      address,
      activeTitleTier: safeReadU32(address + PLAYER_OFFSETS.activeTitleTier),
      agentId: safeReadU32(address + PLAYER_OFFSETS.agentId),
      appearanceBitmap: safeReadU32(address + PLAYER_OFFSETS.appearanceBitmap),
      flags: safeReadU32(address + PLAYER_OFFSETS.flags),
      name: namePtr ? readUtf16(namePtr, 24) : "",
      nameEncPtr: safeReadU32(address + PLAYER_OFFSETS.nameEncPtr),
      namePtr,
      partyLeaderPlayerNumber: safeReadU32(
        address + PLAYER_OFFSETS.partyLeaderPlayerNumber
      ),
      partySize: safeReadU32(address + PLAYER_OFFSETS.partySize),
      playerNumber: safeReadU32(address + PLAYER_OFFSETS.playerNumber),
      primary: safeReadU32(address + PLAYER_OFFSETS.primary),
      reforgedFlags: safeReadU32(address + PLAYER_OFFSETS.reforgedFlags),
      secondary: safeReadU32(address + PLAYER_OFFSETS.secondary),
    };
  }

  function isReasonablePlayerAgentId(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 0x10000000;
  }

  function isReasonableProfession(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10;
  }

  function isReasonablePlayerNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 0x10000;
  }

  function isReasonablePartySize(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 12;
  }

  function isReasonableCoordinate(value) {
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      Math.abs(value) >= 0.001 &&
      Math.abs(value) < 1000000
    );
  }

  function isReasonableAgentPosition(position) {
    return (
      position &&
      isReasonableCoordinate(position.x) &&
      isReasonableCoordinate(position.y) &&
      typeof position.z === "number" &&
      Number.isFinite(position.z) &&
      Math.abs(position.z) < 1000000
    );
  }

  function isReasonableDirectAgentPosition(position, bounds = null) {
    if (
      !position ||
      typeof position.x !== "number" ||
      typeof position.y !== "number" ||
      typeof position.z !== "number" ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z) ||
      Math.abs(position.x) >= 1000000 ||
      Math.abs(position.y) >= 1000000 ||
      Math.abs(position.z) >= 1000000
    ) {
      return false;
    }
    if (
      bounds &&
      Number.isFinite(bounds.x0) &&
      Number.isFinite(bounds.x1) &&
      Number.isFinite(bounds.y0) &&
      Number.isFinite(bounds.y1)
    ) {
      return (
        position.x >= bounds.x0 &&
        position.x <= bounds.x1 &&
        position.y >= bounds.y0 &&
        position.y <= bounds.y1
      );
    }
    return true;
  }

  function isReasonablePointer(value) {
    const limit = getMemoryLimit();
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0x10000 &&
      value < limit
    );
  }

  function getCharContextPlayerNumber(options = {}) {
    const explicit = getExpectedPlayerNumber(options);
    if (isReasonablePlayerNumber(explicit)) {
      return explicit;
    }

    const charContextAddress = getCharContextAddress(options);
    const value = charContextAddress
      ? safeReadU32(charContextAddress + 0x2ac)
      : 0;
    return isReasonablePlayerNumber(value) ? value | 0 : 0;
  }

  function describeWorldContextCandidate(worldContextAddress, expectedPlayerNumber) {
    const normalizedAddress =
      typeof worldContextAddress === "number" && Number.isFinite(worldContextAddress)
        ? worldContextAddress >>> 0
        : 0;
    const playerNumber = normalizedAddress
      ? safeReadU32(normalizedAddress + WORLD_CONTEXT_OFFSETS.playerNumber)
      : null;
    const playerArrayAddress = normalizedAddress
      ? (normalizedAddress + WORLD_CONTEXT_OFFSETS.players) >>> 0
      : 0;
    const playerArrayHeader = playerArrayAddress
      ? readArrayHeader(playerArrayAddress)
      : null;
    const slotCount = playerArrayHeader
      ? Math.max(playerArrayHeader.size || 0, playerArrayHeader.capacity || 0)
      : 0;
    const bufferEnd =
      playerArrayHeader && playerArrayHeader.buffer && slotCount > 0
        ? playerArrayHeader.buffer + slotCount * 0x50
        : 0;
    const playerAddress =
      playerArrayHeader &&
      isReasonablePlayerNumber(expectedPlayerNumber) &&
      expectedPlayerNumber < slotCount
        ? (playerArrayHeader.buffer + expectedPlayerNumber * 0x50) >>> 0
        : 0;
    const player = playerAddress ? readPlayerStruct(playerAddress) : null;

    let rejection = null;
    if (!isReasonablePointer(normalizedAddress)) {
      rejection = "not-pointer";
    } else if (!isReasonablePlayerNumber(playerNumber)) {
      rejection = "player-number-invalid";
    } else if (
      isReasonablePlayerNumber(expectedPlayerNumber) &&
      playerNumber !== expectedPlayerNumber
    ) {
      rejection = "player-number-mismatch";
    } else if (
      !playerArrayHeader ||
      !isReasonablePointer(playerArrayHeader.buffer) ||
      slotCount <= 0 ||
      playerArrayHeader.capacity <= 0 ||
      playerArrayHeader.capacity > 512 ||
      playerArrayHeader.size <= 0 ||
      playerArrayHeader.size > playerArrayHeader.capacity ||
      bufferEnd <= playerArrayHeader.buffer ||
      bufferEnd > getMemoryLimit()
    ) {
      rejection = "player-array-invalid";
    } else if (
      isReasonablePlayerNumber(expectedPlayerNumber) &&
      expectedPlayerNumber >= playerArrayHeader.size
    ) {
      rejection = "player-slot-out-of-size";
    } else if (
      player &&
      (!isStructurallyPlausiblePlayer(player, getConfiguredCharacterName()) ||
        player.playerNumber !== expectedPlayerNumber)
    ) {
      rejection = "player-struct-invalid";
    }

    return {
      player,
      playerAddress,
      playerArrayAddress,
      playerArrayHeader: playerArrayHeader
        ? {
            ...playerArrayHeader,
            bufferEnd,
            slotCount,
            withinMemory:
              bufferEnd > playerArrayHeader.buffer && bufferEnd <= getMemoryLimit(),
          }
        : null,
      playerNumber,
      rejection,
    };
  }

  function validateGameContextCandidate(gameContextAddress, options = {}) {
    const normalizedAddress =
      typeof gameContextAddress === "number" && Number.isFinite(gameContextAddress)
        ? gameContextAddress >>> 0
        : 0;
    if (!isReasonablePointer(normalizedAddress)) {
      return null;
    }

    const charContextAddress = getCharContextAddress(options);
    const candidateCharContext = safeReadU32(
      normalizedAddress + GAME_CONTEXT_OFFSETS.character
    );
    if (charContextAddress && candidateCharContext !== charContextAddress) {
      return null;
    }

    const expectedPlayerNumber = getCharContextPlayerNumber(options);
    const worldContextAddress = safeReadU32(
      normalizedAddress + GAME_CONTEXT_OFFSETS.world
    );
    const worldDetail = describeWorldContextCandidate(
      worldContextAddress,
      expectedPlayerNumber
    );
    if (worldDetail.rejection) {
      return null;
    }

    return {
      charContextAddress: charContextAddress || candidateCharContext || 0,
      expectedPlayerNumber,
      gameContextAddress: normalizedAddress,
      worldContextAddress,
      worldDetail,
    };
  }

  function findReferencesToAddress(targetAddress, options = {}) {
    const normalizedTarget =
      typeof targetAddress === "number" && Number.isFinite(targetAddress)
        ? targetAddress >>> 0
        : 0;
    if (!normalizedTarget) {
      return [];
    }

    if (typeof runtime.map?.findReferencesToAddress === "function") {
      return runtime.map.findReferencesToAddress(normalizedTarget, options) || [];
    }

    if (typeof runtime.hook?.scanU32 !== "function") {
      return [];
    }

    const start =
      typeof options.start === "number" && Number.isFinite(options.start)
        ? options.start >>> 0
        : 0;
    const end =
      typeof options.end === "number" && Number.isFinite(options.end)
        ? options.end >>> 0
        : getMemoryLimit();
    const limit =
      typeof options.limit === "number" && options.limit > 0
        ? options.limit | 0
        : 4096;
    return runtime.hook.scanU32(normalizedTarget, start, end, limit) || [];
  }

  function normalizeOffsets(value, fallback) {
    if (!Array.isArray(value)) {
      return fallback.slice();
    }
    const offsets = value
      .filter((offset) => typeof offset === "number" && Number.isFinite(offset))
      .map((offset) => offset | 0)
      .filter((offset) => offset >= 0);
    return offsets.length ? Array.from(new Set(offsets)) : fallback.slice();
  }

  function alignedOffsets(end) {
    const offsets = [];
    for (let offset = 0; offset <= end; offset += 4) {
      offsets.push(offset);
    }
    return offsets;
  }

  function findGameContextCandidates(options = {}) {
    const charContextAddress = getCharContextAddress(options);
    if (!isReasonablePointer(charContextAddress)) {
      return {
        candidates: [],
        charContextAddress,
        error: "missing-char-context",
        referenceSlots: [],
      };
    }

    const strict = options.strict !== false;
    const charOffsets = normalizeOffsets(
      options.charOffsets,
      strict ? [GAME_CONTEXT_OFFSETS.character] : alignedOffsets(0x80)
    );
    const worldOffsets = normalizeOffsets(
      options.worldOffsets,
      strict ? [GAME_CONTEXT_OFFSETS.world] : alignedOffsets(0x80)
    );
    const referenceSlots = findReferencesToAddress(charContextAddress, {
      end: options.end,
      limit:
        typeof options.referenceLimit === "number" && options.referenceLimit > 0
          ? options.referenceLimit | 0
          : 4096,
      start: options.start,
    });
    const expectedPlayerNumber = getCharContextPlayerNumber(options);
    const maxRejected =
      typeof options.maxRejected === "number" && options.maxRejected >= 0
        ? options.maxRejected | 0
        : 64;
    const candidates = [];
    const rejected = [];
    const seen = new Set();

    for (const referenceSlot of referenceSlots) {
      for (const charOffset of charOffsets) {
        const gameContextAddress = (referenceSlot - charOffset) >>> 0;
        if (!isReasonablePointer(gameContextAddress)) {
          continue;
        }
        const candidateCharContext = safeReadU32(gameContextAddress + charOffset);
        if (candidateCharContext !== charContextAddress) {
          continue;
        }

        for (const worldOffset of worldOffsets) {
          const worldContextAddress = safeReadU32(gameContextAddress + worldOffset);
          const worldDetail = describeWorldContextCandidate(
            worldContextAddress,
            expectedPlayerNumber
          );
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
            valid: !worldDetail.rejection,
            worldContextAddress,
            worldDetail,
            worldOffset,
          };
          if (entry.valid) {
            candidates.push(entry);
          } else if (rejected.length < maxRejected) {
            rejected.push(entry);
          }
        }
      }
    }

    candidates.sort((left, right) => left.gameContextAddress - right.gameContextAddress);
    return {
      candidates: candidates.slice(
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

  function promoteGameContextAddress(address, options = {}) {
    const normalizedAddress =
      typeof address === "number" && Number.isFinite(address) ? address >>> 0 : 0;
    const resolved = validateGameContextCandidate(normalizedAddress, options);
    if (!resolved) {
      return {
        address: normalizedAddress,
        available: false,
        detail: {
          candidateCharContext: normalizedAddress
            ? safeReadU32(normalizedAddress + GAME_CONTEXT_OFFSETS.character)
            : null,
          worldContextAddress: normalizedAddress
            ? safeReadU32(normalizedAddress + GAME_CONTEXT_OFFSETS.world)
            : null,
        },
        error: "GameContext candidate did not validate",
      };
    }

    cache.gameContextAddress = resolved.gameContextAddress;
    cache.worldContextAddress = resolved.worldContextAddress;
    cache.playerArray = {
      buffer: resolved.worldDetail.playerArrayHeader.buffer,
      bufferEnd: resolved.worldDetail.playerArrayHeader.bufferEnd,
      capacity: resolved.worldDetail.playerArrayHeader.capacity,
      rawCapacity: resolved.worldDetail.playerArrayHeader.capacity,
      handle: 0,
      param: resolved.worldDetail.playerArrayHeader.param,
      propId: 0,
      rawSize: resolved.worldDetail.playerArrayHeader.size,
      size: resolved.worldDetail.playerArrayHeader.size,
      stride: 0x50,
      tableAddress: resolved.worldDetail.playerArrayAddress,
    };
    cache.playerAddress = 0;

    return {
      available: true,
      ...resolved,
    };
  }

  function promoteGameContextFromCurrentCharContext(options = {}) {
    const search = findGameContextCandidates({
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

    const promoted = promoteGameContextAddress(candidate.gameContextAddress, options);
    return {
      ...promoted,
      candidate,
      search,
    };
  }

  function isReasonableControlledAgentId(value) {
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value > 0 &&
      value < 0x10000000
    );
  }

  function readPlayerControlledCharacter(address) {
    const compositeId = safeReadU32(
      address + PLAYER_CONTROLLED_CHARACTER_OFFSETS.compositeId
    );
    const playerNumber =
      typeof compositeId === "number" &&
      Number.isFinite(compositeId) &&
      (compositeId >>> 28) === 0x3
        ? compositeId & 0xffff
        : null;

    return {
      address,
      agentId: safeReadU32(address + PLAYER_CONTROLLED_CHARACTER_OFFSETS.agentId),
      compositeId,
      flags: safeReadU32(address + PLAYER_CONTROLLED_CHARACTER_OFFSETS.flags),
      moreFlags: safeReadU32(address + PLAYER_CONTROLLED_CHARACTER_OFFSETS.moreFlags),
      playerNumber,
    };
  }

  function readArrayHeader(address) {
    return {
      address,
      buffer: safeReadU32(address),
      capacity: safeReadU32(address + 4),
      size: safeReadU32(address + 8),
      param: safeReadU32(address + 0xc),
    };
  }

  function isReasonableArrayHeader(header, elementSize, options = {}) {
    if (!header || !isReasonablePointer(header.buffer)) {
      return false;
    }

    const maxCapacity =
      typeof options.maxCapacity === "number" && options.maxCapacity > 0
        ? options.maxCapacity | 0
        : 256;
    const maxSize =
      typeof options.maxSize === "number" && options.maxSize > 0
        ? options.maxSize | 0
        : maxCapacity;

    if (
      typeof header.capacity !== "number" ||
      typeof header.size !== "number" ||
      header.capacity <= 0 ||
      header.capacity > maxCapacity ||
      header.size <= 0 ||
      header.size > maxSize ||
      header.size > header.capacity
    ) {
      return false;
    }

    const limit = getMemoryLimit();
    const bufferEnd = header.buffer + header.capacity * elementSize;
    return bufferEnd > header.buffer && bufferEnd <= limit;
  }

  function scorePlayerControlledCharacterCandidate(candidate, expectedPlayerNumber) {
    let score = 0;
    const reasons = [];
    const expectedCompositeId =
      typeof expectedPlayerNumber === "number" &&
      Number.isFinite(expectedPlayerNumber) &&
      expectedPlayerNumber > 0
        ? (0x30000000 | (expectedPlayerNumber & 0xffff)) >>> 0
        : 0;

    if (!candidate) {
      return { reasons: ["no-candidate"], score: 0 };
    }

    if (candidate.compositeId === expectedCompositeId && expectedCompositeId) {
      score += 10;
      reasons.push("compositeId");
    }
    if (
      typeof expectedPlayerNumber === "number" &&
      expectedPlayerNumber > 0 &&
      candidate.playerNumber === expectedPlayerNumber
    ) {
      score += 4;
      reasons.push("playerNumber");
    }
    if (isReasonableControlledAgentId(candidate.agentId)) {
      score += 3;
      reasons.push("agentId");
    }
    if (
      typeof candidate.flags === "number" &&
      Number.isFinite(candidate.flags)
    ) {
      score += 1;
      reasons.push("flags");
    }
    if (
      typeof candidate.moreFlags === "number" &&
      Number.isFinite(candidate.moreFlags)
    ) {
      score += 1;
      reasons.push("moreFlags");
    }

    return { reasons, score };
  }

  function isStructurallyPlausiblePlayer(candidate, expectedName = null) {
    if (!candidate || !isReasonablePlayerAgentId(candidate.agentId)) {
      return false;
    }
    if (!isReasonableProfession(candidate.primary)) {
      return false;
    }
    if (!isReasonableProfession(candidate.secondary)) {
      return false;
    }
    if (!isReasonablePlayerNumber(candidate.playerNumber)) {
      return false;
    }
    if (!isReasonablePartySize(candidate.partySize)) {
      return false;
    }
    if (
      candidate.namePtr !== 0 &&
      candidate.namePtr !== null &&
      !isReasonablePointer(candidate.namePtr)
    ) {
      return false;
    }
    if (
      candidate.nameEncPtr !== 0 &&
      candidate.nameEncPtr !== null &&
      !isReasonablePointer(candidate.nameEncPtr)
    ) {
      return false;
    }
    if (
      typeof expectedName === "string" &&
      expectedName &&
      !candidate.name
    ) {
      return false;
    }
    return true;
  }

  function scorePlayerStructCandidate(candidate, expectedName, expectedPlayerNumber) {
    if (!isStructurallyPlausiblePlayer(candidate, expectedName)) {
      return { reasons: ["structural-reject"], score: 0 };
    }

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
    if (
      typeof expectedPlayerNumber === "number" &&
      expectedPlayerNumber > 0 &&
      candidate.playerNumber === expectedPlayerNumber
    ) {
      score += 8;
      reasons.push("playerNumber");
    }
    if (
      typeof expectedPlayerNumber === "number" &&
      expectedPlayerNumber > 0 &&
      candidate.partyLeaderPlayerNumber === expectedPlayerNumber
    ) {
      score += 1;
      reasons.push("partyLeaderPlayerNumber");
    }
    if (isReasonablePlayerAgentId(candidate.agentId)) {
      score += 2;
      reasons.push("agentId");
    }
    if (isReasonableProfession(candidate.primary)) {
      score += 1;
      reasons.push("primary");
    }
    if (isReasonableProfession(candidate.secondary)) {
      score += 1;
      reasons.push("secondary");
    }
    if (isReasonablePartySize(candidate.partySize)) {
      score += 1;
      reasons.push("partySize");
    }

    return { reasons, score };
  }

  function isValidPlayerStruct(address, expectedName, expectedPlayerNumber) {
    if (!address) {
      return false;
    }
    const candidate = readPlayerStruct(address);
    const scored = scorePlayerStructCandidate(
      candidate,
      expectedName,
      expectedPlayerNumber
    );
    return scored.score >= 12;
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

  function getDirectPlayerArray(options = {}) {
    if (cache.playerArray) {
      return cache.playerArray;
    }

    const playerPropId = getConfiguredPropId("modules.player.playerPropId");
    const entry = readPropArrayById(playerPropId);
    if (!entry) {
      return null;
    }

    cache.playerArray = entry;
    return entry;
  }

  function getAgentContextLayout() {
    const definition = getDefinition("modules.player.agentContextLayout");
    return definition && typeof definition === "object" ? definition : AGENT_CONTEXT_OFFSETS;
  }

  function getPropAgentContextAddress() {
    const agentPropId =
      getConfiguredPropId("modules.player.agentPropId") || 0x02;
    const handle = getPropHandle(agentPropId);
    return {
      address: isReasonablePointer(handle) ? handle >>> 0 : 0,
      propId: agentPropId,
      source: "propTable",
    };
  }

  function getGameplayAgentContextAddress() {
    const gameplayContextAddress =
      typeof runtime.map?.getGameplayContextAddress === "function"
        ? runtime.map.getGameplayContextAddress() || 0
        : 0;
    const address = isReasonablePointer(gameplayContextAddress)
      ? safeReadU32(gameplayContextAddress + GAME_CONTEXT_OFFSETS.agent)
      : 0;
    return {
      address: isReasonablePointer(address) ? address >>> 0 : 0,
      gameplayContextAddress,
      propId: 0x02,
      source: "gameplayContext",
    };
  }

  function getAgentContextAddressCandidates() {
    const candidates = [
      getPropAgentContextAddress(),
      getGameplayAgentContextAddress(),
    ].filter((candidate) => candidate.address);
    const seen = new Set();
    return candidates.filter((candidate) => {
      if (seen.has(candidate.address)) {
        return false;
      }
      seen.add(candidate.address);
      return true;
    });
  }

  function readDirectAgentContextCandidate(candidate, layout) {
    const contextAddress = candidate?.address || 0;
    if (!contextAddress || !layout) {
      return null;
    }

    const agentArrayOffset =
      typeof layout.agentArray === "number"
        ? layout.agentArray | 0
        : AGENT_CONTEXT_OFFSETS.agentArray;
    const agentCountOffset =
      typeof layout.agentCount === "number"
        ? layout.agentCount | 0
        : AGENT_CONTEXT_OFFSETS.agentCount;
    const instanceTimerOffset =
      typeof layout.instanceTimer === "number"
        ? layout.instanceTimer | 0
        : AGENT_CONTEXT_OFFSETS.instanceTimer;
    const worldX0Offset =
      typeof layout.worldX0 === "number"
        ? layout.worldX0 | 0
        : AGENT_CONTEXT_OFFSETS.worldX0;
    const worldY0Offset =
      typeof layout.worldY0 === "number"
        ? layout.worldY0 | 0
        : AGENT_CONTEXT_OFFSETS.worldY0;
    const worldX1Offset =
      typeof layout.worldX1 === "number"
        ? layout.worldX1 | 0
        : AGENT_CONTEXT_OFFSETS.worldX1;
    const worldY1Offset =
      typeof layout.worldY1 === "number"
        ? layout.worldY1 | 0
        : AGENT_CONTEXT_OFFSETS.worldY1;
    const agentArray = safeReadU32(contextAddress + agentArrayOffset);
    const agentCount = safeReadU32(contextAddress + agentCountOffset);

    if (
      !isReasonablePointer(agentArray) ||
      typeof agentCount !== "number" ||
      !Number.isFinite(agentCount) ||
      agentCount <= 0 ||
      agentCount > 0x100000
    ) {
      return null;
    }

    const agentArrayEnd = agentArray + agentCount * 4;
    if (agentArrayEnd <= agentArray || agentArrayEnd > getMemoryLimit()) {
      return null;
    }

    const instanceTimer = safeReadU32(contextAddress + instanceTimerOffset) || 0;
    const worldBounds = {
      x0: safeReadF32(contextAddress + worldX0Offset),
      y0: safeReadF32(contextAddress + worldY0Offset),
      x1: safeReadF32(contextAddress + worldX1Offset),
      y1: safeReadF32(contextAddress + worldY1Offset),
    };

    return {
      address: contextAddress,
      agentArray,
      agentArrayEnd,
      agentCount,
      instanceTimer,
      layout: {
        agentArray: agentArrayOffset,
        agentCount: agentCountOffset,
        instanceTimer: instanceTimerOffset,
        worldX0: worldX0Offset,
        worldY0: worldY0Offset,
        worldX1: worldX1Offset,
        worldY1: worldY1Offset,
      },
      propId: candidate.propId || 0x02,
      source: candidate.source,
      worldBounds,
    };
  }

  function getDirectAgentContext() {
    const layout = getAgentContextLayout();
    const candidates = getAgentContextAddressCandidates();
    if (!layout || candidates.length === 0) {
      cachedAgentContext = null;
      return null;
    }

    for (const candidate of candidates) {
      const context = readDirectAgentContextCandidate(candidate, layout);
      if (!context) {
        continue;
      }
      if (cachedAgentContext?.address === context.address) {
        Object.assign(cachedAgentContext, context);
        return cachedAgentContext;
      }
      cachedAgentContext = context;
      return cachedAgentContext;
    }

    cachedAgentContext = null;
    return null;
  }

  function inspectAgentContextCandidates() {
    const layout = getAgentContextLayout();
    return getAgentContextAddressCandidates().map((candidate) => {
      const context = readDirectAgentContextCandidate(candidate, layout);
      return {
        ...candidate,
        context,
        valid: !!context,
      };
    });
  }

  function clampToBounds(value, lower, upper) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return value;
    }
    if (
      typeof lower !== "number" ||
      typeof upper !== "number" ||
      !Number.isFinite(lower) ||
      !Number.isFinite(upper)
    ) {
      return value;
    }
    if (value < lower) {
      return lower;
    }
    if (value > upper) {
      return upper;
    }
    return value;
  }

  function readDirectAgentPosition(agentAddress, context) {
    if (!isReasonablePointer(agentAddress) || !context) {
      return null;
    }

    const stopMovementTime =
      safeReadU32(agentAddress + AGENT_OFFSETS.stopMovementTime) || 0;
    if (
      stopMovementTime &&
      context.instanceTimer >= stopMovementTime
    ) {
      const stoppedPosition = {
        x: safeReadF32(agentAddress + AGENT_OFFSETS.stoppedX),
        y: safeReadF32(agentAddress + AGENT_OFFSETS.stoppedY),
        z: safeReadF32(agentAddress + AGENT_OFFSETS.stoppedZ),
      };
      return isReasonableDirectAgentPosition(stoppedPosition, context.worldBounds)
        ? {
            ...stoppedPosition,
            source: "AgentContext.stoppedPosition",
          }
        : null;
    }

    const x = safeReadF32(agentAddress + AGENT_OFFSETS.x);
    const y = safeReadF32(agentAddress + AGENT_OFFSETS.y);
    const z = safeReadF32(agentAddress + AGENT_OFFSETS.z);
    const velocityX = safeReadF32(agentAddress + AGENT_OFFSETS.velocityX);
    const velocityY = safeReadF32(agentAddress + AGENT_OFFSETS.velocityY);
    const movementStartTime =
      safeReadU32(agentAddress + AGENT_OFFSETS.movementStartTime) || 0;
    const elapsedSeconds =
      context.instanceTimer && movementStartTime
        ? Math.max(0, context.instanceTimer - movementStartTime) * 0.001
        : 0;
    const predictedX =
      typeof velocityX === "number" && Number.isFinite(velocityX)
        ? x + velocityX * elapsedSeconds
        : x;
    const predictedY =
      typeof velocityY === "number" && Number.isFinite(velocityY)
        ? y + velocityY * elapsedSeconds
        : y;
    const position = {
      x: clampToBounds(predictedX, context.worldBounds.x0, context.worldBounds.x1),
      y: clampToBounds(predictedY, context.worldBounds.y0, context.worldBounds.y1),
      z,
    };
    return isReasonableDirectAgentPosition(position, context.worldBounds)
      ? {
          ...position,
          source: elapsedSeconds
            ? "AgentContext.predictedPosition"
            : "AgentContext.position",
        }
      : null;
  }

  function getDirectAgentAddressByAgentId(agentId) {
    const normalizedAgentId =
      typeof agentId === "number" && Number.isFinite(agentId) ? agentId >>> 0 : 0;
    const context = getDirectAgentContext();
    if (!context || normalizedAgentId >= context.agentCount) {
      return 0;
    }
    const address = safeReadU32(context.agentArray + normalizedAgentId * 4);
    return isReasonablePointer(address) ? address >>> 0 : 0;
  }

  function getDirectAgentPositionByAgentId(agentId) {
    const context = getDirectAgentContext();
    const address = getDirectAgentAddressByAgentId(agentId);
    if (!context || !address) {
      return null;
    }
    const position = readDirectAgentPosition(address, context);
    return position
      ? {
          ...position,
          address,
          agentId: agentId >>> 0,
          contextAddress: context.address,
        }
      : null;
  }

  function getDirectPlayerAddress(options = {}) {
    const playerArray = getDirectPlayerArray(options);
    if (!playerArray) {
      return 0;
    }

    const configuredName =
      typeof options.playerName === "string" && options.playerName.trim()
        ? options.playerName.trim()
        : getConfiguredCharacterName();
    const playerNumber =
      getMissionPlayerNumberFromDirectPath() || getExpectedPlayerNumber(options);

    if (
      !isReasonablePlayerNumber(playerNumber) ||
      playerNumber >= getArraySlotCount(playerArray)
    ) {
      return 0;
    }

    const address =
      (playerArray.buffer + playerNumber * playerArray.stride) >>> 0;
    const candidate = readPlayerStruct(address);
    if (!isStructurallyPlausiblePlayer(candidate, configuredName)) {
      return 0;
    }
    if (candidate.playerNumber !== playerNumber) {
      return 0;
    }
    if (configuredName && candidate.name && !namesEqual(candidate.name, configuredName)) {
      return 0;
    }
    return address;
  }

  function readAgentLivingStruct(address) {
    return {
      address,
      agentId: safeReadU32(address + AGENT_LIVING_OFFSETS.agentId),
      agentModelType: safeReadU16(address + AGENT_LIVING_OFFSETS.agentModelType),
      animationCode: safeReadU32(address + AGENT_LIVING_OFFSETS.animationCode),
      animationId: safeReadU32(address + AGENT_LIVING_OFFSETS.animationId),
      animationSpeed: safeReadF32(address + AGENT_LIVING_OFFSETS.animationSpeed),
      effects: safeReadU32(address + AGENT_LIVING_OFFSETS.effects),
      energy: safeReadF32(address + AGENT_LIVING_OFFSETS.energy),
      energyRegen: safeReadF32(address + AGENT_LIVING_OFFSETS.energyRegen),
      hp: safeReadF32(address + AGENT_LIVING_OFFSETS.hp),
      hpPips: safeReadF32(address + AGENT_LIVING_OFFSETS.hpPips),
      level: safeReadU8(address + AGENT_LIVING_OFFSETS.level),
      loginNumber: safeReadU32(address + AGENT_LIVING_OFFSETS.loginNumber),
      maxEnergy: safeReadU32(address + AGENT_LIVING_OFFSETS.maxEnergy),
      maxHp: safeReadU32(address + AGENT_LIVING_OFFSETS.maxHp),
      modelState: safeReadU32(address + AGENT_LIVING_OFFSETS.modelState),
      owner: safeReadU32(address + AGENT_LIVING_OFFSETS.owner),
      playerNumber: safeReadU16(address + AGENT_LIVING_OFFSETS.playerNumber),
      position: {
        x: safeReadF32(address + AGENT_LIVING_OFFSETS.x),
        y: safeReadF32(address + AGENT_LIVING_OFFSETS.y),
        z: safeReadF32(address + AGENT_LIVING_OFFSETS.z),
      },
      primary: safeReadU8(address + AGENT_LIVING_OFFSETS.primary),
      secondary: safeReadU8(address + AGENT_LIVING_OFFSETS.secondary),
      skill: safeReadU16(address + AGENT_LIVING_OFFSETS.skill),
      teamId: safeReadU8(address + AGENT_LIVING_OFFSETS.teamId),
      transmogNpcId: safeReadU32(address + AGENT_LIVING_OFFSETS.transmogNpcId),
      type: safeReadU32(address + AGENT_LIVING_OFFSETS.type),
      typeMap: safeReadU32(address + AGENT_LIVING_OFFSETS.typeMap),
      weaponType: safeReadU16(address + AGENT_LIVING_OFFSETS.weaponType),
    };
  }

  function scoreAgentLivingCandidate(
    candidate,
    expectedAgentId,
    expectedPlayerNumber
  ) {
    if (
      !candidate ||
      candidate.agentId !== expectedAgentId ||
      !isReasonableAgentPosition(candidate.position) ||
      (candidate.type & 0xdb) === 0 ||
      !isReasonableProfession(candidate.primary) ||
      !isReasonableProfession(candidate.secondary) ||
      !isReasonablePlayerNumber(candidate.playerNumber) ||
      typeof candidate.hp !== "number" ||
      !Number.isFinite(candidate.hp) ||
      candidate.hp < 0 ||
      candidate.hp > 1.2 ||
      typeof candidate.level !== "number" ||
      !Number.isFinite(candidate.level) ||
      candidate.level < 1 ||
      candidate.level > 30
    ) {
      return { reasons: ["structural-reject"], score: 0 };
    }

    let score = 0;
    const reasons = [];

    score += 10;
    reasons.push("agentId");
    score += 3;
    reasons.push("livingType");
    score += 4;
    reasons.push("position");
    score += 2;
    reasons.push("profession");
    if (
      typeof expectedPlayerNumber === "number" &&
      expectedPlayerNumber > 0 &&
      candidate.playerNumber === expectedPlayerNumber
    ) {
      score += 6;
      reasons.push("playerNumber");
    }
    score += 3;
    reasons.push("hp");
    score += 1;
    reasons.push("level");

    return { reasons, score };
  }

  function isValidAgentLiving(address, expectedAgentId, expectedPlayerNumber) {
    if (!address) {
      return false;
    }
    const candidate = readAgentLivingStruct(address);
    const scored = scoreAgentLivingCandidate(
      candidate,
      expectedAgentId,
      expectedPlayerNumber
    );
    return scored.score >= 13;
  }

  function findPlayerStructCandidatesByName(name, options = {}) {
    if (!name || typeof name !== "string") {
      return [];
    }

    const limit =
      typeof options.limit === "number" && options.limit > 0
        ? options.limit | 0
        : 8;
    const expectedPlayerNumber = getExpectedPlayerNumber(options);
    const hits = runtime.hook.findAllUtf16(
      name,
      0,
      getMemoryLimit(),
      limit
    );
    const candidates = new Map();

    for (const hitAddress of hits) {
      const refs =
        typeof runtime.map?.findReferencesToAddress === "function"
          ? runtime.map.findReferencesToAddress(hitAddress, { limit: 256 })
          : [];

      for (const slotAddress of refs) {
        const address = (slotAddress - PLAYER_OFFSETS.namePtr) >>> 0;
        if (!address) {
          continue;
        }

        const candidate = readPlayerStruct(address);
        const scored = scorePlayerStructCandidate(
          candidate,
          name,
          expectedPlayerNumber
        );
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

  function findPlayerStructCandidatesByPlayerNumber(playerNumber, options = {}) {
    const normalizedPlayerNumber =
      typeof playerNumber === "number" && Number.isFinite(playerNumber)
        ? playerNumber | 0
        : 0;
    if (!normalizedPlayerNumber) {
      return [];
    }

    const limit =
      typeof options.limit === "number" && options.limit > 0
        ? options.limit | 0
        : 256;
    const configuredName =
      typeof options.playerName === "string" && options.playerName.trim()
        ? options.playerName.trim()
        : getConfiguredCharacterName();
    const candidates = new Map();
    const hits = runtime.hook.scanU32(
      normalizedPlayerNumber >>> 0,
      0,
      getMemoryLimit(),
      limit
    );

    for (const slotAddress of hits) {
      const address = (slotAddress - PLAYER_OFFSETS.playerNumber) >>> 0;
      if (!address) {
        continue;
      }

      const candidate = readPlayerStruct(address);
      const scored = scorePlayerStructCandidate(
        candidate,
        configuredName,
        normalizedPlayerNumber
      );
      if (scored.score <= 0) {
        continue;
      }

      const entry = {
        ...candidate,
        playerNumberSlot: slotAddress,
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

  function inspectPlayerArray(address, count = 8) {
    const normalizedAddress =
      typeof address === "number" && Number.isFinite(address) ? address >>> 0 : 0;
    const normalizedCount =
      typeof count === "number" && count > 0 ? count | 0 : 8;
    if (!normalizedAddress) {
      return [];
    }

    const entries = [];
    for (let index = 0; index < normalizedCount; index += 1) {
      const entryAddress = (normalizedAddress + index * 0x50) >>> 0;
      entries.push(readPlayerStruct(entryAddress));
    }
    return entries;
  }

  function inspectPlayerArrayHeader(address, options = {}) {
    const normalizedAddress =
      typeof address === "number" && Number.isFinite(address) ? address >>> 0 : 0;
    if (!normalizedAddress) {
      return null;
    }

    const header = readArrayHeader(normalizedAddress);
    const expectedName =
      typeof options.playerName === "string" && options.playerName.trim()
        ? options.playerName.trim()
        : getConfiguredCharacterName();
    const expectedPlayerNumber = getExpectedPlayerNumber(options);
    const sampleCount =
      typeof options.sampleCount === "number" && options.sampleCount > 0
        ? options.sampleCount | 0
        : 8;
    const reasonable = isReasonableArrayHeader(header, 0x50, options);
    const entries = reasonable
      ? inspectPlayerArray(header.buffer, Math.min(header.size, sampleCount))
      : [];
    const plausibleEntries = [];
    const matchedEntries = [];
    let score = 0;
    const reasons = [];

    if (reasonable) {
      score += 2;
    }

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const scored = scorePlayerStructCandidate(
        entry,
        expectedName,
        expectedPlayerNumber
      );
      if (isStructurallyPlausiblePlayer(entry)) {
        plausibleEntries.push({
          address: entry.address,
          index,
          playerNumber: entry.playerNumber,
          name: entry.name,
          score: scored.score,
        });
        score += 3;
      }
      if (scored.score >= 12) {
        matchedEntries.push({
          address: entry.address,
          index,
          playerNumber: entry.playerNumber,
          name: entry.name,
          reasons: scored.reasons,
          score: scored.score,
        });
        score += 6;
      }
    }

    if (reasonable && plausibleEntries.length > 0) {
      reasons.push("arrayHeader");
      if (header.size <= 64) {
        score += 2;
        reasons.push("size");
      }
    }
    if (matchedEntries.length) {
      reasons.push("matchedEntry");
    }
    if (plausibleEntries.length >= 2) {
      reasons.push("multiplePlausibleEntries");
    }

    return {
      ...header,
      address: normalizedAddress,
      entries,
      matchedEntries,
      plausibleEntries,
      reasons,
      score,
    };
  }

  function readAgentInfo(address) {
    const nameEncPtr = safeReadU32(address + 0x34);
    return {
      address,
      nameEncPtr,
      nameEncText: isReasonablePointer(nameEncPtr) ? readUtf16(nameEncPtr, 32) : "",
    };
  }

  function inspectAgentInfoArrayHeader(address, options = {}) {
    const normalizedAddress =
      typeof address === "number" && Number.isFinite(address) ? address >>> 0 : 0;
    if (!normalizedAddress) {
      return null;
    }

    const header = readArrayHeader(normalizedAddress);
    const sampleCount =
      typeof options.sampleCount === "number" && options.sampleCount > 0
        ? options.sampleCount | 0
        : 8;
    const reasonable = isReasonableArrayHeader(header, 0x38, options);
    const entries = [];
    const plausibleEntries = [];
    let score = 0;
    const reasons = [];

    if (reasonable) {
      score += 2;
      for (let index = 0; index < Math.min(header.size, sampleCount); index += 1) {
        const entry = readAgentInfo(header.buffer + index * 0x38);
        entries.push(entry);
        if (isReasonablePointer(entry.nameEncPtr)) {
          plausibleEntries.push({
            address: entry.address,
            index,
            nameEncPtr: entry.nameEncPtr,
            nameEncText: entry.nameEncText,
          });
          score += entry.nameEncText ? 4 : 2;
        }
      }
      if (plausibleEntries.length > 0) {
        reasons.push("arrayHeader");
      }
      if (plausibleEntries.some((entry) => entry.nameEncText)) {
        reasons.push("nameEncText");
      }
      if (header.size <= 256) {
        score += 1;
        reasons.push("size");
      }
    }

    return {
      ...header,
      address: normalizedAddress,
      entries,
      plausibleEntries,
      reasons,
      score,
    };
  }

  function scorePlayerArrayCandidate(
    entries,
    expectedPlayerNumber,
    expectedName,
    matchedIndex
  ) {
    let score = 0;
    const reasons = [];
    const plausibleEntries = [];

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (!isStructurallyPlausiblePlayer(entry)) {
        continue;
      }
      plausibleEntries.push({
        address: entry.address,
        index,
        playerNumber: entry.playerNumber,
      });
      score += 2;
    }

    if (
      typeof matchedIndex === "number" &&
      matchedIndex >= 0 &&
      matchedIndex < entries.length
    ) {
      const matchedEntry = entries[matchedIndex];
      if (
        matchedEntry &&
        matchedEntry.playerNumber === expectedPlayerNumber &&
        isStructurallyPlausiblePlayer(matchedEntry, expectedName)
      ) {
        score += 8;
        reasons.push("matchedEntry");
      }
    }

    if (plausibleEntries.length >= 2) {
      score += 4;
      reasons.push("multiplePlausibleEntries");
    }
    if (plausibleEntries.length >= 3) {
      score += 4;
      reasons.push("arrayLikeStride");
    }
    if (
      typeof expectedName === "string" &&
      expectedName &&
      entries.some((entry) => entry && entry.name === expectedName)
    ) {
      score += 6;
      reasons.push("nameInArray");
    }

    return {
      plausibleEntries,
      reasons,
      score,
    };
  }

  function findPlayerArrayCandidatesByPlayerNumber(playerNumber, options = {}) {
    const normalizedPlayerNumber =
      typeof playerNumber === "number" && Number.isFinite(playerNumber)
        ? playerNumber | 0
        : 0;
    if (!normalizedPlayerNumber) {
      return [];
    }

    const limit =
      typeof options.limit === "number" && options.limit > 0
        ? options.limit | 0
        : 256;
    const windowEntries =
      typeof options.windowEntries === "number" && options.windowEntries > 0
        ? options.windowEntries | 0
        : 8;
    const maxPrecedingEntries =
      typeof options.maxPrecedingEntries === "number" &&
      options.maxPrecedingEntries >= 0
        ? options.maxPrecedingEntries | 0
        : 31;
    const trailingEntries =
      typeof options.trailingEntries === "number" && options.trailingEntries >= 0
        ? options.trailingEntries | 0
        : 8;
    const expectedName =
      typeof options.playerName === "string" && options.playerName.trim()
        ? options.playerName.trim()
        : getConfiguredCharacterName();
    const hits = runtime.hook.scanU32(
      normalizedPlayerNumber >>> 0,
      0,
      getMemoryLimit(),
      limit
    );
    const candidates = new Map();

    for (const slotAddress of hits) {
      const matchedAddress = (slotAddress - PLAYER_OFFSETS.playerNumber) >>> 0;
      if (!matchedAddress) {
        continue;
      }

      for (
        let precedingEntries = 0;
        precedingEntries <= maxPrecedingEntries;
        precedingEntries += 1
      ) {
        const arrayAddress = (matchedAddress - precedingEntries * 0x50) >>> 0;
        if (!arrayAddress) {
          continue;
        }

        const inspectCount = Math.max(
          windowEntries,
          precedingEntries + 1,
          precedingEntries + trailingEntries
        );
        const entries = inspectPlayerArray(arrayAddress, inspectCount);
        const scored = scorePlayerArrayCandidate(
          entries,
          normalizedPlayerNumber,
          expectedName,
          precedingEntries
        );
        if (scored.score <= 0) {
          continue;
        }

        const matchedEntry = entries[precedingEntries] || null;
        const entry = {
          address: arrayAddress,
          entries,
          matchedEntry,
          matchedIndex: precedingEntries,
          matchedPlayerAddress: matchedEntry ? matchedEntry.address : null,
          playerNumberSlot: slotAddress,
          plausibleEntries: scored.plausibleEntries,
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

  function findPlayerArrayHeaderCandidatesNear(address, options = {}) {
    const normalizedAddress =
      typeof address === "number" && Number.isFinite(address) ? address >>> 0 : 0;
    if (!normalizedAddress) {
      return [];
    }

    const before =
      typeof options.before === "number" && options.before >= 0
        ? options.before | 0
        : 0x100;
    const after =
      typeof options.after === "number" && options.after > 0
        ? options.after | 0
        : 0x1200;
    const step =
      typeof options.step === "number" && options.step > 0 ? options.step | 0 : 4;
    const minScore =
      typeof options.minScore === "number" ? options.minScore : 8;
    const limit =
      typeof options.limit === "number" && options.limit > 0
        ? options.limit | 0
        : 16;
    const start = Math.max(0, normalizedAddress - before);
    const end = Math.min(getMemoryLimit(), normalizedAddress + after);
    const candidates = [];

    for (let slotAddress = start; slotAddress + 0x10 <= end; slotAddress += step) {
      const candidate = inspectPlayerArrayHeader(slotAddress, options);
      if (!candidate || candidate.score < minScore) {
        continue;
      }
      candidates.push(candidate);
    }

    return candidates
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return left.address - right.address;
      })
      .slice(0, limit);
  }

  function findAgentInfoArrayHeaderCandidatesNear(address, options = {}) {
    const normalizedAddress =
      typeof address === "number" && Number.isFinite(address) ? address >>> 0 : 0;
    if (!normalizedAddress) {
      return [];
    }

    const before =
      typeof options.before === "number" && options.before >= 0
        ? options.before | 0
        : 0x100;
    const after =
      typeof options.after === "number" && options.after > 0
        ? options.after | 0
        : 0x1400;
    const step =
      typeof options.step === "number" && options.step > 0 ? options.step | 0 : 4;
    const minScore =
      typeof options.minScore === "number" ? options.minScore : 6;
    const limit =
      typeof options.limit === "number" && options.limit > 0
        ? options.limit | 0
        : 16;
    const start = Math.max(0, normalizedAddress - before);
    const end = Math.min(getMemoryLimit(), normalizedAddress + after);
    const candidates = [];

    for (let slotAddress = start; slotAddress + 0x10 <= end; slotAddress += step) {
      const candidate = inspectAgentInfoArrayHeader(slotAddress, options);
      if (!candidate || candidate.score < minScore) {
        continue;
      }
      candidates.push(candidate);
    }

    return candidates
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return left.address - right.address;
      })
      .slice(0, limit);
  }

  function findAgentLivingCandidatesByAgentId(agentId, options = {}) {
    const normalizedAgentId =
      typeof agentId === "number" && Number.isFinite(agentId) ? agentId >>> 0 : 0;
    if (!normalizedAgentId) {
      return [];
    }

    const limit =
      typeof options.limit === "number" && options.limit > 0
        ? options.limit | 0
        : 16;
    const expectedPlayerNumber = getExpectedPlayerNumber(options);
    const hits = runtime.hook.scanU32(
      normalizedAgentId,
      0,
      getMemoryLimit(),
      limit
    );
    const candidates = new Map();

    for (const slotAddress of hits) {
      const address = (slotAddress - AGENT_LIVING_OFFSETS.agentId) >>> 0;
      if (!address) {
        continue;
      }

      const candidate = readAgentLivingStruct(address);
      const scored = scoreAgentLivingCandidate(
        candidate,
        normalizedAgentId,
        expectedPlayerNumber
      );
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

  function findAgentLivingCandidatesByPlayerNumber(playerNumber, options = {}) {
    const normalizedPlayerNumber =
      typeof playerNumber === "number" && Number.isFinite(playerNumber)
        ? playerNumber | 0
        : 0;
    if (!normalizedPlayerNumber) {
      return [];
    }

    const limit =
      typeof options.limit === "number" && options.limit > 0
        ? options.limit | 0
        : 64;
    const hits = runtime.hook.scanU32(
      normalizedPlayerNumber & 0xffff,
      0,
      getMemoryLimit(),
      limit
    );
    const candidates = new Map();

    for (const slotAddress of hits) {
      const low16 = safeReadU16(slotAddress);
      const high16 = safeReadU16(slotAddress + 2);
      if (low16 !== normalizedPlayerNumber || high16 === null) {
        continue;
      }

      const address = (slotAddress - AGENT_LIVING_OFFSETS.playerNumber) >>> 0;
      if (!address) {
        continue;
      }

      const candidate = readAgentLivingStruct(address);
      const scored = scoreAgentLivingCandidate(
        candidate,
        candidate.agentId,
        normalizedPlayerNumber
      );
      if (scored.score <= 0) {
        continue;
      }

      const entry = {
        ...candidate,
        playerNumberSlot: slotAddress,
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

  function findPlayerStructCandidatesByAgentId(agentId, options = {}) {
    const normalizedAgentId =
      typeof agentId === "number" && Number.isFinite(agentId) ? agentId >>> 0 : 0;
    if (!normalizedAgentId) {
      return [];
    }

    const limit =
      typeof options.limit === "number" && options.limit > 0
        ? options.limit | 0
        : 128;
    const configuredName =
      typeof options.playerName === "string" && options.playerName.trim()
        ? options.playerName.trim()
        : getConfiguredCharacterName();
    const expectedPlayerNumber = getExpectedPlayerNumber(options);
    const hits = runtime.hook.scanU32(
      normalizedAgentId,
      0,
      getMemoryLimit(),
      limit
    );
    const candidates = new Map();

    for (const slotAddress of hits) {
      const address = (slotAddress - PLAYER_OFFSETS.agentId) >>> 0;
      if (!address) {
        continue;
      }

      const candidate = readPlayerStruct(address);
      const scored = scorePlayerStructCandidate(
        candidate,
        configuredName,
        expectedPlayerNumber
      );
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

  function findPlayerControlledCharacterCandidates(playerNumber, options = {}) {
    const normalizedPlayerNumber =
      typeof playerNumber === "number" && Number.isFinite(playerNumber)
        ? playerNumber | 0
        : 0;
    if (!normalizedPlayerNumber) {
      return [];
    }

    const limit =
      typeof options.limit === "number" && options.limit > 0
        ? options.limit | 0
        : 64;
    const compositeId = (0x30000000 | (normalizedPlayerNumber & 0xffff)) >>> 0;
    const hits = runtime.hook.scanU32(
      compositeId,
      0,
      getMemoryLimit(),
      limit
    );
    const candidates = new Map();

    for (const slotAddress of hits) {
      const address =
        (slotAddress - PLAYER_CONTROLLED_CHARACTER_OFFSETS.compositeId) >>> 0;
      if (!address) {
        continue;
      }

      const candidate = readPlayerControlledCharacter(address);
      const scored = scorePlayerControlledCharacterCandidate(
        candidate,
        normalizedPlayerNumber
      );
      if (scored.score <= 0) {
        continue;
      }

      const entry = {
        ...candidate,
        compositeIdSlot: slotAddress,
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

  function getResolvedPlayerAddress(options = {}) {
    const configuredName = getConfiguredCharacterName();
    const expectedPlayerNumber = getExpectedPlayerNumber(options);

    if (promotedPlayerAddress) {
      return promotedPlayerAddress >>> 0;
    }

    if (
      cache.playerAddress &&
      cache.playerName === configuredName &&
      isValidPlayerStruct(cache.playerAddress, configuredName, expectedPlayerNumber)
    ) {
      return cache.playerAddress >>> 0;
    }

    const directPlayerAddress = getDirectPlayerAddress({
      ...options,
      playerName: configuredName,
      playerNumber: expectedPlayerNumber,
    });
    if (directPlayerAddress) {
      cache.playerAddress = directPlayerAddress >>> 0;
      cache.playerName = configuredName;
      return cache.playerAddress;
    }

    if (!configuredName) {
      if (!expectedPlayerNumber) {
        return 0;
      }
    }

    if (!shouldScan(options)) {
      return 0;
    }

    if (expectedPlayerNumber) {
      const livingMatches = findAgentLivingCandidatesByPlayerNumber(
        expectedPlayerNumber,
        options
      );
      const livingMatch = livingMatches[0] || null;
      if (livingMatch && livingMatch.agentId) {
        const agentMatches = findPlayerStructCandidatesByAgentId(
          livingMatch.agentId,
          {
            ...options,
            playerName: configuredName,
            playerNumber: expectedPlayerNumber,
          }
        );
        const agentMatch = agentMatches[0] || null;
        if (agentMatch) {
          cache.playerAddress = agentMatch.address >>> 0;
          cache.playerName = configuredName;
          return cache.playerAddress;
        }
      }

      const numberMatches = findPlayerStructCandidatesByPlayerNumber(
        expectedPlayerNumber,
        {
          ...options,
          playerName: configuredName,
        }
      );
      const numberMatch = numberMatches[0] || null;
      if (numberMatch) {
        cache.playerAddress = numberMatch.address >>> 0;
        cache.playerName = configuredName;
        return cache.playerAddress;
      }
    }

    if (!configuredName) {
      return 0;
    }

    const matches = findPlayerStructCandidatesByName(configuredName, options);
    const match = matches[0] || null;
    if (!match) {
      return 0;
    }

    cache.playerAddress = match.address >>> 0;
    cache.playerName = configuredName;
    return cache.playerAddress;
  }

  function getResolvedAgentAddress(options = {}) {
    const player = getPlayer(options);
    const expectedPlayerNumber = getExpectedPlayerNumber(options);
    const expectedAgentId =
      player && typeof player.agentId === "number" ? player.agentId >>> 0 : 0;

    if (promotedAgentAddress) {
      return promotedAgentAddress >>> 0;
    }

    if (
      cache.agentAddress &&
      cache.agentId === expectedAgentId &&
      isValidAgentLiving(cache.agentAddress, expectedAgentId, expectedPlayerNumber)
    ) {
      return cache.agentAddress >>> 0;
    }

    if (!expectedAgentId) {
      return 0;
    }

    if (!shouldScan(options)) {
      return 0;
    }

    const matches = findAgentLivingCandidatesByAgentId(expectedAgentId, options);
    const match = matches[0] || null;
    if (!match) {
      return 0;
    }

    cache.agentAddress = match.address >>> 0;
    cache.agentId = expectedAgentId;
    return cache.agentAddress;
  }

  function getPlayer(options = {}) {
    const address = getResolvedPlayerAddress(options);
    return address ? readPlayerStruct(address) : null;
  }

  function getAgent(options = {}) {
    const address = getResolvedAgentAddress(options);
    return address ? readAgentLivingStruct(address) : null;
  }

  function promotePlayerAddress(address) {
    const normalizedAddress =
      typeof address === "number" && Number.isFinite(address) ? address >>> 0 : 0;
    if (!normalizedAddress) {
      return {
        available: false,
        error: "A valid Player address is required",
      };
    }

    promotedPlayerAddress = normalizedAddress;
    return {
      address: normalizedAddress,
      available: true,
      player: readPlayerStruct(normalizedAddress),
    };
  }

  function promoteAgentAddress(address) {
    const normalizedAddress =
      typeof address === "number" && Number.isFinite(address) ? address >>> 0 : 0;
    if (!normalizedAddress) {
      return {
        available: false,
        error: "A valid AgentLiving address is required",
      };
    }

    promotedAgentAddress = normalizedAddress;
    return {
      address: normalizedAddress,
      agent: readAgentLivingStruct(normalizedAddress),
      available: true,
    };
  }

  function clearPromotions() {
    promotedAgentAddress = 0;
    promotedPlayerAddress = 0;
    cache.agentAddress = 0;
    cache.agentId = 0;
    cache.gameContextAddress = 0;
    cache.playerArray = null;
    cache.playerAddress = 0;
    cache.playerName = null;
    cache.worldContextAddress = 0;
    cachedAgentContext = null;
  }

  return Object.freeze({
    clearPromotions,
    describe(options = {}) {
      const resolve = options && options.resolve === true;
      const resolveAgent = options && options.resolveAgent === true;
      const resolveCharContext = options && options.resolveCharContext === true;
      const characterName = getConfiguredCharacterName();
      const player = resolve ? getPlayer(options) : null;
      const agent = resolve && resolveAgent ? getAgent(options) : null;
      return {
        agent: resolve && resolveAgent ? agent : null,
        agentAddress:
          resolve && resolveAgent ? (agent ? agent.address : null) : null,
        charContextAddress:
          resolveCharContext &&
          typeof runtime.map?.getCharContextAddress === "function"
            ? runtime.map.getCharContextAddress()
            : null,
        characterName,
        hasCharacterName: !!characterName,
        player: resolve ? player : null,
        playerAddress: resolve ? (player ? player.address : null) : null,
      };
    },
    findAgentLivingCandidatesByAgentId(agentId, options) {
      return findAgentLivingCandidatesByAgentId(agentId, options);
    },
    findAgentLivingCandidatesByPlayerNumber(playerNumber, options) {
      return findAgentLivingCandidatesByPlayerNumber(playerNumber, options);
    },
    findGameContextCandidates(options = {}) {
      return findGameContextCandidates(options);
    },
    findPlayerStructCandidatesByAgentId(agentId, options) {
      return findPlayerStructCandidatesByAgentId(agentId, options);
    },
    findPlayerControlledCharacterCandidates(playerNumber, options) {
      return findPlayerControlledCharacterCandidates(playerNumber, options);
    },
    findPlayerStructCandidatesByName(name, options) {
      return findPlayerStructCandidatesByName(name, options);
    },
    findPlayerStructCandidatesByPlayerNumber(playerNumber, options) {
      return findPlayerStructCandidatesByPlayerNumber(playerNumber, options);
    },
    findPlayerArrayCandidatesByPlayerNumber(playerNumber, options) {
      return findPlayerArrayCandidatesByPlayerNumber(playerNumber, options);
    },
    findPlayerArrayHeaderCandidatesNear(address, options) {
      return findPlayerArrayHeaderCandidatesNear(address, options);
    },
    findAgentInfoArrayHeaderCandidatesNear(address, options) {
      return findAgentInfoArrayHeaderCandidatesNear(address, options);
    },
    discoverAgent(options = {}) {
      return getAgent({ ...options, scan: true });
    },
    discoverPlayer(options = {}) {
      return getPlayer({ ...options, scan: true });
    },
    getAgent,
    getAgentAddress(options) {
      return getResolvedAgentAddress(options);
    },
    getAgentId(options) {
      const player = getPlayer(options);
      return player ? player.agentId : null;
    },
    getCharacterName() {
      return getConfiguredCharacterName();
    },
    getPlayer,
    getPlayerAddress(options) {
      return getResolvedPlayerAddress(options);
    },
    getPlayerNumber(options) {
      const directPlayerNumber =
        getExpectedPlayerNumber(options) || getMissionPlayerNumberFromDirectPath();
      if (isReasonablePlayerNumber(directPlayerNumber)) {
        return directPlayerNumber;
      }
      const player = getPlayer(options);
      return player ? player.playerNumber : null;
    },
    getPosition(options) {
      const player = getPlayer(options);
      const optionAgentId =
        typeof options?.agentId === "number" && Number.isFinite(options.agentId)
          ? options.agentId >>> 0
          : 0;
      const agentId = optionAgentId || (
        player && typeof player.agentId === "number" ? player.agentId >>> 0 : 0
      );
      const directPosition = agentId
        ? getDirectAgentPositionByAgentId(agentId)
        : null;
      if (directPosition) {
        const { address, agentId: resolvedAgentId, contextAddress, source, ...position } =
          directPosition;
        return {
          ...position,
          agentAddress: address,
          agentId: resolvedAgentId,
          contextAddress,
          source,
        };
      }

      const agent = getAgent(options);
      return agent ? { ...agent.position } : null;
    },
    getDirectAgentAddressByAgentId(agentId) {
      return getDirectAgentAddressByAgentId(agentId);
    },
    getDirectAgentContext() {
      const context = getDirectAgentContext();
      return context
        ? {
            ...context,
            layout: { ...context.layout },
            worldBounds: { ...context.worldBounds },
          }
        : null;
    },
    inspectAgentContextCandidates() {
      return inspectAgentContextCandidates();
    },
    getDirectAgentPositionByAgentId(agentId) {
      return getDirectAgentPositionByAgentId(agentId);
    },
    inspectAgentLiving(address) {
      return readAgentLivingStruct(address);
    },
    inspectPlayer(address) {
      return readPlayerStruct(address);
    },
    inspectPlayerArrayHeader(address, options) {
      return inspectPlayerArrayHeader(address, options);
    },
    inspectAgentInfoArrayHeader(address, options) {
      return inspectAgentInfoArrayHeader(address, options);
    },
    inspectPlayerControlledCharacter(address) {
      return readPlayerControlledCharacter(address);
    },
    isAvailable(options) {
      return !!getPlayer(options);
    },
    promoteAgentAddress(address) {
      return promoteAgentAddress(address);
    },
    promoteGameContextAddress(address, options) {
      return promoteGameContextAddress(address, options);
    },
    promoteGameContextFromCurrentCharContext(options = {}) {
      return promoteGameContextFromCurrentCharContext(options);
    },
    promotePlayerAddress(address) {
      return promotePlayerAddress(address);
    },
    readDirectPlayerArray() {
      return getDirectPlayerArray();
    },
  });
}
