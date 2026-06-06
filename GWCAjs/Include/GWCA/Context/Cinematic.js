import {
  GAME_CONTEXT_OFFSETS,
  getGameContextChildAddress,
} from "./GameContext.js";
import { readValue } from "../Utilities/Memory.js";

export function getCinematicContextAddress(state) {
  return getGameContextChildAddress(
    state,
    GAME_CONTEXT_OFFSETS.cinematic
  );
}

export function getIsInCinematic(state) {
  const address = getCinematicContextAddress(state);
  if (!address) {
    return false;
  }
  return (readValue(state, "u32", address + 4) || 0) !== 0;
}
