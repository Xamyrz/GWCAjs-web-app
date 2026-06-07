import { getNamedGameContextChildAddress } from "./GameContext.js";

export function getTextParserAddress(state) {
  return getNamedGameContextChildAddress(state, "textParser");
}
