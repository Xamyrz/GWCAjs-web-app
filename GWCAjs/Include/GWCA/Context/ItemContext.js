import { getNamedGameContextChildAddress } from "./GameContext.js";

export function getItemContextAddress(state) {
  return getNamedGameContextChildAddress(state, "item");
}
