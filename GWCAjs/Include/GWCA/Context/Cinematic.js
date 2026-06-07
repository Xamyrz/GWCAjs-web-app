import {
  getNamedGameContextChildAddress,
} from "./GameContext.js";
import { readValue } from "../Utilities/Memory.js";

export function getCinematicContextAddress(state) {
  return getNamedGameContextChildAddress(state, "cinematic");
}

export function getIsInCinematic(state) {
  const address = getCinematicContextAddress(state);
  if (!address) {
    return false;
  }
  return (readValue(state, "u32", address + 4) || 0) !== 0;
}
