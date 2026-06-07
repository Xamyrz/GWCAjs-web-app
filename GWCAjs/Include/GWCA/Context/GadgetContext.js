import { getNamedGameContextChildAddress } from "./GameContext.js";

export function getGadgetContextAddress(state) {
  return getNamedGameContextChildAddress(state, "gadget");
}
