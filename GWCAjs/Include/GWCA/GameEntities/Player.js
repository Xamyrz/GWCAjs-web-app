import {
  isValidPointer,
  readUtf16,
  readValue,
} from "../Utilities/Memory.js";

export const PLAYER_SIZE = 0x50;

export const PLAYER_OFFSETS = Object.freeze({
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

export function isReasonablePlayerNumber(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value < 0x10000
  );
}

export function isReasonableAgentId(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value < 0x10000000
  );
}

function isReasonableProfession(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 10
  );
}

function isReasonablePartySize(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 12
  );
}

export function readPlayer(state, address, options = {}) {
  const includeName = options.includeName !== false;
  const namePtr = readValue(state, "u32", address + PLAYER_OFFSETS.namePtr);
  return {
    address,
    activeTitleTier: readValue(
      state,
      "u32",
      address + PLAYER_OFFSETS.activeTitleTier
    ),
    agentId: readValue(state, "u32", address + PLAYER_OFFSETS.agentId),
    appearanceBitmap: readValue(
      state,
      "u32",
      address + PLAYER_OFFSETS.appearanceBitmap
    ),
    flags: readValue(state, "u32", address + PLAYER_OFFSETS.flags),
    name: includeName && namePtr ? readUtf16(state, namePtr, 24) : "",
    nameEncPtr: readValue(state, "u32", address + PLAYER_OFFSETS.nameEncPtr),
    namePtr,
    partyLeaderPlayerNumber: readValue(
      state,
      "u32",
      address + PLAYER_OFFSETS.partyLeaderPlayerNumber
    ),
    partySize: readValue(state, "u32", address + PLAYER_OFFSETS.partySize),
    playerNumber: readValue(state, "u32", address + PLAYER_OFFSETS.playerNumber),
    primary: readValue(state, "u32", address + PLAYER_OFFSETS.primary),
    reforgedFlags: readValue(
      state,
      "u32",
      address + PLAYER_OFFSETS.reforgedFlags
    ),
    secondary: readValue(state, "u32", address + PLAYER_OFFSETS.secondary),
  };
}

export function isPlausiblePlayer(state, candidate) {
  if (
    !candidate ||
    !candidate.address ||
    !isValidPointer(state, candidate.address)
  ) {
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
  if (candidate.namePtr && !isValidPointer(state, candidate.namePtr)) {
    return false;
  }
  if (candidate.nameEncPtr && !isValidPointer(state, candidate.nameEncPtr)) {
    return false;
  }
  return true;
}
