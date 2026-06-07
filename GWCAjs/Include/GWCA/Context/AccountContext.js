import { getNamedGameContextChildAddress } from "./GameContext.js";

export function getAccountContextAddress(state) {
  return getNamedGameContextChildAddress(state, "account");
}
