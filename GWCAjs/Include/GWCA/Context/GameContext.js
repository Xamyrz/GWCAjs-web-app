import { isValidPointer, readValue } from "../Utilities/Memory.js";

export const GAME_CONTEXT_OFFSETS = Object.freeze({
  account: 0x28,
  agent: 0x08,
  cinematic: 0x30,
  character: 0x44,
  gadget: 0x38,
  guild: 0x3c,
  item: 0x40,
  map: 0x14,
  party: 0x4c,
  textParser: 0x18,
  trade: 0x58,
  world: 0x2c,
});

export const GAME_CONTEXT_CHILDREN = Object.freeze({
  account: Object.freeze({
    offset: GAME_CONTEXT_OFFSETS.account,
    verification: "pointer-only",
  }),
  agent: Object.freeze({
    offset: GAME_CONTEXT_OFFSETS.agent,
    verification: "validated",
  }),
  cinematic: Object.freeze({
    offset: GAME_CONTEXT_OFFSETS.cinematic,
    verification: "validated",
  }),
  character: Object.freeze({
    offset: GAME_CONTEXT_OFFSETS.character,
    verification: "validated",
  }),
  gadget: Object.freeze({
    offset: GAME_CONTEXT_OFFSETS.gadget,
    verification: "pointer-only",
  }),
  guild: Object.freeze({
    offset: GAME_CONTEXT_OFFSETS.guild,
    verification: "live-tested-readonly",
  }),
  item: Object.freeze({
    offset: GAME_CONTEXT_OFFSETS.item,
    verification: "pointer-only",
  }),
  map: Object.freeze({
    offset: GAME_CONTEXT_OFFSETS.map,
    verification: "validated",
  }),
  party: Object.freeze({
    offset: GAME_CONTEXT_OFFSETS.party,
    verification: "static-readonly",
  }),
  textParser: Object.freeze({
    offset: GAME_CONTEXT_OFFSETS.textParser,
    verification: "pointer-only",
  }),
  trade: Object.freeze({
    offset: GAME_CONTEXT_OFFSETS.trade,
    verification: "pointer-only",
  }),
  world: Object.freeze({
    offset: GAME_CONTEXT_OFFSETS.world,
    verification: "validated",
  }),
});

export function getGameContextAddress(state) {
  const anchoredAddress = state.anchors?.gameplayContextAddress || 0;
  if (isValidPointer(state, anchoredAddress)) {
    return anchoredAddress >>> 0;
  }

  const contextSlotAddress = state.anchors?.contextSlotAddress || 0;
  if (!isValidPointer(state, contextSlotAddress)) {
    return 0;
  }
  const seedAddress = readValue(state, "u32", contextSlotAddress);
  return isValidPointer(state, seedAddress) ? seedAddress >>> 0 : 0;
}

export function getGameContextChildAddress(
  state,
  offset,
  fallbackAddress = 0,
  options = {}
) {
  if (!Number.isInteger(offset) || offset < 0 || offset % 4 !== 0) {
    return 0;
  }
  const pointerOptions = {
    alignment: options.alignment ?? 4,
    length: options.minSize ?? 4,
    minAddress: options.minAddress,
  };
  const gameContextAddress = getGameContextAddress(state);
  if (gameContextAddress) {
    const address = readValue(state, "u32", gameContextAddress + offset);
    return isValidPointer(state, address, pointerOptions) ? address >>> 0 : 0;
  }

  return isValidPointer(state, fallbackAddress, pointerOptions)
    ? fallbackAddress >>> 0
    : 0;
}

export function getNamedGameContextChildAddress(
  state,
  childName,
  fallbackAddress = 0,
  options = {}
) {
  const child = GAME_CONTEXT_CHILDREN[childName];
  return child
    ? getGameContextChildAddress(
        state,
        child.offset,
        fallbackAddress,
        options
      )
    : 0;
}

export function getGameContextChildAddresses(state) {
  return {
    account: getNamedGameContextChildAddress(state, "account"),
    agent: getNamedGameContextChildAddress(state, "agent"),
    cinematic: getNamedGameContextChildAddress(state, "cinematic"),
    character: getCharContextAddress(state),
    gadget: getNamedGameContextChildAddress(state, "gadget"),
    gameContextAddress: getGameContextAddress(state),
    guild: getNamedGameContextChildAddress(state, "guild"),
    item: getNamedGameContextChildAddress(state, "item"),
    map: getMapContextAddress(state),
    party: getNamedGameContextChildAddress(state, "party"),
    textParser: getNamedGameContextChildAddress(state, "textParser"),
    trade: getNamedGameContextChildAddress(state, "trade"),
    world: getWorldContextAddress(state),
  };
}

export function getCharContextAddress(state) {
  return getNamedGameContextChildAddress(
    state,
    "character",
    state.anchors?.charContextAddress || 0
  );
}

export function getMapContextAddress(state) {
  return getNamedGameContextChildAddress(
    state,
    "map",
    state.anchors?.mapContextAddress || 0
  );
}

export function getWorldContextAddress(state) {
  return getNamedGameContextChildAddress(
    state,
    "world",
    state.anchors?.worldContextAddress || 0
  );
}
