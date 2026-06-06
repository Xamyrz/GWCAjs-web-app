export function createMapModule(runtime) {
  const GAME_CONTEXT_OFFSETS = Object.freeze({
    character: 0x44,
    map: 0x14,
    world: 0x2c,
  });
  const WORLD_CONTEXT_OFFSETS = Object.freeze({
    playerControlledChar: 0x680,
    playerNumber: 0x67c,
    players: 0x80c,
  });
  const PLAYER_OFFSETS = Object.freeze({
    agentId: 0x00,
    playerNumber: 0x38,
  });
  const PLAYER_CONTROLLED_CHARACTER_OFFSETS = Object.freeze({
    agentId: 0x14,
    compositeId: 0x18,
  });
  const BASE_CONTEXT_GAME_SLOT_OFFSET = 0x18;
  const PROP_CONTEXT_OFFSETS = Object.freeze({
    activeSlotAddress: 0x28b200,
    eventContext: 0x03 * 4,
    mapContext: 0x05 * 4,
    worldContext: 0x0b * 4,
    readOnlyTableAddress: 0x28b204,
  });
  const EVENT_CONTEXT_OFFSETS = Object.freeze({
    propContext: 0x18,
  });
  const STATIC_DATA_SCAN_RANGE = Object.freeze({
    end: 0x300000,
    start: 0x100000,
  });

  function getMemoryLimit() {
    return runtime.hook?.memory?.buffer?.byteLength || 0;
  }

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

  function safeReadU32(address) {
    return safeRead(runtime.hook?.readU32, address);
  }

  function safeReadU16(address) {
    return safeRead(runtime.hook?.readU16, address);
  }

  function safeReadI32(address) {
    return safeRead(runtime.hook?.readI32, address);
  }

  function safeReadF32(address) {
    return safeRead(runtime.hook?.readF32, address);
  }

  function getSchema() {
    const schema = runtime.resolver.getDefinition("modules.map.schema");
    return schema && typeof schema === "object" ? schema : null;
  }

  function hasDefinition(path) {
    return typeof runtime.resolver.getDefinition(path) !== "undefined";
  }

  function getActiveBuildId() {
    return typeof runtime.version?.getBuildId === "function"
      ? runtime.version.getBuildId()
      : null;
  }

  function getAddress(path) {
    return runtime.resolver.tryResolveAddress(path);
  }

  function getStateAddress() {
    return getAddress("modules.map.stateAddress");
  }

  function getGameplayContextSlotAddress() {
    return getAddress("modules.gameplay.contextSlotAddress");
  }

  function getGameplayContextAddress() {
    return getAddress("modules.gameplay.contextAddress");
  }

  function getMapContextAddress() {
    return getAddress("modules.gameplay.mapContextAddress");
  }

  function getCharContextAddress() {
    return getAddress("modules.gameplay.charContextAddress");
  }

  function getStateView() {
    const address = getStateAddress();
    const schema = getSchema();
    if (!address || !schema) {
      return null;
    }
    return runtime.hook.createStructView(address, schema);
  }

  function readField(fieldName) {
    const view = getStateView();
    if (!view || !(fieldName in view)) {
      return null;
    }
    return view[fieldName];
  }

  function readAddressValue(address) {
    return safeReadU32(address);
  }

  function isLikelyPointerValue(value, limit, minPointerAddress = 0x10000) {
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= minPointerAddress &&
      value < limit
    );
  }

  function dumpPointers(
    address,
    byteLength = 0x80,
    step = 4,
    options = {}
  ) {
    if (!address || typeof runtime.hook.readU32 !== "function") {
      return [];
    }

    const limit = getMemoryLimit();
    const size = Math.max(0, byteLength | 0);
    const stride = step > 0 ? step | 0 : 4;
    const minPointerAddress =
      typeof options.minPointerAddress === "number"
        ? options.minPointerAddress
        : 0x10000;
    const rows = [];

    for (let offset = 0; offset < size; offset += stride) {
      const slotAddress = address + offset;
      const value = safeReadU32(slotAddress);
      rows.push({
        isLikelyPointer: isLikelyPointerValue(
          value,
          limit,
          minPointerAddress
        ),
        offset,
        slotAddress,
        value,
      });
    }

    return rows;
  }

  function listLikelyPointers(address, byteLength = 0x80, options = {}) {
    return dumpPointers(address, byteLength, 4, options).filter(
      (entry) => entry.isLikelyPointer
    );
  }

  function readStateAtAddress(address) {
    const schema = getSchema();
    if (!address || !schema) {
      return null;
    }

    const state = {};
    for (const [fieldName, definition] of Object.entries(schema)) {
      const fieldAddress = address + definition.offset;
      let value = null;
      switch (definition.type) {
        case "i32":
          value = safeReadI32(fieldAddress);
          break;
        case "u32":
        default:
          value = safeReadU32(fieldAddress);
          break;
      }
      state[fieldName] = value;
    }
    return state;
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

  function readU32Range(address, count) {
    const values = [];
    const limit = Math.max(0, count | 0);
    for (let index = 0; index < limit; index += 1) {
      values.push(safeReadU32(address + index * 4));
    }
    return values;
  }

  function inspectNativeCharContext(address) {
    if (!address) {
      return null;
    }

    const nativeState = {
      currentMapId: safeReadU32(address + 0x234),
      currentMapType: safeReadU32(address + 0x23c),
      districtId: safeReadI32(address + 0x228),
      isExplorable: safeReadU32(address + 0x19c),
      language: safeReadU32(address + 0x22c),
      mapId: safeReadU32(address + 0x198),
      observeMapId: safeReadU32(address + 0x230),
      observeMapType: safeReadU32(address + 0x238),
      playerNumber: safeReadU32(address + 0x2ac),
      token1: safeReadU32(address + 0x194),
      token2: safeReadU32(address + 0x1b8),
      worldFlags: safeReadU32(address + 0x190),
    };

    const playerName = readUtf16(address + 0x74, 20);
    const playerEmail = readUtf16(address + 0x3c0, 64);
    const playerUuidWords = readU32Range(address + 0x64, 4);

    return {
      address,
      nativeState,
      playerEmail,
      playerName,
      playerUuidWords,
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
    const limit = getMemoryLimit();
    const maxCapacity =
      typeof options.maxCapacity === "number" && options.maxCapacity > 0
        ? options.maxCapacity | 0
        : 512;
    const maxSize =
      typeof options.maxSize === "number" && options.maxSize > 0
        ? options.maxSize | 0
        : maxCapacity;

    if (
      !header ||
      !isLikelyPointerValue(header.buffer, limit) ||
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

    const bufferEnd = header.buffer + header.capacity * elementSize;
    return bufferEnd > header.buffer && bufferEnd <= limit;
  }

  function inspectMapAgent(address) {
    const normalizedAddress =
      typeof address === "number" && Number.isFinite(address) ? address >>> 0 : 0;
    if (!normalizedAddress) {
      return null;
    }

    return {
      address: normalizedAddress,
      curEnergy: safeReadF32(normalizedAddress + 0x00),
      maxEnergy: safeReadF32(normalizedAddress + 0x04),
      energyRegen: safeReadF32(normalizedAddress + 0x08),
      skillTimestamp: safeReadU32(normalizedAddress + 0x0c),
      curHealth: safeReadF32(normalizedAddress + 0x20),
      maxHealth: safeReadF32(normalizedAddress + 0x24),
      healthRegen: safeReadF32(normalizedAddress + 0x28),
      marker: safeReadU32(normalizedAddress + 0x2c),
      effects: safeReadU32(normalizedAddress + 0x30),
    };
  }

  function isPlausibleMapAgent(entry) {
    if (!entry) {
      return false;
    }

    const floatOk = (value, min, max) =>
      typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

    return (
      floatOk(entry.curEnergy, -1, 100) &&
      floatOk(entry.maxEnergy, 0, 100) &&
      floatOk(entry.energyRegen, -20, 20) &&
      floatOk(entry.curHealth, -0.1, 2) &&
      floatOk(entry.maxHealth, 0, 2) &&
      floatOk(entry.healthRegen, -20, 20)
    );
  }

  function inspectMapAgentArrayHeader(address, options = {}) {
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
    const stride =
      typeof options.stride === "number" && options.stride > 0
        ? options.stride | 0
        : 0x34;
    const reasonable = isReasonableArrayHeader(header, stride, options);
    const entries = [];
    const plausibleEntries = [];
    let score = 0;
    const reasons = [];

    if (reasonable) {
      score += 2;
      for (let index = 0; index < Math.min(header.size, sampleCount); index += 1) {
        const entry = inspectMapAgent(header.buffer + index * stride);
        entries.push(entry);
        if (isPlausibleMapAgent(entry)) {
          plausibleEntries.push({
            address: entry.address,
            index,
            curEnergy: entry.curEnergy,
            curHealth: entry.curHealth,
            effects: entry.effects,
          });
          score += 3;
        }
      }
      if (plausibleEntries.length > 0) {
        reasons.push("arrayHeader");
      }
      if (plausibleEntries.length >= 2) {
        reasons.push("multiplePlausibleEntries");
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

  function isValidLanguage(value) {
    return [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 17, 0xff].includes(value);
  }

  function isValidMapType(value) {
    return Number.isInteger(value) && value >= 0 && value <= 2;
  }

  function isReasonableMapId(value) {
    return Number.isInteger(value) && value > 0 && value < 5000;
  }

  function isReasonableDistrict(value) {
    return Number.isInteger(value) && value >= -2 && value < 1000;
  }

  function isReasonablePlayerNumber(value) {
    return Number.isInteger(value) && value >= 0 && value < 1000000;
  }

  function isReasonableNativePlayerNumber(value) {
    return Number.isInteger(value) && value > 0 && value < 0x10000;
  }

  function isReasonableAgentId(value) {
    return Number.isInteger(value) && value > 0 && value < 0x10000000;
  }

  function inspectPlayerAtAddress(address) {
    const normalizedAddress =
      typeof address === "number" && Number.isFinite(address) ? address >>> 0 : 0;
    if (!normalizedAddress) {
      return null;
    }
    return {
      address: normalizedAddress,
      agentId: safeReadU32(normalizedAddress + PLAYER_OFFSETS.agentId),
      playerNumber: safeReadU32(normalizedAddress + PLAYER_OFFSETS.playerNumber),
    };
  }

  function describeWorldContextForRoot(worldContextAddress, expectedPlayerNumber) {
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
    const controlledCharAddress = normalizedAddress
      ? safeReadU32(
          normalizedAddress + WORLD_CONTEXT_OFFSETS.playerControlledChar
        )
      : null;
    const controlledAgentId = isLikelyPointerValue(
      controlledCharAddress,
      getMemoryLimit()
    )
      ? safeReadU32(
          controlledCharAddress + PLAYER_CONTROLLED_CHARACTER_OFFSETS.agentId
        )
      : null;
    const controlledCompositeId = isLikelyPointerValue(
      controlledCharAddress,
      getMemoryLimit()
    )
      ? safeReadU32(
          controlledCharAddress +
            PLAYER_CONTROLLED_CHARACTER_OFFSETS.compositeId
        )
      : null;
    const expectedCompositeId = isReasonableNativePlayerNumber(expectedPlayerNumber)
      ? (0x30000000 | (expectedPlayerNumber & 0xffff)) >>> 0
      : 0;
    const slotCount = playerArrayHeader
      ? Math.max(playerArrayHeader.size || 0, playerArrayHeader.capacity || 0)
      : 0;
    const playerAddress =
      playerArrayHeader &&
      isReasonableNativePlayerNumber(expectedPlayerNumber) &&
      expectedPlayerNumber < slotCount
        ? (playerArrayHeader.buffer + expectedPlayerNumber * 0x50) >>> 0
        : 0;
    const player = playerAddress ? inspectPlayerAtAddress(playerAddress) : null;

    let rejection = null;
    const reasons = [];
    let score = 0;

    if (!isLikelyPointerValue(normalizedAddress, getMemoryLimit())) {
      rejection = "world-not-pointer";
    } else if (!isReasonableNativePlayerNumber(playerNumber)) {
      rejection = "world-player-number-invalid";
    } else if (
      isReasonableNativePlayerNumber(expectedPlayerNumber) &&
      playerNumber !== expectedPlayerNumber
    ) {
      rejection = "world-player-number-mismatch";
    } else if (!isReasonableArrayHeader(playerArrayHeader, 0x50, {
      maxCapacity: 512,
      maxSize: 512,
    })) {
      rejection = "player-array-invalid";
    } else if (
      isReasonableNativePlayerNumber(expectedPlayerNumber) &&
      expectedPlayerNumber >= playerArrayHeader.size
    ) {
      rejection = "player-slot-out-of-size";
    } else if (!player || !isReasonableAgentId(player.agentId)) {
      rejection = "player-agent-invalid";
    }

    if (!rejection) {
      score += 8;
      reasons.push("worldPlayerNumber");
      score += 8;
      reasons.push("playerArray");
      score += 8;
      reasons.push("playerAgentId");
      if (player.playerNumber === expectedPlayerNumber) {
        score += 4;
        reasons.push("playerStructNumber");
      }
      if (controlledCompositeId === expectedCompositeId && expectedCompositeId) {
        score += 5;
        reasons.push("controlledCompositeId");
      }
      if (
        isReasonableAgentId(controlledAgentId) &&
        controlledAgentId === player.agentId
      ) {
        score += 8;
        reasons.push("controlledAgentId");
      }
    }

    const bufferEnd =
      playerArrayHeader && playerArrayHeader.buffer && slotCount > 0
        ? playerArrayHeader.buffer + slotCount * 0x50
        : 0;

    return {
      controlledAgentId,
      controlledCharAddress,
      controlledCompositeId,
      player,
      playerAddress,
      playerArrayAddress,
      playerArrayHeader: playerArrayHeader
        ? {
            ...playerArrayHeader,
            bufferEnd,
            bufferReasonable: isLikelyPointerValue(
              playerArrayHeader.buffer,
              getMemoryLimit()
            ),
            slotCount,
          }
        : null,
      playerNumber,
      reasons,
      rejection,
      score,
      worldContextAddress: normalizedAddress,
    };
  }

  function describeGameContextForRoot(gameContextAddress) {
    const normalizedAddress =
      typeof gameContextAddress === "number" && Number.isFinite(gameContextAddress)
        ? gameContextAddress >>> 0
        : 0;
    const charContextAddress = normalizedAddress
      ? safeReadU32(normalizedAddress + GAME_CONTEXT_OFFSETS.character)
      : null;
    const worldContextAddress = normalizedAddress
      ? safeReadU32(normalizedAddress + GAME_CONTEXT_OFFSETS.world)
      : null;
    const mapContextAddress = normalizedAddress
      ? safeReadU32(normalizedAddress + GAME_CONTEXT_OFFSETS.map)
      : null;
    const charContext = isLikelyPointerValue(charContextAddress, getMemoryLimit())
      ? inspectNativeCharContext(charContextAddress)
      : null;
    const charScore = scoreNativeCharContextInspection(charContext, {
      includeStringFields: false,
    });
    const charPlayerNumber = charContext?.nativeState?.playerNumber ?? null;
    const world = describeWorldContextForRoot(
      worldContextAddress,
      charPlayerNumber
    );

    let rejection = null;
    const reasons = [];
    let score = 0;

    if (!isLikelyPointerValue(normalizedAddress, getMemoryLimit())) {
      rejection = "game-not-pointer";
    } else if (!isLikelyPointerValue(charContextAddress, getMemoryLimit())) {
      rejection = "char-not-pointer";
    } else if (charScore.score < 10) {
      rejection = "char-context-invalid";
    } else if (!isReasonableNativePlayerNumber(charPlayerNumber)) {
      rejection = "char-player-number-invalid";
    } else if (world.rejection) {
      rejection = world.rejection;
    }

    if (!rejection) {
      score += 10;
      reasons.push("gameContext");
      score += charScore.score;
      reasons.push(...charScore.reasons.map((reason) => "char:" + reason));
      score += world.score;
      reasons.push(...world.reasons.map((reason) => "world:" + reason));
    }

    return {
      charContext,
      charContextAddress,
      charPlayerNumber,
      gameContextAddress: normalizedAddress,
      mapContextAddress,
      reasons,
      rejection,
      score,
      world,
      worldContextAddress,
    };
  }

  function describeBaseContextTable(tableAddress, game) {
    const normalizedTable =
      typeof tableAddress === "number" && Number.isFinite(tableAddress)
        ? tableAddress >>> 0
        : 0;
    const slots = [];
    let likelyPointerCount = 0;
    let score = 0;
    const reasons = [];
    const limit = getMemoryLimit();

    for (let index = 0; index < 16; index += 1) {
      const slotAddress = normalizedTable + index * 4;
      const value = safeReadU32(slotAddress);
      const isLikelyPointer = isLikelyPointerValue(value, limit);
      if (isLikelyPointer) {
        likelyPointerCount += 1;
      }
      const labels = [];
      if (value === game?.gameContextAddress) {
        labels.push("gameContext");
      }
      if (value === game?.charContextAddress) {
        labels.push("charContext");
      }
      if (value === game?.worldContextAddress) {
        labels.push("worldContext");
      }
      if (value === game?.mapContextAddress) {
        labels.push("mapContext");
      }
      slots.push({
        index,
        isLikelyPointer,
        labels,
        offset: index * 4,
        slotAddress,
        value,
      });
    }

    const gameSlotMatches =
      slots[6]?.value === game?.gameContextAddress && !!game?.gameContextAddress;
    const tableDistanceFromGame =
      normalizedTable && game?.gameContextAddress
        ? normalizedTable - game.gameContextAddress
        : null;
    const insideGameNeighborhood =
      typeof tableDistanceFromGame === "number" &&
      tableDistanceFromGame >= 0 &&
      tableDistanceFromGame < 0x400;
    const directContextMatches = slots.reduce(
      (count, slot) => count + slot.labels.length,
      0
    );

    if (gameSlotMatches) {
      score += 20;
      reasons.push("slot6GameContext");
    }
    if (likelyPointerCount >= 4) {
      score += 4;
      reasons.push("pointerDense");
    }
    if (directContextMatches > 1) {
      score += directContextMatches;
      reasons.push("directContextMatches");
    }
    if (insideGameNeighborhood) {
      score -= 8;
      reasons.push("nearGameContext");
    }

    return {
      directContextMatches,
      gameSlotMatches,
      insideGameNeighborhood,
      likelyPointerCount,
      reasons,
      score,
      slots,
      tableAddress: normalizedTable,
      tableDistanceFromGame,
    };
  }

  function createBaseContextRanges(options = {}) {
    if (Array.isArray(options.ranges) && options.ranges.length > 0) {
      return options.ranges
        .map((range) => ({
          end:
            typeof range?.end === "number" && Number.isFinite(range.end)
              ? range.end >>> 0
              : 0,
          start:
            typeof range?.start === "number" && Number.isFinite(range.start)
              ? range.start >>> 0
              : 0,
        }))
        .filter((range) => range.end > range.start);
    }

    const memoryLimit = getMemoryLimit();
    const explicitStart =
      typeof options.start === "number" && Number.isFinite(options.start)
        ? options.start >>> 0
        : null;
    const explicitEnd =
      typeof options.end === "number" && Number.isFinite(options.end)
        ? options.end >>> 0
        : null;
    if (explicitStart !== null || explicitEnd !== null) {
      return [{
        start: explicitStart ?? 0,
        end: explicitEnd ?? memoryLimit,
      }].filter((range) => range.end > range.start);
    }

    const anchor =
      typeof options.anchorAddress === "number" &&
      Number.isFinite(options.anchorAddress)
        ? options.anchorAddress >>> 0
        : getGameplayContextAddress();
    const radius =
      typeof options.anchorRadius === "number" && options.anchorRadius > 0
        ? options.anchorRadius >>> 0
        : 0x400000;
    if (isLikelyPointerValue(anchor, memoryLimit)) {
      return [{
        start: Math.max(0x10000, anchor - radius),
        end: Math.min(memoryLimit, anchor + radius),
      }];
    }

    return [{
      start: 0x10000,
      end: Math.min(memoryLimit, 0x2000000),
    }];
  }

  function createGameContextRootRanges(options = {}) {
    if (Array.isArray(options.ranges) && options.ranges.length > 0) {
      return options.ranges
        .map((range) => ({
          end:
            typeof range?.end === "number" && Number.isFinite(range.end)
              ? range.end >>> 0
              : 0,
          start:
            typeof range?.start === "number" && Number.isFinite(range.start)
              ? range.start >>> 0
              : 0,
        }))
        .filter((range) => range.end > range.start);
    }

    const memoryLimit = getMemoryLimit();
    const explicitStart =
      typeof options.start === "number" && Number.isFinite(options.start)
        ? options.start >>> 0
        : null;
    const explicitEnd =
      typeof options.end === "number" && Number.isFinite(options.end)
        ? options.end >>> 0
        : null;
    if (explicitStart !== null || explicitEnd !== null) {
      return [{
        start: explicitStart ?? 0x10000,
        end: explicitEnd ?? memoryLimit,
      }].filter((range) => range.end > range.start);
    }

    const anchor =
      typeof options.anchorAddress === "number" &&
      Number.isFinite(options.anchorAddress)
        ? options.anchorAddress >>> 0
        : getGameplayContextAddress();
    const radius =
      typeof options.anchorRadius === "number" && options.anchorRadius > 0
        ? options.anchorRadius >>> 0
        : 0x800000;
    if (isLikelyPointerValue(anchor, memoryLimit)) {
      return [{
        start: Math.max(0x10000, anchor - radius),
        end: Math.min(memoryLimit, anchor + radius),
      }];
    }

    return [{
      start: 0x10000,
      end: Math.min(memoryLimit, 0x2000000),
    }];
  }

  function findGameContextRootCandidates(options = {}) {
    const ranges = createGameContextRootRanges(options);
    const results = [];
    const rejected = [];
    const seen = new Set();
    const limit =
      typeof options.limit === "number" && options.limit > 0
        ? options.limit | 0
        : 16;
    const maxRejected =
      typeof options.maxRejected === "number" && options.maxRejected >= 0
        ? options.maxRejected | 0
        : 64;
    const maxScanSlots =
      typeof options.maxScanSlots === "number" && options.maxScanSlots > 0
        ? options.maxScanSlots | 0
        : 4000000;
    let scannedSlots = 0;

    for (const range of ranges) {
      for (
        let gameContextAddress = range.start;
        gameContextAddress + GAME_CONTEXT_OFFSETS.character + 4 <= range.end;
        gameContextAddress += 4
      ) {
        scannedSlots += 1;
        if (scannedSlots > maxScanSlots || results.length >= limit) {
          break;
        }

        const charContextAddress = safeReadU32(
          gameContextAddress + GAME_CONTEXT_OFFSETS.character
        );
        const worldContextAddress = safeReadU32(
          gameContextAddress + GAME_CONTEXT_OFFSETS.world
        );
        if (
          !isLikelyPointerValue(charContextAddress, getMemoryLimit()) ||
          !isLikelyPointerValue(worldContextAddress, getMemoryLimit())
        ) {
          continue;
        }

        const game = describeGameContextForRoot(gameContextAddress);
        if (game.rejection) {
          if (rejected.length < maxRejected) {
            rejected.push({
              charContextAddress,
              gameContextAddress,
              rejection: game.rejection,
              worldContextAddress,
            });
          }
          continue;
        }

        if (seen.has(game.gameContextAddress)) {
          continue;
        }
        seen.add(game.gameContextAddress);
        results.push({
          ...game,
          source: "directGameContextScan",
        });
      }

      if (scannedSlots > maxScanSlots || results.length >= limit) {
        break;
      }
    }

    results.sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.gameContextAddress - right.gameContextAddress;
    });

    return {
      candidates: results.slice(0, limit),
      ranges,
      rejected,
      scannedSlots,
    };
  }

  function createRootReferenceRanges(options = {}) {
    if (Array.isArray(options.ranges) && options.ranges.length > 0) {
      return options.ranges
        .map((range) => ({
          end:
            typeof range?.end === "number" && Number.isFinite(range.end)
              ? range.end >>> 0
              : 0,
          name: typeof range?.name === "string" ? range.name : null,
          start:
            typeof range?.start === "number" && Number.isFinite(range.start)
              ? range.start >>> 0
              : 0,
        }))
        .filter((range) => range.end > range.start);
    }

    return [
      { name: "staticData", start: 0x100000, end: Math.min(getMemoryLimit(), 0x300000) },
      { name: "lowDynamic", start: 0x300000, end: Math.min(getMemoryLimit(), 0x1000000) },
    ].filter((range) => range.end > range.start);
  }

  function classifyRootReferenceSlot(slotAddress, root, options = {}) {
    const internalWindow =
      typeof options.internalWindow === "number" && options.internalWindow > 0
        ? options.internalWindow >>> 0
        : 0x1000;
    const owners = [
      ["gameContext", root.gameContextAddress],
      ["charContext", root.charContextAddress],
      ["worldContext", root.worldContextAddress],
      ["mapContext", root.mapContextAddress],
    ].filter(([, address]) => isLikelyPointerValue(address, getMemoryLimit()));

    let owner = null;
    for (const [name, address] of owners) {
      const offset = slotAddress - address;
      if (offset >= 0 && offset < internalWindow) {
        owner = {
          internal: true,
          name,
          offset,
        };
        break;
      }
    }

    if (!owner) {
      let nearest = null;
      for (const [name, address] of owners) {
        const delta = slotAddress - address;
        const distance = Math.abs(delta);
        if (!nearest || distance < nearest.distance) {
          nearest = { distance, name, offset: delta };
        }
      }
      owner = {
        internal: false,
        name: nearest?.name || null,
        offset: nearest?.offset ?? null,
      };
    }

    return owner;
  }

  function findGameContextRootReferences(rootCandidate, options = {}) {
    const root =
      rootCandidate && typeof rootCandidate === "object"
        ? rootCandidate
        : describeGameContextForRoot(rootCandidate);
    if (!root || root.rejection) {
      return {
        error: "root-candidate-invalid",
        ranges: [],
        references: [],
        root,
      };
    }

    const targets = [
      ["gameContext", root.gameContextAddress],
      ["charContext", root.charContextAddress],
      ["worldContext", root.worldContextAddress],
      ["mapContext", root.mapContextAddress],
    ].filter(([, address]) => isLikelyPointerValue(address, getMemoryLimit()));
    const ranges = createRootReferenceRanges(options);
    const limitPerTarget =
      typeof options.limitPerTarget === "number" && options.limitPerTarget > 0
        ? options.limitPerTarget | 0
        : 32;
    const references = [];
    const seen = new Set();
    const externalOnly = options.externalOnly === true;

    for (const range of ranges) {
      for (const [targetName, targetAddress] of targets) {
        const slots = findReferencesToAddress(targetAddress, {
          end: range.end,
          limit: limitPerTarget,
          start: range.start,
        });
        for (const slotAddress of slots) {
          const key = range.start + ":" + targetName + ":" + slotAddress;
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          const owner = classifyRootReferenceSlot(slotAddress, root, options);
          if (externalOnly && owner.internal) {
            continue;
          }
          references.push({
            external: !owner.internal,
            owner,
            range: range.name || null,
            rangeEnd: range.end,
            rangeStart: range.start,
            slotAddress,
            slotValue: safeReadU32(slotAddress),
            targetAddress,
            targetName,
          });
        }
      }
    }

    return {
      ranges,
      references,
      root,
      targets: Object.fromEntries(targets),
    };
  }

  function describePropContextRoot(propContextAddress, options = {}) {
    const normalizedAddress =
      typeof propContextAddress === "number" && Number.isFinite(propContextAddress)
        ? propContextAddress >>> 0
        : 0;
    const limit = getMemoryLimit();
    const eventContextAddress = normalizedAddress
      ? safeReadU32(normalizedAddress + PROP_CONTEXT_OFFSETS.eventContext)
      : null;
    const worldContextAddress = normalizedAddress
      ? safeReadU32(normalizedAddress + PROP_CONTEXT_OFFSETS.worldContext)
      : null;
    const mapContextAddress = normalizedAddress
      ? safeReadU32(normalizedAddress + PROP_CONTEXT_OFFSETS.mapContext)
      : null;
    const eventBackReference = isLikelyPointerValue(eventContextAddress, limit)
      ? safeReadU32(eventContextAddress + EVENT_CONTEXT_OFFSETS.propContext)
      : null;
    const expectedPlayerNumber = isLikelyPointerValue(worldContextAddress, limit)
      ? safeReadU32(worldContextAddress + WORLD_CONTEXT_OFFSETS.playerNumber)
      : null;
    const world = describeWorldContextForRoot(
      worldContextAddress,
      expectedPlayerNumber
    );

    const gameCandidates = [];
    if (
      options.findGameContext === true &&
      isLikelyPointerValue(worldContextAddress, limit)
    ) {
      const references = findReferencesToAddress(worldContextAddress, {
        end:
          typeof options.referenceEnd === "number"
            ? options.referenceEnd
            : Math.min(limit, 0x2000000),
        limit:
          typeof options.referenceLimit === "number" && options.referenceLimit > 0
            ? options.referenceLimit | 0
            : 256,
        start:
          typeof options.referenceStart === "number"
            ? options.referenceStart
            : 0x10000,
      });
      for (const slotAddress of references) {
        const gameContextAddress =
          slotAddress >= GAME_CONTEXT_OFFSETS.world
            ? (slotAddress - GAME_CONTEXT_OFFSETS.world) >>> 0
            : 0;
        const game = describeGameContextForRoot(gameContextAddress);
        if (!game.rejection) {
          gameCandidates.push({
            gameContextAddress,
            referenceSlotAddress: slotAddress,
            ...game,
          });
          if (
            typeof options.gameContextLimit === "number" &&
            options.gameContextLimit > 0 &&
            gameCandidates.length >= (options.gameContextLimit | 0)
          ) {
            break;
          }
        }
      }
    }

    let rejection = null;
    const reasons = [];
    let score = 0;

    if (!isLikelyPointerValue(normalizedAddress, limit)) {
      rejection = "prop-context-not-pointer";
    } else if (!isLikelyPointerValue(eventContextAddress, limit)) {
      rejection = "event-context-not-pointer";
    } else if (eventBackReference !== normalizedAddress) {
      rejection = "event-context-backref-mismatch";
    } else if (world.rejection) {
      rejection = "world-context-invalid:" + world.rejection;
    }

    if (!rejection) {
      score += 16;
      reasons.push("eventContextBackReference");
      score += world.score;
      reasons.push(...world.reasons.map((reason) => "world:" + reason));
      if (isLikelyPointerValue(mapContextAddress, limit)) {
        score += 3;
        reasons.push("mapContextPointer");
      }
      if (gameCandidates.length > 0) {
        score += 12;
        reasons.push("gameContextOwner");
      }
    }

    return {
      eventBackReference,
      eventContextAddress,
      gameCandidates,
      mapContextAddress,
      propContextAddress: normalizedAddress,
      reasons,
      rejection,
      score,
      world,
      worldContextAddress,
    };
  }

  function createPropContextRootRanges(options = {}) {
    if (Array.isArray(options.ranges) && options.ranges.length > 0) {
      return options.ranges
        .map((range) => ({
          end:
            typeof range?.end === "number" && Number.isFinite(range.end)
              ? range.end >>> 0
              : 0,
          start:
            typeof range?.start === "number" && Number.isFinite(range.start)
              ? range.start >>> 0
              : 0,
        }))
        .filter((range) => range.end > range.start);
    }

    const memoryLimit = getMemoryLimit();
    const explicitStart =
      typeof options.start === "number" && Number.isFinite(options.start)
        ? options.start >>> 0
        : null;
    const explicitEnd =
      typeof options.end === "number" && Number.isFinite(options.end)
        ? options.end >>> 0
        : null;
    if (explicitStart !== null || explicitEnd !== null) {
      return [{
        start: explicitStart ?? 0x10000,
        end: explicitEnd ?? memoryLimit,
      }].filter((range) => range.end > range.start);
    }

    const anchor =
      typeof options.anchorAddress === "number" &&
      Number.isFinite(options.anchorAddress)
        ? options.anchorAddress >>> 0
        : getGameplayContextAddress();
    const radius =
      typeof options.anchorRadius === "number" && options.anchorRadius > 0
        ? options.anchorRadius >>> 0
        : 0x800000;
    if (isLikelyPointerValue(anchor, memoryLimit)) {
      return [{
        start: Math.max(0x10000, anchor - radius),
        end: Math.min(memoryLimit, anchor + radius),
      }];
    }

    return [{
      start: 0x10000,
      end: Math.min(memoryLimit, 0x2000000),
    }];
  }

  function addPropContextRootCandidate(results, rejected, seen, address, source, options) {
    const normalizedAddress =
      typeof address === "number" && Number.isFinite(address) ? address >>> 0 : 0;
    if (!normalizedAddress || seen.has(normalizedAddress)) {
      return null;
    }
    seen.add(normalizedAddress);

    const candidate = describePropContextRoot(normalizedAddress, options);
    if (candidate.rejection) {
      if (rejected.length < ((options.maxRejected ?? 64) | 0)) {
        rejected.push({
          propContextAddress: normalizedAddress,
          rejection: candidate.rejection,
          source,
        });
      }
      return null;
    }

    const entry = {
      ...candidate,
      source,
    };
    results.push(entry);
    return entry;
  }

  function findPropContextRootCandidates(options = {}) {
    const ranges = createPropContextRootRanges(options);
    const results = [];
    const rejected = [];
    const seen = new Set();
    const limit =
      typeof options.limit === "number" && options.limit > 0
        ? options.limit | 0
        : 16;
    const maxScanSlots =
      typeof options.maxScanSlots === "number" && options.maxScanSlots > 0
        ? options.maxScanSlots | 0
        : 4000000;
    const activePropContext = safeReadU32(PROP_CONTEXT_OFFSETS.activeSlotAddress);

    addPropContextRootCandidate(
      results,
      rejected,
      seen,
      activePropContext,
      "activePropContextSlot",
      options
    );
    addPropContextRootCandidate(
      results,
      rejected,
      seen,
      PROP_CONTEXT_OFFSETS.readOnlyTableAddress,
      "readOnlyPropContextTable",
      options
    );

    if (
      typeof options.worldContextAddress === "number" &&
      Number.isFinite(options.worldContextAddress)
    ) {
      const worldContextAddress = options.worldContextAddress >>> 0;
      const references = findReferencesToAddress(worldContextAddress, {
        end:
          typeof options.referenceEnd === "number"
            ? options.referenceEnd
            : Math.min(getMemoryLimit(), 0x2000000),
        limit:
          typeof options.referenceLimit === "number" && options.referenceLimit > 0
            ? options.referenceLimit | 0
            : 1024,
        start:
          typeof options.referenceStart === "number"
            ? options.referenceStart
            : 0x10000,
      });
      for (const slotAddress of references) {
        addPropContextRootCandidate(
          results,
          rejected,
          seen,
          slotAddress - PROP_CONTEXT_OFFSETS.worldContext,
          "worldContextReference",
          options
        );
        if (results.length >= limit) {
          break;
        }
      }
    }

    let scannedSlots = 0;
    for (const range of ranges) {
      for (
        let propContextAddress = range.start;
        propContextAddress + PROP_CONTEXT_OFFSETS.worldContext + 4 <= range.end;
        propContextAddress += 4
      ) {
        scannedSlots += 1;
        if (scannedSlots > maxScanSlots || results.length >= limit) {
          break;
        }

        const eventContextAddress = safeReadU32(
          propContextAddress + PROP_CONTEXT_OFFSETS.eventContext
        );
        const worldContextAddress = safeReadU32(
          propContextAddress + PROP_CONTEXT_OFFSETS.worldContext
        );
        if (
          !isLikelyPointerValue(eventContextAddress, getMemoryLimit()) ||
          !isLikelyPointerValue(worldContextAddress, getMemoryLimit())
        ) {
          continue;
        }
        if (
          safeReadU32(eventContextAddress + EVENT_CONTEXT_OFFSETS.propContext) !==
          propContextAddress
        ) {
          continue;
        }

        addPropContextRootCandidate(
          results,
          rejected,
          seen,
          propContextAddress,
          "directPropContextScan",
          options
        );
      }

      if (scannedSlots > maxScanSlots || results.length >= limit) {
        break;
      }
    }

    results.sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.propContextAddress - right.propContextAddress;
    });

    return {
      activePropContext,
      candidates: results.slice(0, limit),
      propContextLayout: {
        activeSlotAddress: PROP_CONTEXT_OFFSETS.activeSlotAddress,
        eventContextOffset: PROP_CONTEXT_OFFSETS.eventContext,
        eventPropContextOffset: EVENT_CONTEXT_OFFSETS.propContext,
        readOnlyTableAddress: PROP_CONTEXT_OFFSETS.readOnlyTableAddress,
        worldContextOffset: PROP_CONTEXT_OFFSETS.worldContext,
      },
      ranges,
      rejected,
      scannedSlots,
    };
  }

  function addBaseContextCandidate(results, seen, tableAddress, slotAddress, source) {
    const normalizedTable =
      typeof tableAddress === "number" && Number.isFinite(tableAddress)
        ? tableAddress >>> 0
        : 0;
    if (!isLikelyPointerValue(normalizedTable, getMemoryLimit())) {
      return null;
    }

    const gameContextAddress = safeReadU32(
      normalizedTable + BASE_CONTEXT_GAME_SLOT_OFFSET
    );
    const game = describeGameContextForRoot(gameContextAddress);
    if (game.rejection) {
      return null;
    }
    const table = describeBaseContextTable(normalizedTable, game);

    const key = normalizedTable + ":" + game.gameContextAddress + ":" + (slotAddress || 0);
    if (seen.has(key)) {
      return null;
    }
    seen.add(key);

    const entry = {
      baseContextTableAddress: normalizedTable,
      basePtrSlotAddress: slotAddress || 0,
      gameContextAddress: game.gameContextAddress,
      source,
      table,
      ...game,
      gameScore: game.score,
      score: game.score + table.score + (slotAddress ? 8 : 0),
    };
    results.push(entry);
    return entry;
  }

  function sortBaseContextCandidates(candidates) {
    return candidates.sort((left, right) => {
      if ((right.basePtrSlotAddress || 0) !== (left.basePtrSlotAddress || 0)) {
        return (right.basePtrSlotAddress ? 1 : 0) - (left.basePtrSlotAddress ? 1 : 0);
      }
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (
        !!right.table?.insideGameNeighborhood !==
        !!left.table?.insideGameNeighborhood
      ) {
        return left.table?.insideGameNeighborhood ? 1 : -1;
      }
      return left.baseContextTableAddress - right.baseContextTableAddress;
    });
  }

  function getBasePtrSearchRange(options = {}) {
    const start =
      typeof options.basePtrStart === "number" &&
      Number.isFinite(options.basePtrStart)
        ? options.basePtrStart >>> 0
        : STATIC_DATA_SCAN_RANGE.start;
    const end =
      typeof options.basePtrEnd === "number" && Number.isFinite(options.basePtrEnd)
        ? options.basePtrEnd >>> 0
        : Math.min(getMemoryLimit(), STATIC_DATA_SCAN_RANGE.end);
    return { end, start };
  }

  function findBaseContextCandidates(options = {}) {
    const results = [];
    const rejected = [];
    const seen = new Set();
    const maxRejected =
      typeof options.maxRejected === "number" && options.maxRejected >= 0
        ? options.maxRejected | 0
        : 64;
    const limit =
      typeof options.limit === "number" && options.limit > 0
        ? options.limit | 0
        : 16;
    const referenceLimit =
      typeof options.referenceLimit === "number" && options.referenceLimit > 0
        ? options.referenceLimit | 0
        : 4096;
    const findBasePtrSlots = options.findBasePtrSlots === true;
    const basePtrReferenceLimit =
      typeof options.basePtrReferenceLimit === "number" &&
      options.basePtrReferenceLimit > 0
        ? options.basePtrReferenceLimit | 0
        : 64;
    const gameContextAddress =
      typeof options.gameContextAddress === "number" &&
      Number.isFinite(options.gameContextAddress)
        ? options.gameContextAddress >>> 0
        : 0;

    if (gameContextAddress) {
      const game = describeGameContextForRoot(gameContextAddress);
      const referenceSlots = findReferencesToAddress(gameContextAddress, {
        end: options.end,
        limit: referenceLimit,
        start: options.start,
      });
      for (const referenceSlot of referenceSlots) {
        const tableAddress =
          (referenceSlot - BASE_CONTEXT_GAME_SLOT_OFFSET) >>> 0;
        const entry = addBaseContextCandidate(
          results,
          seen,
          tableAddress,
          0,
          "gameContextReference"
        );
        let added = !!entry;
        if (entry && findBasePtrSlots) {
          const basePtrRange = getBasePtrSearchRange(options);
          const basePtrSlots = findReferencesToAddress(tableAddress, {
            end: basePtrRange.end,
            limit: basePtrReferenceLimit,
            start: basePtrRange.start,
          });
          for (const basePtrSlot of basePtrSlots) {
            const withBasePtr = addBaseContextCandidate(
              results,
              seen,
              tableAddress,
              basePtrSlot,
              "gameContextReferenceWithBasePtr"
            );
            added = added || !!withBasePtr;
          }
        }
        if (!added && rejected.length < maxRejected) {
          rejected.push({
            gameContextAddress,
            referenceSlot,
            source: "gameContextReference",
            tableAddress,
          });
        }
      }
      sortBaseContextCandidates(results);
      return {
        basePtrSearchRange: findBasePtrSlots
          ? getBasePtrSearchRange(options)
          : null,
        candidates: results.slice(0, limit),
        game,
        rejected,
        searchedByGameContext: true,
      };
    }

    const ranges = createBaseContextRanges(options);
    const maxScanSlots =
      typeof options.maxScanSlots === "number" && options.maxScanSlots > 0
        ? options.maxScanSlots | 0
        : 2000000;
    let scannedSlots = 0;

    for (const range of ranges) {
      for (
        let tableAddress = range.start;
        tableAddress + BASE_CONTEXT_GAME_SLOT_OFFSET + 4 <= range.end;
        tableAddress += 4
      ) {
        scannedSlots += 1;
        if (scannedSlots > maxScanSlots || results.length >= limit) {
          break;
        }

        const gameAddress = safeReadU32(
          tableAddress + BASE_CONTEXT_GAME_SLOT_OFFSET
        );
        if (!isLikelyPointerValue(gameAddress, getMemoryLimit())) {
          continue;
        }

        const game = describeGameContextForRoot(gameAddress);
        if (game.rejection) {
          if (rejected.length < maxRejected) {
            rejected.push({
              gameContextAddress: gameAddress,
              rejection: game.rejection,
              source: "tableScan",
              tableAddress,
            });
          }
          continue;
        }

        addBaseContextCandidate(
          results,
          seen,
          tableAddress,
          0,
          "tableScan"
        );
        if (findBasePtrSlots) {
          const basePtrRange = getBasePtrSearchRange(options);
          const basePtrSlots = findReferencesToAddress(tableAddress, {
            end: basePtrRange.end,
            limit: basePtrReferenceLimit,
            start: basePtrRange.start,
          });
          for (const basePtrSlot of basePtrSlots) {
            addBaseContextCandidate(
              results,
              seen,
              tableAddress,
              basePtrSlot,
              "tableScanWithBasePtr"
            );
          }
        }
      }

      if (scannedSlots > maxScanSlots || results.length >= limit) {
        break;
      }
    }

    results.sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.baseContextTableAddress - right.baseContextTableAddress;
    });
    sortBaseContextCandidates(results);

    return {
      basePtrSearchRange: findBasePtrSlots
        ? getBasePtrSearchRange(options)
        : null,
      candidates: results.slice(0, limit),
      ranges,
      rejected,
      scannedSlots,
      searchedByGameContext: false,
    };
  }

  function createBasePtrSlotSearchRanges(options = {}) {
    if (Array.isArray(options.ranges) && options.ranges.length > 0) {
      return options.ranges
        .map((range) => ({
          end:
            typeof range?.end === "number" && Number.isFinite(range.end)
              ? range.end >>> 0
              : 0,
          start:
            typeof range?.start === "number" && Number.isFinite(range.start)
              ? range.start >>> 0
              : 0,
        }))
        .filter((range) => range.end > range.start);
    }

    if (
      typeof options.start === "number" ||
      typeof options.end === "number"
    ) {
      return [getBasePtrSearchRange({
        basePtrEnd: options.end,
        basePtrStart: options.start,
      })].filter((range) => range.end > range.start);
    }

    return [getBasePtrSearchRange(options)].filter(
      (range) => range.end > range.start
    );
  }

  function findBasePtrSlotsForTable(tableAddress, options = {}) {
    const normalizedTable =
      typeof tableAddress === "number" && Number.isFinite(tableAddress)
        ? tableAddress >>> 0
        : 0;
    if (!isLikelyPointerValue(normalizedTable, getMemoryLimit())) {
      return {
        candidates: [],
        error: "table-not-pointer",
        ranges: [],
        slots: [],
        tableAddress: normalizedTable,
      };
    }

    const candidates = [];
    const ranges = createBasePtrSlotSearchRanges(options);
    const seen = new Set();
    const slotSeen = new Set();
    const slots = [];
    const limit =
      typeof options.limit === "number" && options.limit > 0
        ? options.limit | 0
        : 32;
    const tableCandidate = addBaseContextCandidate(
      [],
      new Set(),
      normalizedTable,
      0,
      "tableProbe"
    );

    for (const range of ranges) {
      if (slots.length >= limit) {
        break;
      }
      const hits = findReferencesToAddress(normalizedTable, {
        end: range.end,
        limit: Math.max(1, limit - slots.length),
        start: range.start,
      });
      for (const slotAddress of hits) {
        if (slotSeen.has(slotAddress)) {
          continue;
        }
        slotSeen.add(slotAddress);
        const candidate = addBaseContextCandidate(
          candidates,
          seen,
          normalizedTable,
          slotAddress,
          "basePtrSlotReference"
        );
        slots.push({
          candidateValid: !!candidate,
          slotAddress,
          slotValue: safeReadU32(slotAddress),
        });
      }
    }

    sortBaseContextCandidates(candidates);
    return {
      candidates,
      ranges,
      slots,
      table: tableCandidate?.table || null,
      tableAddress: normalizedTable,
    };
  }

  function scoreNativeCharContextInspection(inspection, options = {}) {
    if (!inspection || !inspection.nativeState) {
      return { score: 0, reasons: ["no-native-state"] };
    }

    const includeStringFields = options.includeStringFields !== false;
    const state = inspection.nativeState;
    let score = 0;
    const reasons = [];

    if (state.isExplorable === 0 || state.isExplorable === 1) {
      score += 2;
      reasons.push("isExplorable");
    }

    if (isValidLanguage(state.language)) {
      score += 3;
      reasons.push("language");
    }

    if (isReasonableMapId(state.currentMapId)) {
      score += 3;
      reasons.push("currentMapId");
    }

    if (isReasonableMapId(state.observeMapId)) {
      score += 2;
      reasons.push("observeMapId");
      if (state.currentMapId === state.observeMapId) {
        score += 1;
        reasons.push("currentMapId==observeMapId");
      }
    }

    if (isValidMapType(state.currentMapType)) {
      score += 2;
      reasons.push("currentMapType");
    }

    if (isValidMapType(state.observeMapType)) {
      score += 1;
      reasons.push("observeMapType");
    }

    if (isReasonableDistrict(state.districtId)) {
      score += 1;
      reasons.push("districtId");
    }

    if (isReasonablePlayerNumber(state.playerNumber)) {
      score += 1;
      reasons.push("playerNumber");
    }

    if (includeStringFields && inspection.playerName) {
      score += 6;
      reasons.push("playerName");
    }

    if (includeStringFields && inspection.playerEmail) {
      score += 3;
      reasons.push("playerEmail");
    }

    return { score, reasons };
  }

  function scorePlayerNameAnchoredContext(inspection, expectedName) {
    const scored = scoreNativeCharContextInspection(inspection);
    const name = typeof expectedName === "string" ? expectedName : "";
    const actualName = inspection?.playerName || "";

    if (!name) {
      return scored;
    }

    if (actualName === name) {
      scored.score += 12;
      scored.reasons.push("playerNameExact");
    } else if (
      actualName &&
      actualName.toLowerCase() === name.toLowerCase()
    ) {
      scored.score += 10;
      scored.reasons.push("playerNameCaseFolded");
    } else if (actualName && actualName.includes(name)) {
      scored.score += 6;
      scored.reasons.push("playerNameContains");
    }

    return scored;
  }

  function createRelativeDefinition(candidate, delta = 0) {
    if (
      !candidate ||
      !Array.isArray(candidate.pathOffsets) ||
      candidate.pathOffsets.length === 0
    ) {
      return null;
    }

    const baseOffsets = cloneOffsets(candidate.pathOffsets);
    if (!delta) {
      return createStateAddressDefinition(baseOffsets);
    }

    const dereferenceOffsets = baseOffsets.slice(0, -1);
    const finalOffset = (baseOffsets[baseOffsets.length - 1] + delta) | 0;
    return {
      base: {
        base: "modules.gameplay.contextSlotAddress",
        offsets: dereferenceOffsets,
        type: "pointerChain",
      },
      offset: finalOffset,
      type: "offsetAddress",
    };
  }

  function scanNativeCharContextAlignment(
    address,
    options = {}
  ) {
    if (!address) {
      return [];
    }

    const startDelta =
      typeof options.startDelta === "number" ? options.startDelta | 0 : -0x80;
    const endDelta =
      typeof options.endDelta === "number" ? options.endDelta | 0 : 0x80;
    const step =
      typeof options.step === "number" && options.step > 0 ? options.step | 0 : 4;

    const rows = [];
    for (let delta = startDelta; delta <= endDelta; delta += step) {
      const candidateAddress = (address + delta) >>> 0;
      const inspection = inspectNativeCharContext(candidateAddress);
      const scored = scoreNativeCharContextInspection(inspection);
      if (scored.score <= 0) {
        continue;
      }
      rows.push({
        address: candidateAddress,
        delta,
        nativeState: inspection.nativeState,
        playerEmail: inspection.playerEmail,
        playerName: inspection.playerName,
        playerUuidWords: inspection.playerUuidWords,
        reasons: scored.reasons,
        score: scored.score,
      });
    }

    return rows.sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return Math.abs(left.delta) - Math.abs(right.delta);
    });
  }

  function findNativeCharContextsByPlayerName(name, options = {}) {
    if (!name || typeof name !== "string") {
      return [];
    }

    const limit =
      typeof options.limit === "number" && options.limit > 0
        ? options.limit | 0
        : 32;
    const nameOffset =
      typeof options.nameOffset === "number" ? options.nameOffset | 0 : 0x74;
    const start =
      typeof options.start === "number" && options.start >= 0
        ? options.start | 0
        : 0;
    const end =
      typeof options.end === "number" && options.end > start
        ? options.end | 0
        : getMemoryLimit();
    const baseSearchStart =
      typeof options.baseSearchStart === "number"
        ? options.baseSearchStart | 0
        : 0x40;
    const baseSearchEnd =
      typeof options.baseSearchEnd === "number"
        ? options.baseSearchEnd | 0
        : 0xc0;
    const baseSearchStep =
      typeof options.baseSearchStep === "number" && options.baseSearchStep > 0
        ? options.baseSearchStep | 0
        : 4;

    if (typeof runtime.hook.findAllUtf16 !== "function") {
      return [];
    }

    const hits = runtime.hook.findAllUtf16(name, start, end, limit);
    const candidates = new Map();

    for (let index = 0; index < hits.length; index += 1) {
      const hit = hits[index];
      const offsetsToTry = new Set([nameOffset]);
      for (
        let assumedOffset = baseSearchStart;
        assumedOffset <= baseSearchEnd;
        assumedOffset += baseSearchStep
      ) {
        offsetsToTry.add(assumedOffset);
      }

      for (const assumedOffset of offsetsToTry) {
        const address = hit - assumedOffset;
        if (address <= 0) {
          continue;
        }

        const inspection = inspectNativeCharContext(address);
        const scored = scoreNativeCharContextInspection(inspection, {
          includeStringFields: false,
        });
        scored.score += 12;
        scored.reasons.push("playerNameExact");
        if (scored.score <= 0) {
          continue;
        }

        const previous = candidates.get(address);
        const entry = {
          address,
          assumedNameOffset: assumedOffset,
          hitAddress: hit,
          hitIndex: index,
          name,
          nativeState: inspection?.nativeState || null,
          playerEmail: inspection?.playerEmail || "",
          playerName: inspection?.playerName || "",
          playerUuidWords: inspection?.playerUuidWords || [],
          reasons: scored.reasons,
          score: scored.score,
          state: readStateAtAddress(address),
        };

        if (!previous || entry.score > previous.score) {
          candidates.set(address, entry);
        }
      }
    }

    return Array.from(candidates.values()).sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (left.hitAddress !== right.hitAddress) {
        return left.hitAddress - right.hitAddress;
      }
      return left.address - right.address;
    });
  }

  function cloneOffsets(offsets) {
    return Array.isArray(offsets) ? offsets.slice() : [];
  }

  function formatOffsets(offsets) {
    if (!Array.isArray(offsets) || offsets.length === 0) {
      return "[]";
    }
    return (
      "[" +
      offsets.map((offset) => "0x" + (offset >>> 0).toString(16)).join(", ") +
      "]"
    );
  }

  function createStateAddressDefinition(offsets) {
    if (!Array.isArray(offsets) || offsets.length === 0) {
      return null;
    }
    return {
      base: "modules.gameplay.contextSlotAddress",
      offsets: cloneOffsets(offsets),
      type: "pointerChain",
    };
  }

  function scoreStateCandidate(state) {
    if (!state) {
      return { score: 0, reasons: ["no-state"] };
    }

    let score = 0;
    const reasons = [];

    const isExplorable = state.isExplorable;
    if (isExplorable === 0 || isExplorable === 1) {
      score += 2;
      reasons.push("isExplorable");
    }

    if (Number.isInteger(state.language) && state.language >= 0 && state.language <= 32) {
      score += 2;
      reasons.push("language");
    }

    if (Number.isInteger(state.mapId) && state.mapId > 0 && state.mapId < 5000) {
      score += 3;
      reasons.push("mapId");
    }

    if (
      Number.isInteger(state.observeMapId) &&
      state.observeMapId > 0 &&
      state.observeMapId < 5000
    ) {
      score += 2;
      reasons.push("observeMapId");
      if (state.mapId === state.observeMapId) {
        score += 1;
        reasons.push("mapId==observeMapId");
      }
    }

    if (Number.isInteger(state.mapType) && state.mapType >= 0 && state.mapType <= 16) {
      score += 2;
      reasons.push("mapType");
    }

    if (
      Number.isInteger(state.observeMapType) &&
      state.observeMapType >= 0 &&
      state.observeMapType <= 16
    ) {
      score += 1;
      reasons.push("observeMapType");
    }

    if (
      Number.isInteger(state.districtId) &&
      state.districtId >= -1 &&
      state.districtId <= 20000
    ) {
      score += 1;
      reasons.push("districtId");
    }

    if (
      Number.isInteger(state.playerNumber) &&
      state.playerNumber >= 0 &&
      state.playerNumber < 1000000
    ) {
      score += 1;
      reasons.push("playerNumber");
    }

    return { score, reasons };
  }

  function findStateCandidates(options = {}) {
    const rootAddress =
      typeof options.rootAddress === "number"
        ? options.rootAddress
        : getGameplayContextAddress();
    const depthLimit =
      typeof options.depth === "number" && options.depth >= 0 ? options.depth : 2;
    const nodeBytes =
      typeof options.nodeBytes === "number" && options.nodeBytes > 0
        ? options.nodeBytes
        : 0x100;
    const maxNodes =
      typeof options.maxNodes === "number" && options.maxNodes > 0
        ? options.maxNodes
        : 256;

    if (!rootAddress) {
      return [];
    }

    const seen = new Set();
    const queue = [
      {
        address: rootAddress,
        depth: 0,
        pathOffsets: [0],
        source: "root",
      },
    ];
    const candidates = [];

    while (queue.length > 0 && seen.size < maxNodes) {
      const current = queue.shift();
      if (!current || seen.has(current.address)) {
        continue;
      }
      seen.add(current.address);

      const state = readStateAtAddress(current.address);
      const scored = scoreStateCandidate(state);
      if (scored.score > 0) {
        candidates.push({
          address: current.address,
          depth: current.depth,
          definition: createStateAddressDefinition(current.pathOffsets),
          pathOffsets: cloneOffsets(current.pathOffsets),
          reasons: scored.reasons,
          score: scored.score,
          source: current.source,
          state,
        });
      }

      if (current.depth >= depthLimit) {
        continue;
      }

      const pointers = listLikelyPointers(current.address, nodeBytes);
      for (const pointer of pointers) {
        if (!seen.has(pointer.value)) {
          queue.push({
            address: pointer.value,
            depth: current.depth + 1,
            pathOffsets: cloneOffsets(current.pathOffsets).concat(pointer.offset),
            source:
              "0x" +
              current.address.toString(16) +
              "+0x" +
              pointer.offset.toString(16),
          });
        }
      }
    }

    return candidates.sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.depth - right.depth;
    });
  }

  function normalizeCandidate(target) {
    if (!target) {
      return null;
    }

    if (typeof target === "number" && Number.isFinite(target)) {
      return findStateCandidates().find((candidate) => candidate.address === target) || null;
    }

    if (typeof target === "object") {
      if (typeof target.address === "number" && Array.isArray(target.pathOffsets)) {
        return {
          ...target,
          pathOffsets: cloneOffsets(target.pathOffsets),
        };
      }

      if (typeof target.address === "number") {
        return findStateCandidates().find(
          (candidate) => candidate.address === target.address
        ) || null;
      }
    }

    return null;
  }

  function inspectCandidates(limit = 10, options = {}) {
    return findStateCandidates(options)
      .slice(0, Math.max(0, limit | 0))
      .map((candidate, index) => ({
        address: candidate.address,
        charContext: inspectNativeCharContext(candidate.address),
        definition: candidate.definition,
        depth: candidate.depth,
        index,
        path: formatOffsets(candidate.pathOffsets),
        pathOffsets: cloneOffsets(candidate.pathOffsets),
        reasons: candidate.reasons.slice(),
        score: candidate.score,
        source: candidate.source,
        state: candidate.state,
      }));
  }

  function inspectShallowCandidates(limit = 10, maxDepth = 1, options = {}) {
    const depthLimit =
      typeof maxDepth === "number" && maxDepth >= 0 ? maxDepth : 1;
    return inspectCandidates(limit * 4, options)
      .filter((candidate) => candidate.depth <= depthLimit)
      .slice(0, Math.max(0, limit | 0));
  }

  function collectReachableNodes(options = {}) {
    const rootAddress =
      typeof options.rootAddress === "number"
        ? options.rootAddress
        : getGameplayContextAddress();
    const depthLimit =
      typeof options.depth === "number" && options.depth >= 0 ? options.depth : 4;
    const nodeBytes =
      typeof options.nodeBytes === "number" && options.nodeBytes > 0
        ? options.nodeBytes
        : 0x100;
    const maxNodes =
      typeof options.maxNodes === "number" && options.maxNodes > 0
        ? options.maxNodes
        : 2048;
    const pointerOptions = {
      minPointerAddress:
        typeof options.minPointerAddress === "number"
          ? options.minPointerAddress
          : 0x10000,
    };

    if (!rootAddress) {
      return new Map();
    }

    const seen = new Set();
    const queue = [
      {
        address: rootAddress,
        depth: 0,
        pathOffsets: [0],
        source: "root",
      },
    ];
    const nodes = new Map();

    while (queue.length > 0 && seen.size < maxNodes) {
      const current = queue.shift();
      if (!current || seen.has(current.address)) {
        continue;
      }
      seen.add(current.address);
      nodes.set(current.address, {
        address: current.address,
        depth: current.depth,
        path: formatOffsets(current.pathOffsets),
        pathOffsets: cloneOffsets(current.pathOffsets),
        source: current.source,
      });

      if (current.depth >= depthLimit) {
        continue;
      }

      const pointers = listLikelyPointers(current.address, nodeBytes, pointerOptions);
      for (const pointer of pointers) {
        if (!seen.has(pointer.value)) {
          queue.push({
            address: pointer.value,
            depth: current.depth + 1,
            pathOffsets: cloneOffsets(current.pathOffsets).concat(pointer.offset),
            source:
              "0x" +
              current.address.toString(16) +
              "+0x" +
              pointer.offset.toString(16),
          });
        }
      }
    }

    return nodes;
  }

  function findReferencesToAddress(targetAddress, options = {}) {
    if (!targetAddress || typeof runtime.hook.scanU32 !== "function") {
      return [];
    }

    const start =
      typeof options.start === "number" && options.start >= 0
        ? options.start | 0
        : 0;
    const end =
      typeof options.end === "number" && options.end > start
        ? options.end | 0
        : getMemoryLimit();
    const limit =
      typeof options.limit === "number" && options.limit > 0
        ? options.limit | 0
        : 4096;

    return runtime.hook.scanU32(targetAddress >>> 0, start, end, limit);
  }

  function findAnchoredPathsToAddress(targetAddress, options = {}) {
    const reachable = collectReachableNodes(options);
    const anchorNodeBytes =
      typeof options.anchorNodeBytes === "number" && options.anchorNodeBytes > 0
        ? options.anchorNodeBytes
        : typeof options.nodeBytes === "number" && options.nodeBytes > 0
          ? options.nodeBytes
          : 0x400;
    const maxResults =
      typeof options.maxResults === "number" && options.maxResults > 0
        ? options.maxResults | 0
        : 16;
    const referenceSlots = findReferencesToAddress(targetAddress, options);
    const results = [];
    const seenKeys = new Set();

    for (const slotAddress of referenceSlots) {
      for (let offset = 0; offset <= anchorNodeBytes; offset += 4) {
        const ownerAddress = slotAddress - offset;
        const owner = reachable.get(ownerAddress);
        if (!owner) {
          continue;
        }

        const pathOffsets = cloneOffsets(owner.pathOffsets).concat(offset);
        const key = ownerAddress + ":" + offset;
        if (seenKeys.has(key)) {
          continue;
        }
        seenKeys.add(key);

        results.push({
          address: targetAddress >>> 0,
          definition: createStateAddressDefinition(pathOffsets),
          depth: owner.depth + 1,
          ownerAddress,
          ownerDepth: owner.depth,
          ownerPath: owner.path,
          path: formatOffsets(pathOffsets),
          pathOffsets,
          pointerOffset: offset,
          slotAddress,
          targetAddress: targetAddress >>> 0,
        });

        if (results.length >= maxResults) {
          return results;
        }
      }
    }

    return results.sort((left, right) => {
      if (left.depth !== right.depth) {
        return left.depth - right.depth;
      }
      return left.pointerOffset - right.pointerOffset;
    });
  }

  function findPointerPathsToAddress(targetAddress, options = {}) {
    const rootAddress =
      typeof options.rootAddress === "number"
        ? options.rootAddress
        : getGameplayContextAddress();
    const depthLimit =
      typeof options.depth === "number" && options.depth >= 0 ? options.depth : 4;
    const nodeBytes =
      typeof options.nodeBytes === "number" && options.nodeBytes > 0
        ? options.nodeBytes
        : 0x100;
    const maxNodes =
      typeof options.maxNodes === "number" && options.maxNodes > 0
        ? options.maxNodes
        : 2048;
    const maxResults =
      typeof options.maxResults === "number" && options.maxResults > 0
        ? options.maxResults
        : 16;
    const pointerOptions = {
      minPointerAddress:
        typeof options.minPointerAddress === "number"
          ? options.minPointerAddress
          : 0x10000,
    };

    if (!rootAddress || !targetAddress) {
      return [];
    }

    const seen = new Set();
    const queue = [
      {
        address: rootAddress,
        depth: 0,
        pathOffsets: [0],
        source: "root",
      },
    ];
    const results = [];

    while (queue.length > 0 && seen.size < maxNodes && results.length < maxResults) {
      const current = queue.shift();
      if (!current || seen.has(current.address)) {
        continue;
      }
      seen.add(current.address);

      if (current.address === targetAddress) {
        results.push({
          address: current.address,
          definition: createStateAddressDefinition(current.pathOffsets),
          depth: current.depth,
          path: formatOffsets(current.pathOffsets),
          pathOffsets: cloneOffsets(current.pathOffsets),
          source: current.source,
          targetAddress,
        });
        continue;
      }

      if (current.depth >= depthLimit) {
        continue;
      }

      const pointers = listLikelyPointers(current.address, nodeBytes, pointerOptions);
      for (const pointer of pointers) {
        const nextPathOffsets = cloneOffsets(current.pathOffsets).concat(pointer.offset);
        if (pointer.value === targetAddress) {
          results.push({
            address: pointer.value,
            definition: createStateAddressDefinition(nextPathOffsets),
            depth: current.depth + 1,
            path: formatOffsets(nextPathOffsets),
            pathOffsets: nextPathOffsets,
            source:
              "0x" +
              current.address.toString(16) +
              "+0x" +
              pointer.offset.toString(16),
            targetAddress,
          });
          if (results.length >= maxResults) {
            break;
          }
        }

        if (!seen.has(pointer.value)) {
          queue.push({
            address: pointer.value,
            depth: current.depth + 1,
            pathOffsets: nextPathOffsets,
            source:
              "0x" +
              current.address.toString(16) +
              "+0x" +
              pointer.offset.toString(16),
          });
        }
      }
    }

    return results.sort((left, right) => {
      if (left.depth !== right.depth) {
        return left.depth - right.depth;
      }
      return left.pathOffsets.length - right.pathOffsets.length;
    });
  }

  function promoteStateCandidate(target) {
    const candidate = normalizeCandidate(target);
    if (!candidate || !Array.isArray(candidate.pathOffsets) || candidate.pathOffsets.length === 0) {
      return {
        available: false,
        error: "Candidate path offsets are required",
      };
    }

    const buildId = getActiveBuildId();
    if (!buildId) {
      return {
        available: false,
        error: "Build ID is not available",
      };
    }

    const definition = createStateAddressDefinition(candidate.pathOffsets);
    runtime.resolver.mergeBuild(buildId, {
      modules: {
        map: {
          stateAddress: definition,
        },
      },
    });

    return {
      available: true,
      address: candidate.address,
      buildId,
      definition,
      path: formatOffsets(candidate.pathOffsets),
      state: readStateAtAddress(candidate.address),
    };
  }

  function promoteAlignedStateCandidate(target, delta = 0) {
    const candidate = normalizeCandidate(target);
    if (!candidate) {
      return {
        available: false,
        error: "Candidate not found",
      };
    }

    const buildId = getActiveBuildId();
    if (!buildId) {
      return {
        available: false,
        error: "Build ID is not available",
      };
    }

    const definition = createRelativeDefinition(candidate, delta);
    if (!definition) {
      return {
        available: false,
        error: "Candidate path offsets are required",
      };
    }

    runtime.resolver.mergeBuild(buildId, {
      modules: {
        map: {
          stateAddress: definition,
        },
      },
    });

    const address =
      typeof delta === "number" && Number.isFinite(delta)
        ? (candidate.address + (delta | 0)) >>> 0
        : candidate.address;

    return {
      available: true,
      address,
      buildId,
      definition,
      nativeCharContext: inspectNativeCharContext(address),
      path: formatOffsets(candidate.pathOffsets),
      state: readStateAtAddress(address),
    };
  }

  function promoteNativeCharContextAddress(address) {
    const buildId = getActiveBuildId();
    if (!buildId) {
      return {
        available: false,
        error: "Build ID is not available",
      };
    }

    const normalizedAddress =
      typeof address === "number" && Number.isFinite(address) ? address >>> 0 : 0;
    if (!normalizedAddress) {
      return {
        available: false,
        error: "A valid CharContext address is required",
      };
    }

    runtime.resolver.mergeBuild(buildId, {
      modules: {
        gameplay: {
          charContextAddress: normalizedAddress,
        },
        map: {
          stateAddress: "modules.gameplay.charContextAddress",
        },
      },
    });

    return {
      available: true,
      address: normalizedAddress,
      buildId,
      nativeCharContext: inspectNativeCharContext(normalizedAddress),
      state: readStateAtAddress(normalizedAddress),
    };
  }

  function promoteNativeCharContextByPlayerName(name, options = {}) {
    const matches = findNativeCharContextsByPlayerName(name, options);
    const index =
      typeof options.index === "number" && options.index >= 0
        ? options.index | 0
        : 0;
    const match = matches[index] || null;
    if (!match) {
      return {
        available: false,
        error: "No CharContext match found for player name",
        name,
      };
    }

    const promoted = promoteNativeCharContextAddress(match.address);
    return {
      ...promoted,
      match,
    };
  }

  function normalizeBaseContextCandidate(target, options = {}) {
    if (!target) {
      return null;
    }
    if (typeof target === "object" && typeof target.propContextAddress === "number") {
      const game = describeGameContextForRoot(target.propContextAddress);
      return game.rejection
        ? null
        : {
            baseContextTableAddress: 0,
            basePtrSlotAddress: 0,
            propContextRoot: target,
            source: target.source || "directPropContextRoot",
            ...game,
          };
    }
    if (typeof target === "object" && typeof target.gameContextAddress === "number") {
      return target;
    }
    if (typeof target === "number" && Number.isFinite(target)) {
      const address = target >>> 0;
      const byGame = findBaseContextCandidates({
        ...options,
        gameContextAddress: address,
        limit: 1,
      }).candidates[0];
      if (byGame) {
        return byGame;
      }
      const game = describeGameContextForRoot(address);
      return game.rejection
        ? null
        : {
            baseContextTableAddress: 0,
            basePtrSlotAddress: 0,
            source: "directGameContext",
            ...game,
          };
    }
    return null;
  }

  function promoteBaseContextCandidate(target, options = {}) {
    const buildId = getActiveBuildId();
    if (!buildId) {
      return {
        available: false,
        error: "Build ID is not available",
      };
    }

    const candidate = normalizeBaseContextCandidate(target, options);
    if (!candidate || candidate.rejection) {
      return {
        available: false,
        error: "BaseContext candidate did not validate",
        target,
      };
    }

    const gameplayDefinition = candidate.basePtrSlotAddress
      ? {
          baseContextTableAddress: candidate.baseContextTableAddress,
          basePtrAddress: candidate.basePtrSlotAddress,
          charContextAddress: {
            base: "modules.gameplay.basePtrAddress",
            offsets: [
              0,
              BASE_CONTEXT_GAME_SLOT_OFFSET,
              GAME_CONTEXT_OFFSETS.character,
            ],
            type: "pointerChain",
          },
          contextAddress: {
            base: "modules.gameplay.basePtrAddress",
            offsets: [0, BASE_CONTEXT_GAME_SLOT_OFFSET],
            type: "pointerChain",
          },
          mapContextAddress: {
            base: "modules.gameplay.basePtrAddress",
            offsets: [
              0,
              BASE_CONTEXT_GAME_SLOT_OFFSET,
              GAME_CONTEXT_OFFSETS.map,
            ],
            type: "pointerChain",
          },
          worldContextAddress: {
            base: "modules.gameplay.basePtrAddress",
            offsets: [
              0,
              BASE_CONTEXT_GAME_SLOT_OFFSET,
              GAME_CONTEXT_OFFSETS.world,
            ],
            type: "pointerChain",
          },
        }
      : {
          baseContextTableAddress: candidate.baseContextTableAddress || 0,
          charContextAddress: candidate.charContextAddress,
          contextAddress: candidate.gameContextAddress,
          mapContextAddress: candidate.mapContextAddress,
          worldContextAddress: candidate.worldContextAddress,
        };

    runtime.resolver.mergeBuild(buildId, {
      modules: {
        gameplay: gameplayDefinition,
        map: {
          stateAddress: "modules.gameplay.charContextAddress",
        },
      },
    });

    return {
      available: true,
      buildId,
      candidate,
      addresses: {
        baseContextTableAddress: candidate.baseContextTableAddress || 0,
        basePtrAddress: candidate.basePtrSlotAddress || 0,
        charContextAddress: candidate.charContextAddress,
        gameContextAddress: candidate.gameContextAddress,
        mapContextAddress: candidate.mapContextAddress,
        worldContextAddress: candidate.worldContextAddress,
      },
      definition: gameplayDefinition,
      nativeCharContext: candidate.charContext,
      state: readStateAtAddress(candidate.charContextAddress),
    };
  }

  function getRegionId() {
    const regionAddress = getAddress("modules.map.regionIdAddress");
    if (regionAddress) {
      return safeReadI32(regionAddress);
    }
    return readField("regionId");
  }

  return Object.freeze({
    describe(options = {}) {
      const schema = getSchema();
      const resolve = options && options.resolve === true;
      return {
        address: resolve ? getStateAddress() : null,
        charContextAddress: resolve ? getCharContextAddress() : null,
        gameplayContextAddress: getGameplayContextAddress(),
        gameplayContextSlotAddress: getGameplayContextSlotAddress(),
        hasSchema: !!schema,
        hasStateAddressDefinition: hasDefinition("modules.map.stateAddress"),
        mapContextAddress: resolve ? getMapContextAddress() : null,
        regionAddress: resolve ? getAddress("modules.map.regionIdAddress") : null,
        resolution: resolve
          ? runtime.resolver.describe("modules.map.stateAddress")
          : null,
        schemaFields: schema ? Object.keys(schema) : [],
      };
    },
    dumpAddressPointers(address, byteLength, step, options) {
      return dumpPointers(address, byteLength, step, options);
    },
    inspectMapAgent(address) {
      return inspectMapAgent(address);
    },
    inspectMapAgentArrayHeader(address, options) {
      return inspectMapAgentArrayHeader(address, options);
    },
    getStateAtAddress(address) {
      return readStateAtAddress(address);
    },
    getDistrictId() {
      return readField("districtId");
    },
    getMapId() {
      return readField("mapId");
    },
    getCharContextAddress,
    getGameplayContextAddress,
    getGameplayContextSlotAddress,
    getMapContextAddress,
    getRegionId,
    getState() {
      const view = getStateView();
      if (!view) {
        return null;
      }
      const state = view.$read();
      const regionId = getRegionId();
      if (regionId !== null) {
        state.regionId = regionId;
      }
      return state;
    },
    getStateAddress,
    getStateView,
    findStateCandidates,
    inspectGameplayContext(byteLength = 0x80) {
      return dumpPointers(getGameplayContextAddress(), byteLength, 4);
    },
    inspectGameplayContextPointers(byteLength = 0x80, options) {
      return listLikelyPointers(
        getGameplayContextAddress(),
        byteLength,
        options
      );
    },
    listLikelyPointers(address, byteLength, options) {
      return listLikelyPointers(address, byteLength, options);
    },
    inspectStateCandidates(limit = 10) {
      return inspectCandidates(limit);
    },
    inspectShallowStateCandidates(limit = 10, maxDepth = 1) {
      return inspectShallowCandidates(limit, maxDepth);
    },
    inspectNativeCharContext(address) {
      return inspectNativeCharContext(address);
    },
    inspectGameContextRoot(address) {
      return describeGameContextForRoot(address);
    },
    inspectBaseContextTable(address, gameContextAddress) {
      const game = describeGameContextForRoot(gameContextAddress);
      return describeBaseContextTable(address, game);
    },
    findBaseContextCandidates(options = {}) {
      return findBaseContextCandidates(options);
    },
    findBasePtrSlotsForTable(tableAddress, options = {}) {
      return findBasePtrSlotsForTable(tableAddress, options);
    },
    findGameContextRootCandidates(options = {}) {
      return findGameContextRootCandidates(options);
    },
    findGameContextRootReferences(rootCandidate, options = {}) {
      return findGameContextRootReferences(rootCandidate, options);
    },
    findPropContextRootCandidates(options = {}) {
      return findPropContextRootCandidates(options);
    },
    inspectPropContextRoot(address, options = {}) {
      return describePropContextRoot(address, options);
    },
    findNativeCharContextsByPlayerName(name, options) {
      return findNativeCharContextsByPlayerName(name, options);
    },
    findReferencesToAddress(targetAddress, options) {
      return findReferencesToAddress(targetAddress, options);
    },
    findAnchoredPathsToAddress(targetAddress, options) {
      return findAnchoredPathsToAddress(targetAddress, options);
    },
    findPointerPathsToAddress(targetAddress, options) {
      return findPointerPathsToAddress(targetAddress, options);
    },
    inspectNativeCharContextAlignment(target, options) {
      const candidate = normalizeCandidate(target);
      const address =
        candidate && typeof candidate.address === "number"
          ? candidate.address
          : typeof target === "number"
            ? target
            : 0;
      return scanNativeCharContextAlignment(address, options);
    },
    promoteStateCandidate(target) {
      return promoteStateCandidate(target);
    },
    promoteAlignedStateCandidate(target, delta = 0) {
      return promoteAlignedStateCandidate(target, delta);
    },
    promoteNativeCharContextAddress(address) {
      return promoteNativeCharContextAddress(address);
    },
    promoteNativeCharContextByPlayerName(name, options) {
      return promoteNativeCharContextByPlayerName(name, options);
    },
    promoteBaseContextCandidate(target, options) {
      return promoteBaseContextCandidate(target, options);
    },
    isAvailable() {
      return !!getStateView();
    },
  });
}
