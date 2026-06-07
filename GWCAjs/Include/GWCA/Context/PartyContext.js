import { getNamedGameContextChildAddress } from "./GameContext.js";
import { readPointerArray } from "../GameContainers/Array.js";
import {
  PARTY_INFO_SIZE,
  readPartyInfo,
  readPartySearchArray,
} from "../GameEntities/Party.js";
import { isValidPointer, readValue } from "../Utilities/Memory.js";

export const PARTY_CONTEXT_SIZE = 0xd0;

export const PARTY_CONTEXT_OFFSETS = Object.freeze({
  flag: 0x14,
  parties: 0x40,
  partySearch: 0xc0,
  playerParty: 0x54,
  searchClientId: 0x9c,
});

const PARTY_FLAGS = Object.freeze({
  defeated: 0x20,
  hardMode: 0x10,
  leader: 0x80,
});

function invalidInspection(address, reason, details = {}) {
  return {
    address: address >>> 0,
    reason,
    valid: false,
    ...details,
  };
}

export function getPartyContextAddress(state) {
  return getNamedGameContextChildAddress(state, "party", 0, {
    minSize: PARTY_CONTEXT_SIZE,
  });
}

function readPartyPointerArray(state, address) {
  const array = readPointerArray(state, address, {
    allowEmpty: true,
    allowNull: true,
    maxCapacity: 4096,
    maxSize: 4096,
    pointerOptions: {
      alignment: 4,
      length: PARTY_INFO_SIZE,
    },
  });
  if (!array) {
    return null;
  }
  return {
    ...array,
    entries: array.pointers.map((pointer) =>
      pointer ? readPartyInfo(state, pointer) : null
    ),
  };
}

export function inspectPartyContext(state) {
  const address = getPartyContextAddress(state);
  if (!address) {
    return invalidInspection(0, "PartyContext pointer is unavailable.");
  }
  if (
    !isValidPointer(state, address, {
      alignment: 4,
      length: PARTY_CONTEXT_SIZE,
    })
  ) {
    return invalidInspection(
      address,
      "PartyContext does not fit in linear memory."
    );
  }

  const parties = readPartyPointerArray(
    state,
    address + PARTY_CONTEXT_OFFSETS.parties
  );
  if (!parties) {
    return invalidInspection(address, "Party array is invalid.");
  }
  if (parties.entries.some((entry, index) => parties.pointers[index] && !entry)) {
    return invalidInspection(address, "Party array contains an invalid party.");
  }

  const playerPartyPointer = readValue(
    state,
    "u32",
    address + PARTY_CONTEXT_OFFSETS.playerParty
  );
  const playerParty = playerPartyPointer
    ? readPartyInfo(state, playerPartyPointer)
    : null;
  if (playerPartyPointer && !playerParty) {
    return invalidInspection(address, "Player party pointer is invalid.", {
      playerPartyPointer,
    });
  }

  const partySearch = readPartySearchArray(
    state,
    address + PARTY_CONTEXT_OFFSETS.partySearch
  );
  if (
    !partySearch ||
    partySearch.entries.some((entry, index) => partySearch.pointers[index] && !entry)
  ) {
    return invalidInspection(address, "Party-search array is invalid.");
  }

  const flag = readValue(state, "u32", address + PARTY_CONTEXT_OFFSETS.flag) || 0;
  return {
    address: address >>> 0,
    flag,
    isDefeated: (flag & PARTY_FLAGS.defeated) !== 0,
    isHardMode: (flag & PARTY_FLAGS.hardMode) !== 0,
    isLeader: (flag & PARTY_FLAGS.leader) !== 0,
    parties,
    partySearch,
    playerParty,
    playerPartyPointer: playerPartyPointer >>> 0,
    searchClientId:
      readValue(state, "u32", address + PARTY_CONTEXT_OFFSETS.searchClientId) ||
      0,
    valid: true,
  };
}

export function readPartyContext(state) {
  const inspection = inspectPartyContext(state);
  return inspection.valid ? inspection : null;
}
