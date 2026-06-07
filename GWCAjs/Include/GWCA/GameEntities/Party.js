import { readArray, readPointerArray } from "../GameContainers/Array.js";
import { isValidPointer, readUtf16, readValue } from "../Utilities/Memory.js";

export const PLAYER_PARTY_MEMBER_SIZE = 0x0c;
export const HERO_PARTY_MEMBER_SIZE = 0x18;
export const HENCHMAN_PARTY_MEMBER_SIZE = 0x34;
export const PARTY_INFO_SIZE = 0x84;
export const PARTY_SEARCH_SIZE = 0x94;

export const PLAYER_PARTY_MEMBER_OFFSETS = Object.freeze({
  calledTargetId: 0x04,
  loginNumber: 0x00,
  state: 0x08,
});

export const HERO_PARTY_MEMBER_OFFSETS = Object.freeze({
  agentId: 0x00,
  heroId: 0x08,
  level: 0x14,
  ownerPlayerId: 0x04,
  primary: 0x0c,
  secondary: 0x10,
});

export const HENCHMAN_PARTY_MEMBER_OFFSETS = Object.freeze({
  agentId: 0x00,
  level: 0x30,
  name: 0x04,
  profession: 0x2c,
});

export const PARTY_INFO_OFFSETS = Object.freeze({
  henchmen: 0x14,
  heroes: 0x24,
  inviteLink: 0x7c,
  others: 0x34,
  partyId: 0x00,
  players: 0x04,
});

export const PARTY_SEARCH_OFFSETS = Object.freeze({
  district: 0x0c,
  hardMode: 0x08,
  heroCount: 0x18,
  language: 0x10,
  level: 0x8c,
  message: 0x1c,
  partyLeader: 0x5c,
  partySearchId: 0x00,
  partySearchType: 0x04,
  partySize: 0x14,
  primary: 0x84,
  secondary: 0x88,
  timestamp: 0x90,
});

const MAX_PLAYERS = 64;
const MAX_HEROES = 64;
const MAX_HENCHMEN = 64;
const MAX_OTHERS = 512;

function hasEntityRange(state, address, size) {
  return isValidPointer(state, address, {
    alignment: 4,
    length: size,
  });
}

function readEntityArray(state, address, stride, maxSize, readEntry) {
  const array = readArray(state, address, stride, {
    allowEmpty: true,
    maxCapacity: maxSize,
    maxSize,
  });
  if (!array) {
    return null;
  }
  return {
    ...array,
    entries: Array.from({ length: array.size }, (_, index) =>
      readEntry(state, array.buffer + index * stride, index)
    ),
  };
}

export function readPlayerPartyMember(state, address, index = 0) {
  if (!hasEntityRange(state, address, PLAYER_PARTY_MEMBER_SIZE)) {
    return null;
  }
  const stateFlags = readValue(
    state,
    "u32",
    address + PLAYER_PARTY_MEMBER_OFFSETS.state
  );
  return {
    address: address >>> 0,
    calledTargetId: readValue(
      state,
      "u32",
      address + PLAYER_PARTY_MEMBER_OFFSETS.calledTargetId
    ),
    connected: (stateFlags & 1) !== 0,
    index,
    loginNumber: readValue(
      state,
      "u32",
      address + PLAYER_PARTY_MEMBER_OFFSETS.loginNumber
    ),
    state: stateFlags,
    ticked: (stateFlags & 2) !== 0,
  };
}

export function readHeroPartyMember(state, address, index = 0) {
  if (!hasEntityRange(state, address, HERO_PARTY_MEMBER_SIZE)) {
    return null;
  }
  return {
    address: address >>> 0,
    agentId: readValue(
      state,
      "u32",
      address + HERO_PARTY_MEMBER_OFFSETS.agentId
    ),
    heroId: readValue(state, "u32", address + HERO_PARTY_MEMBER_OFFSETS.heroId),
    index,
    level: readValue(state, "u32", address + HERO_PARTY_MEMBER_OFFSETS.level),
    ownerPlayerId: readValue(
      state,
      "u32",
      address + HERO_PARTY_MEMBER_OFFSETS.ownerPlayerId
    ),
    primary: readValue(
      state,
      "u32",
      address + HERO_PARTY_MEMBER_OFFSETS.primary
    ),
    secondary: readValue(
      state,
      "u32",
      address + HERO_PARTY_MEMBER_OFFSETS.secondary
    ),
  };
}

