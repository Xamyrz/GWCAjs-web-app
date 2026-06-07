import { getNamedGameContextChildAddress } from "./GameContext.js";

export function getTradeContextAddress(state) {
  return getNamedGameContextChildAddress(state, "trade");
}
