import { getNamedGameContextChildAddress } from "./GameContext.js";

export function getPartyContextAddress(state) {
  return getNamedGameContextChildAddress(state, "party");
}