export function readHenchmanPartyMember(state, address, index = 0) {
  if (!hasEntityRange(state, address, HENCHMAN_PARTY_MEMBER_SIZE)) {
    return null;
  }
  return {
    address: address >>> 0,
    agentId: readValue(
      state,
      "u32",
      address + HENCHMAN_PARTY_MEMBER_OFFSETS.agentId
    ),
    index,
    level: readValue(
      state,
      "u32",
      address + HENCHMAN_PARTY_MEMBER_OFFSETS.level
    ),
    name: readUtf16(state, address + HENCHMAN_PARTY_MEMBER_OFFSETS.name, 20),
    profession: readValue(
      state,
      "u32",
      address + HENCHMAN_PARTY_MEMBER_OFFSETS.profession
    ),
  };
}

function readU32Entry(state, address, index = 0) {
  if (!hasEntityRange(state, address, 4)) {
    return null;
  }
  return {
    address: address >>> 0,
    index,
    value: readValue(state, "u32", address),
  };
}

export function readPartyInfo(state, address) {
  if (!hasEntityRange(state, address, PARTY_INFO_SIZE)) {
    return null;
  }
  const players = readEntityArray(
    state,
    address + PARTY_INFO_OFFSETS.players,
    PLAYER_PARTY_MEMBER_SIZE,
    MAX_PLAYERS,
    readPlayerPartyMember
  );
  const henchmen = readEntityArray(
    state,
    address + PARTY_INFO_OFFSETS.henchmen,
    HENCHMAN_PARTY_MEMBER_SIZE,
    MAX_HENCHMEN,
    readHenchmanPartyMember
  );
  const heroes = readEntityArray(
    state,
    address + PARTY_INFO_OFFSETS.heroes,
    HERO_PARTY_MEMBER_SIZE,
    MAX_HEROES,
    readHeroPartyMember
  );
  const others = readEntityArray(
    state,
    address + PARTY_INFO_OFFSETS.others,
    4,
    MAX_OTHERS,
    readU32Entry
  );
  if (
    !players ||
    !henchmen ||
    !heroes ||
    !others ||
    players.entries.some((entry) => !entry) ||
    henchmen.entries.some((entry) => !entry) ||
    heroes.entries.some((entry) => !entry) ||
    others.entries.some((entry) => !entry)
  ) {
    return null;
  }
  return {
    address: address >>> 0,
    henchmen,
    heroes,
    others,
    partyId: readValue(state, "u32", address + PARTY_INFO_OFFSETS.partyId),
    partySize: players.size + henchmen.size + heroes.size,
    players,
  };
}

export function readPartySearch(state, address, index = 0) {
  if (!hasEntityRange(state, address, PARTY_SEARCH_SIZE)) {
    return null;
  }
  return {
    address: address >>> 0,
    district: readValue(state, "u32", address + PARTY_SEARCH_OFFSETS.district),
    hardMode:
      readValue(state, "u32", address + PARTY_SEARCH_OFFSETS.hardMode) !== 0,
    heroCount: readValue(
      state,
      "u32",
      address + PARTY_SEARCH_OFFSETS.heroCount
    ),
    index,
    language: readValue(state, "u32", address + PARTY_SEARCH_OFFSETS.language),
    level: readValue(state, "u32", address + PARTY_SEARCH_OFFSETS.level),
    message: readUtf16(state, address + PARTY_SEARCH_OFFSETS.message, 32),
    partyLeader: readUtf16(
      state,
      address + PARTY_SEARCH_OFFSETS.partyLeader,
      20
    ),
    partySearchId: readValue(
      state,
      "u32",
      address + PARTY_SEARCH_OFFSETS.partySearchId
    ),
    partySearchType: readValue(
      state,
      "u32",
      address + PARTY_SEARCH_OFFSETS.partySearchType
    ),
    partySize: readValue(state, "u32", address + PARTY_SEARCH_OFFSETS.partySize),
    primary: readValue(state, "u32", address + PARTY_SEARCH_OFFSETS.primary),
    secondary: readValue(
      state,
      "u32",
      address + PARTY_SEARCH_OFFSETS.secondary
    ),
    timestamp: readValue(
      state,
      "u32",
      address + PARTY_SEARCH_OFFSETS.timestamp
    ),
  };
}

export function readPartySearchArray(state, address, options = {}) {
  const array = readPointerArray(state, address, {
    allowEmpty: true,
    allowNull: true,
    maxCapacity: options.maxCapacity ?? 4096,
    maxSize: options.maxSize ?? 4096,
    pointerOptions: {
      alignment: 4,
      length: PARTY_SEARCH_SIZE,
    },
  });
  if (!array) {
    return null;
  }
  return {
    ...array,
    entries: array.pointers.map((pointer, index) =>
      pointer ? readPartySearch(state, pointer, index) : null
    ),
  };
}
