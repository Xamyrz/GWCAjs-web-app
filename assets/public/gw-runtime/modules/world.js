export function createWorldModule(runtime) {
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

  function safeReadU16(address) {
    return safeRead(runtime.hook?.readU16, address);
  }

  function safeReadU8(address) {
    return safeRead(runtime.hook?.readU8, address);
  }

  function safeReadU32(address) {
    return safeRead(runtime.hook?.readU32, address);
  }

  function isLikelyPointer(value, minPointerAddress = 0x10000) {
    const limit = getMemoryLimit();
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= minPointerAddress &&
      value < limit
    );
  }

  function readUtf16(address, maxCodeUnits = 32) {
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

  function dumpPointers(address, byteLength = 0x100, step = 4, options = {}) {
    if (!address) {
      return [];
    }

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
        isLikelyPointer: isLikelyPointer(value, minPointerAddress),
        offset,
        slotAddress,
        value,
      });
    }

    return rows;
  }

  function getCharContextAddress() {
    return typeof runtime.map?.getCharContextAddress === "function"
      ? runtime.map.getCharContextAddress()
      : 0;
  }

  function getGameplayContextAddress() {
    return typeof runtime.map?.getGameplayContextAddress === "function"
      ? runtime.map.getGameplayContextAddress()
      : 0;
  }

  function getExpectedName() {
    return typeof runtime.player?.getCharacterName === "function"
      ? runtime.player.getCharacterName()
      : null;
  }

  function getExpectedPlayerNumber() {
    return typeof runtime.map?.getState === "function"
      ? runtime.map.getState()?.playerNumber ?? 0
      : 0;
  }

  function isReasonablePlayerLike(entry, expectedName, expectedPlayerNumber) {
    if (!entry || typeof entry.agentId !== "number" || entry.agentId <= 0 || entry.agentId >= 0x10000000) {
      return false;
    }
    if (typeof entry.primary !== "number" || entry.primary < 0 || entry.primary > 10) {
      return false;
    }
    if (typeof entry.secondary !== "number" || entry.secondary < 0 || entry.secondary > 10) {
      return false;
    }
    if (
      typeof entry.playerNumber !== "number" ||
      entry.playerNumber <= 0 ||
      entry.playerNumber >= 0x10000
    ) {
      return false;
    }
    if (
      typeof entry.partySize !== "number" ||
      entry.partySize < 0 ||
      entry.partySize > 12
    ) {
      return false;
    }
    if (expectedName && !entry.name) {
      return false;
    }
    if (
      typeof expectedPlayerNumber === "number" &&
      expectedPlayerNumber > 0 &&
      entry.playerNumber !== expectedPlayerNumber &&
      entry.partyLeaderPlayerNumber !== expectedPlayerNumber
    ) {
      return false;
    }
    return true;
  }

  function inspectPointerArrayTarget(address, options = {}) {
    const count =
      typeof options.count === "number" && options.count > 0 ? options.count | 0 : 8;
    const entries = [];
    let likelyPointerCount = 0;

    for (let index = 0; index < count; index += 1) {
      const entryAddress = address + index * 4;
      const value = safeReadU32(entryAddress);
      const pointerLike = isLikelyPointer(value);
      if (pointerLike) {
        likelyPointerCount += 1;
      }
      entries.push({
        address: entryAddress,
        isLikelyPointer: pointerLike,
        value,
      });
    }

    return {
      address,
      entries,
      likelyPointerCount,
      score: likelyPointerCount,
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
    if (!header || !isLikelyPointer(header.buffer)) {
      return false;
    }

    const maxCapacity =
      typeof options.maxCapacity === "number" && options.maxCapacity > 0
        ? options.maxCapacity | 0
        : 512;
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

  function getExpectedAgentLevel(options = {}) {
    if (
      typeof options.level === "number" &&
      Number.isFinite(options.level) &&
      options.level >= 1 &&
      options.level <= 30
    ) {
      return options.level | 0;
    }

    const agent =
      typeof runtime.player?.getAgent === "function"
        ? runtime.player.getAgent({ ...options, scan: true })
        : null;
    if (
      agent &&
      typeof agent.level === "number" &&
      Number.isFinite(agent.level) &&
      agent.level >= 1 &&
      agent.level <= 30
    ) {
      return agent.level | 0;
    }

    return 20;
  }

  function analyzeLevelFieldCandidates(buffer, size, stride, options = {}) {
    if (!isLikelyPointer(buffer) || !(size > 0) || !(stride > 0)) {
      return [];
    }

    const expectedLevel = getExpectedAgentLevel(options);
    const sampleCount =
      typeof options.sampleCount === "number" && options.sampleCount > 0
        ? options.sampleCount | 0
        : 12;
    const maxEntries = Math.min(size | 0, sampleCount);
    const maxOffset =
      typeof options.maxFieldOffset === "number" && options.maxFieldOffset >= 0
        ? Math.min(options.maxFieldOffset | 0, stride - 1)
        : Math.min(stride - 1, 0x40);
    const candidates = [];

    for (let fieldOffset = 0; fieldOffset <= maxOffset; fieldOffset += 1) {
      let plausibleCount = 0;
      let expectedMatches = 0;
      const values = [];

      for (let index = 0; index < maxEntries; index += 1) {
        const value = safeReadU8(buffer + index * stride + fieldOffset);
        values.push(value);
        if (typeof value === "number" && value >= 1 && value <= 30) {
          plausibleCount += 1;
          if (value === expectedLevel) {
            expectedMatches += 1;
          }
        }
      }

      if (plausibleCount === 0) {
        continue;
      }

      let score = plausibleCount;
      if (expectedMatches > 0) {
        score += expectedMatches * 3;
      }
      if (plausibleCount >= 3) {
        score += 2;
      }

      candidates.push({
        type: "u8",
        fieldOffset,
        plausibleCount,
        expectedLevel,
        expectedMatches,
        sampleValues: values.slice(0, 8),
        score,
      });
    }

    for (let fieldOffset = 0; fieldOffset + 1 <= maxOffset; fieldOffset += 2) {
      let plausibleCount = 0;
      let expectedMatches = 0;
      const values = [];

      for (let index = 0; index < maxEntries; index += 1) {
        const value = safeReadU16(buffer + index * stride + fieldOffset);
        values.push(value);
        if (typeof value === "number" && value >= 1 && value <= 30) {
          plausibleCount += 1;
          if (value === expectedLevel) {
            expectedMatches += 1;
          }
        }
      }

      if (plausibleCount === 0) {
        continue;
      }

      let score = plausibleCount;
      if (expectedMatches > 0) {
        score += expectedMatches * 3;
      }
      if (plausibleCount >= 3) {
        score += 2;
      }

      candidates.push({
        type: "u16",
        fieldOffset,
        plausibleCount,
        expectedLevel,
        expectedMatches,
        sampleValues: values.slice(0, 8),
        score,
      });
    }

    return candidates
      .filter((entry) => entry.score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        if (right.expectedMatches !== left.expectedMatches) {
          return right.expectedMatches - left.expectedMatches;
        }
        return left.fieldOffset - right.fieldOffset;
      })
      .slice(0, 8);
  }

  function inspectArrayHeaderLevelFields(address, options = {}) {
    const normalizedAddress =
      typeof address === "number" && Number.isFinite(address) ? address >>> 0 : 0;
    if (!normalizedAddress) {
      return null;
    }

    const strides = Array.isArray(options.strides) && options.strides.length > 0
      ? options.strides
          .filter((value) => typeof value === "number" && value > 0)
          .map((value) => value | 0)
      : [0x34, 0x38, 0x50, 0x1c4];
    const header = readArrayHeader(normalizedAddress);
    const analyses = [];

    for (const stride of strides) {
      if (!isReasonableArrayHeader(header, stride, options)) {
        continue;
      }
      const fieldCandidates = analyzeLevelFieldCandidates(
        header.buffer,
        header.size,
        stride,
        options
      );
      analyses.push({
        stride,
        fieldCandidates,
        score: fieldCandidates.reduce((sum, entry) => sum + Math.min(entry.score, 10), 0),
      });
    }

    return {
      ...header,
      address: normalizedAddress,
      analyses: analyses.sort((left, right) => right.score - left.score),
      expectedLevel: getExpectedAgentLevel(options),
    };
  }

  function summarizeArrayCandidate(candidate, kind) {
    if (!candidate || typeof candidate.score !== "number" || candidate.score <= 0) {
      return null;
    }

    return {
      address: candidate.address,
      buffer:
        typeof candidate.buffer === "number" && Number.isFinite(candidate.buffer)
          ? candidate.buffer >>> 0
          : null,
      capacity:
        typeof candidate.capacity === "number" && Number.isFinite(candidate.capacity)
          ? candidate.capacity | 0
          : null,
      kind,
      plausibleEntries: Array.isArray(candidate.plausibleEntries)
        ? candidate.plausibleEntries.slice(0, 6)
        : [],
      reasons: Array.isArray(candidate.reasons) ? candidate.reasons.slice() : [],
      sampleSize:
        typeof candidate.size === "number" && Number.isFinite(candidate.size)
          ? candidate.size | 0
          : null,
      score: candidate.score,
    };
  }

  function inspectChildTarget(address, options = {}) {
    const normalizedAddress =
      typeof address === "number" && Number.isFinite(address) ? address >>> 0 : 0;
    if (!normalizedAddress) {
      return null;
    }

    const pointerArray = inspectPointerArrayTarget(normalizedAddress, {
      count:
        typeof options.pointerCount === "number" && options.pointerCount > 0
          ? options.pointerCount | 0
          : 8,
    });
    const playerStride = inspectPlayerStrideTarget(normalizedAddress, {
      count:
        typeof options.playerStrideCount === "number" && options.playerStrideCount > 0
          ? options.playerStrideCount | 0
          : 6,
    });
    const mapAgentArray =
      typeof runtime.map?.inspectMapAgentArrayHeader === "function"
        ? runtime.map.inspectMapAgentArrayHeader(normalizedAddress, {
            maxCapacity:
              typeof options.maxArrayCapacity === "number" && options.maxArrayCapacity > 0
                ? options.maxArrayCapacity | 0
                : 256,
            maxSize:
              typeof options.maxArraySize === "number" && options.maxArraySize > 0
                ? options.maxArraySize | 0
                : 128,
            sampleCount:
              typeof options.sampleCount === "number" && options.sampleCount > 0
                ? options.sampleCount | 0
                : 8,
          })
        : null;
    const playerArray =
      typeof runtime.player?.inspectPlayerArrayHeader === "function"
        ? runtime.player.inspectPlayerArrayHeader(normalizedAddress, {
            maxCapacity:
              typeof options.maxArrayCapacity === "number" && options.maxArrayCapacity > 0
                ? options.maxArrayCapacity | 0
                : 256,
            maxSize:
              typeof options.maxArraySize === "number" && options.maxArraySize > 0
                ? options.maxArraySize | 0
                : 128,
            sampleCount:
              typeof options.sampleCount === "number" && options.sampleCount > 0
                ? options.sampleCount | 0
                : 8,
          })
        : null;
    const agentInfoArray =
      typeof runtime.player?.inspectAgentInfoArrayHeader === "function"
        ? runtime.player.inspectAgentInfoArrayHeader(normalizedAddress, {
            maxCapacity:
              typeof options.maxArrayCapacity === "number" && options.maxArrayCapacity > 0
                ? options.maxArrayCapacity | 0
                : 256,
            maxSize:
              typeof options.maxArraySize === "number" && options.maxArraySize > 0
                ? options.maxArraySize | 0
                : 128,
            sampleCount:
              typeof options.sampleCount === "number" && options.sampleCount > 0
                ? options.sampleCount | 0
                : 8,
          })
        : null;

    const arrayCandidates = [
      summarizeArrayCandidate(mapAgentArray, "mapAgentArray"),
      summarizeArrayCandidate(playerArray, "playerArray"),
      summarizeArrayCandidate(agentInfoArray, "agentInfoArray"),
    ]
      .filter(Boolean)
      .sort((left, right) => right.score - left.score);

    let score = 0;
    if (pointerArray.score > 0) {
      score += Math.min(pointerArray.score, 8);
    }
    if (playerStride.score > 0) {
      score += Math.min(playerStride.score, 12);
    }
    if (arrayCandidates.length > 0) {
      score += arrayCandidates.reduce((sum, entry) => sum + Math.min(entry.score, 10), 0);
    }

    return {
      address: normalizedAddress,
      arrayCandidates,
      playerStride,
      pointerArray,
      score,
    };
  }

  function inspectPlayerStrideTarget(address, options = {}) {
    const count =
      typeof options.count === "number" && options.count > 0 ? options.count | 0 : 6;
    const expectedName = getExpectedName();
    const expectedPlayerNumber = getExpectedPlayerNumber();
    const entries = [];
    const plausibleEntries = [];

    for (let index = 0; index < count; index += 1) {
      const entryAddress = address + index * 0x50;
      const entry =
        typeof runtime.player?.inspectPlayer === "function"
          ? runtime.player.inspectPlayer(entryAddress)
          : null;
      entries.push(entry);
      if (isReasonablePlayerLike(entry, expectedName, expectedPlayerNumber)) {
        plausibleEntries.push({
          address: entryAddress,
          index,
          name: entry.name,
          playerNumber: entry.playerNumber,
        });
      }
    }

    return {
      address,
      entries,
      plausibleEntries,
      score: plausibleEntries.length * 4,
    };
  }

  function summarizeLikelyPointer(pointer) {
    const text = readUtf16(pointer.value, 24);
    return {
      offset: pointer.offset,
      slotAddress: pointer.slotAddress,
      text,
      value: pointer.value,
    };
  }

  function inspectOwner(address, options = {}) {
    const normalizedAddress =
      typeof address === "number" && Number.isFinite(address) ? address >>> 0 : 0;
    if (!normalizedAddress) {
      return null;
    }

    const targetAddress =
      typeof options.targetAddress === "number" && Number.isFinite(options.targetAddress)
        ? options.targetAddress >>> 0
        : 0;
    const byteLength =
      typeof options.byteLength === "number" && options.byteLength > 0
        ? options.byteLength | 0
        : 0x140;
    const pointerRows = dumpPointers(normalizedAddress, byteLength, 4, options);
    const likelyPointers = pointerRows.filter((entry) => entry.isLikelyPointer);
    const directRefs = targetAddress
      ? pointerRows.filter((entry) => entry.value === targetAddress)
      : [];
    const stringPointers = likelyPointers
      .map(summarizeLikelyPointer)
      .filter((entry) => entry.text)
      .slice(0, 8);
    const pointerArrayHints = likelyPointers
      .slice(0, 12)
      .map((entry) => inspectPointerArrayTarget(entry.value, { count: 8 }))
      .filter((entry) => entry.score >= 3)
      .sort((left, right) => right.score - left.score)
      .slice(0, 6);
    const playerStrideHints = likelyPointers
      .slice(0, 12)
      .map((entry) => inspectPlayerStrideTarget(entry.value, { count: 6 }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 6);

    const reasons = [];
    let score = 0;

    if (directRefs.length > 0) {
      score += directRefs.length * 12;
      reasons.push("directCharContextRef");
    }
    if (likelyPointers.length >= 4) {
      score += Math.min(likelyPointers.length, 12);
      reasons.push("pointerDense");
    }
    if (pointerArrayHints.length > 0) {
      score += pointerArrayHints.reduce((sum, entry) => sum + Math.min(entry.score, 4), 0);
      reasons.push("pointerArrayHints");
    }
    if (playerStrideHints.length > 0) {
      score += playerStrideHints.reduce((sum, entry) => sum + Math.min(entry.score, 8), 0);
      reasons.push("playerStrideHints");
    }
    if (stringPointers.length > 0) {
      score += Math.min(stringPointers.length, 4);
      reasons.push("stringPointers");
    }

    return {
      address: normalizedAddress,
      directRefOffsets: directRefs.map((entry) => entry.offset),
      likelyPointerCount: likelyPointers.length,
      pointerArrayHints,
      pointerRows,
      playerStrideHints,
      reasons,
      score,
      stringPointers,
      targetAddress: targetAddress || null,
    };
  }

  function findExternalReferences(targetAddress, options = {}) {
    const normalizedTargetAddress =
      typeof targetAddress === "number" && Number.isFinite(targetAddress)
        ? targetAddress >>> 0
        : 0;
    if (!normalizedTargetAddress) {
      return [];
    }

    const excludeBytes =
      typeof options.excludeBytes === "number" && options.excludeBytes > 0
        ? options.excludeBytes | 0
        : 0x500;
    const refs =
      typeof runtime.map?.findReferencesToAddress === "function"
        ? runtime.map.findReferencesToAddress(normalizedTargetAddress, {
            limit:
              typeof options.limit === "number" && options.limit > 0
                ? options.limit | 0
                : 128,
          })
        : [];

    return refs.filter(
      (slotAddress) =>
        slotAddress < normalizedTargetAddress ||
        slotAddress >= normalizedTargetAddress + excludeBytes
    );
  }

  function buildOwnerOffsets(options = {}) {
    if (Array.isArray(options.ownerOffsets) && options.ownerOffsets.length > 0) {
      return options.ownerOffsets
        .filter((value) => typeof value === "number" && value >= 0)
        .map((value) => value | 0);
    }

    const ownerWindow =
      typeof options.ownerWindow === "number" && options.ownerWindow > 0
        ? options.ownerWindow | 0
        : 0x140;
    const step =
      typeof options.step === "number" && options.step > 0 ? options.step | 0 : 4;
    const offsets = [];
    for (let offset = 0; offset <= ownerWindow; offset += step) {
      offsets.push(offset);
    }
    return offsets;
  }

  function findCharContextOwnerCandidates(options = {}) {
    const charContextAddress =
      typeof options.charContextAddress === "number" && Number.isFinite(options.charContextAddress)
        ? options.charContextAddress >>> 0
        : getCharContextAddress();
    if (!charContextAddress) {
      return [];
    }

    const refs = findExternalReferences(charContextAddress, options);
    const ownerOffsets = buildOwnerOffsets(options);
    const candidates = new Map();

    for (const slotAddress of refs) {
      for (const ownerOffset of ownerOffsets) {
        const ownerAddress = (slotAddress - ownerOffset) >>> 0;
        if (!ownerAddress) {
          continue;
        }

        const inspected = inspectOwner(ownerAddress, {
          ...options,
          targetAddress: charContextAddress,
        });
        if (!inspected || inspected.score <= 0) {
          continue;
        }

        const entry = {
          ...inspected,
          ownerOffset,
          refSlotAddress: slotAddress,
        };
        const previous = candidates.get(ownerAddress);
        if (!previous || entry.score > previous.score) {
          candidates.set(ownerAddress, entry);
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

  function inspectCurrentCharContextCluster(options = {}) {
    const charContextAddress =
      typeof options.charContextAddress === "number" && Number.isFinite(options.charContextAddress)
        ? options.charContextAddress >>> 0
        : getCharContextAddress();
    if (!charContextAddress) {
      return {
        available: false,
        error: "CharContext address is not available",
      };
    }

    const ownerLimit =
      typeof options.ownerLimit === "number" && options.ownerLimit > 0
        ? options.ownerLimit | 0
        : 10;
    const childLimit =
      typeof options.childLimit === "number" && options.childLimit > 0
        ? options.childLimit | 0
        : 12;
    const childProbeLimit =
      typeof options.childProbeLimit === "number" && options.childProbeLimit > 0
        ? options.childProbeLimit | 0
        : Math.max(childLimit * 4, 32);
    const owners = findCharContextOwnerCandidates(options).slice(0, ownerLimit);
    const primaryOwner = owners[0] || null;

    if (!primaryOwner) {
      return {
        available: true,
        charContextAddress,
        childTargets: [],
        owners,
        primaryOwner: null,
      };
    }

    const ownerStart = primaryOwner.address >>> 0;
    const ownerByteLength =
      typeof options.byteLength === "number" && options.byteLength > 0
        ? options.byteLength | 0
        : 0x140;
    const ownerEnd = ownerStart + ownerByteLength;
    const likelyPointers = primaryOwner.pointerRows
      .filter((entry) => entry.isLikelyPointer)
      .slice(0, childProbeLimit);
    const childTargets = likelyPointers
      .map((entry) => {
        const inspected = inspectChildTarget(entry.value, options);
        if (!inspected) {
          return null;
        }
        const isInternalTarget =
          entry.value >= ownerStart && entry.value < ownerEnd;
        const isCharContextTarget = entry.value === charContextAddress;
        const relationship = isCharContextTarget
          ? "charContext"
          : isInternalTarget
            ? "internal"
            : "external";
        let adjustedScore = inspected.score;

        if (isInternalTarget) {
          adjustedScore -= 8;
        } else {
          adjustedScore += 4;
        }
        if (isCharContextTarget) {
          adjustedScore -= 4;
        }

        return {
          adjustedScore,
          relationship,
          offset: entry.offset,
          slotAddress: entry.slotAddress,
          targetAddress: entry.value,
          isCharContextTarget,
          isInternalTarget,
          ...inspected,
        };
      })
      .filter((entry) => entry && entry.adjustedScore > 0)
      .sort((left, right) => {
        if (right.adjustedScore !== left.adjustedScore) {
          return right.adjustedScore - left.adjustedScore;
        }
        if (left.relationship !== right.relationship) {
          if (left.relationship === "external") {
            return -1;
          }
          if (right.relationship === "external") {
            return 1;
          }
        }
        return right.score - left.score;
      })
      .slice(0, childLimit);

    return {
      available: true,
      charContextAddress,
      childTargets,
      owners,
      primaryOwner,
    };
  }

  function inspectCurrentCharContextLevelAnchors(options = {}) {
    const cluster = inspectCurrentCharContextCluster(options);
    if (!cluster || !cluster.available || !cluster.primaryOwner) {
      return {
        available: false,
        error: "Current CharContext cluster is not available",
      };
    }

    const strideByKind = Object.freeze({
      agentInfoArray: 0x38,
      mapAgentArray: 0x34,
      playerArray: 0x50,
    });

    const childAnalyses = [];
    for (const child of cluster.childTargets || []) {
      const arrayAnalyses = [];
      for (const candidate of child.arrayCandidates || []) {
        const stride = strideByKind[candidate.kind];
        if (!stride) {
          continue;
        }
        const analysis = inspectArrayHeaderLevelFields(candidate.address, {
          ...options,
          maxCapacity:
            typeof options.maxArrayCapacity === "number" && options.maxArrayCapacity > 0
              ? options.maxArrayCapacity | 0
              : 256,
          maxSize:
            typeof options.maxArraySize === "number" && options.maxArraySize > 0
              ? options.maxArraySize | 0
              : 128,
          strides: [stride],
        });
        if (!analysis || !Array.isArray(analysis.analyses) || analysis.analyses.length === 0) {
          continue;
        }
        arrayAnalyses.push({
          kind: candidate.kind,
          score: analysis.analyses[0]?.score || 0,
          stride,
          topFieldCandidates: analysis.analyses[0]?.fieldCandidates || [],
        });
      }

      if (arrayAnalyses.length === 0) {
        continue;
      }

      childAnalyses.push({
        offset: child.offset,
        relationship: child.relationship,
        slotAddress: child.slotAddress,
        targetAddress: child.targetAddress,
        analyses: arrayAnalyses.sort((left, right) => right.score - left.score),
      });
    }

    return {
      available: true,
      charContextAddress: cluster.charContextAddress,
      expectedLevel: getExpectedAgentLevel(options),
      ownerAddress: cluster.primaryOwner.address,
      ownerOffset: cluster.primaryOwner.ownerOffset,
      childAnalyses,
    };
  }

  return Object.freeze({
    describe(options = {}) {
      const resolveCharContext = options && options.resolveCharContext === true;
      return {
        charContextAddress: resolveCharContext ? getCharContextAddress() : null,
        gameplayContextAddress: getGameplayContextAddress(),
      };
    },
    findCharContextOwnerCandidates(options) {
      return findCharContextOwnerCandidates(options);
    },
    findExternalReferences(targetAddress, options) {
      return findExternalReferences(targetAddress, options);
    },
    getCharContextAddress,
    getGameplayContextAddress,
    inspectOwner(address, options) {
      return inspectOwner(address, options);
    },
    inspectCurrentCharContextCluster(options) {
      return inspectCurrentCharContextCluster(options);
    },
    inspectCurrentCharContextLevelAnchors(options) {
      return inspectCurrentCharContextLevelAnchors(options);
    },
    inspectArrayHeaderLevelFields(address, options) {
      return inspectArrayHeaderLevelFields(address, options);
    },
    inspectChildTarget(address, options) {
      return inspectChildTarget(address, options);
    },
    inspectPlayerStrideTarget(address, options) {
      return inspectPlayerStrideTarget(address, options);
    },
    inspectPointerArrayTarget(address, options) {
      return inspectPointerArrayTarget(address, options);
    },
  });
}
