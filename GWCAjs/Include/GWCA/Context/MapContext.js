import { readArray } from "../GameContainers/Array.js";
import { isValidPointer, readValue } from "../Utilities/Memory.js";
import {
  getMapContextAddress as getLiveMapContextAddress,
} from "./GameContext.js";

export const MAP_CONTEXT_OFFSETS = Object.freeze({
  sub1: 0x74,
});

const MAP_SUB1_OFFSETS = Object.freeze({
  sub2: 0x00,
});

const MAP_SUB2_OFFSETS = Object.freeze({
  pathingMaps: 0x18,
});

export const PATHING_MAP_SIZE = 0x54;

export function getMapContextAddress(state) {
  return getLiveMapContextAddress(state);
}

export function getPathingMapArray(state) {
  const mapContextAddress = getMapContextAddress(state);
  if (!mapContextAddress) {
    return null;
  }
  const sub1 = readValue(
    state,
    "u32",
    mapContextAddress + MAP_CONTEXT_OFFSETS.sub1
  );
  if (!isValidPointer(state, sub1)) {
    return null;
  }
  const sub2 = readValue(state, "u32", sub1 + MAP_SUB1_OFFSETS.sub2);
  if (!isValidPointer(state, sub2)) {
    return null;
  }
  const array = readArray(
    state,
    sub2 + MAP_SUB2_OFFSETS.pathingMaps,
    PATHING_MAP_SIZE
  );
  return array
    ? {
        ...array,
        mapContextAddress,
        source: "mapContext",
        sub1Address: sub1 >>> 0,
        sub2Address: sub2 >>> 0,
      }
    : null;
}
