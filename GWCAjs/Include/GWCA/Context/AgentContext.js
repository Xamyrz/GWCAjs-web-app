import {
  GAME_CONTEXT_OFFSETS,
  getGameContextChildAddress,
} from "./GameContext.js";
import { readValue } from "../Utilities/Memory.js";

export const AGENT_CONTEXT_OFFSETS = Object.freeze({
  instanceTimer: 0x1ac,
});

export function getAgentContextAddress(state) {
  return getGameContextChildAddress(
    state,
    GAME_CONTEXT_OFFSETS.agent
  );
}

export function getInstanceTime(state) {
  const address = getAgentContextAddress(state);
  if (!address) {
    return 0;
  }
  const value = readValue(
    state,
    "u32",
    address + AGENT_CONTEXT_OFFSETS.instanceTimer
  );
  return typeof value === "number" && Number.isFinite(value) ? value >>> 0 : 0;
}
