import {
  isReasonablePlayerNumber,
} from "../GameEntities/Player.js";
import { readValue } from "../Utilities/Memory.js";

export const CHAR_CONTEXT_OFFSETS = Object.freeze({
  playerNumber: 0x2ac,
});

export function getCharContextPlayerNumber(state) {
  const charContextAddress = state.anchors?.charContextAddress || 0;
  if (!charContextAddress) {
    return 0;
  }
  const playerNumber = readValue(
    state,
    "u32",
    charContextAddress + CHAR_CONTEXT_OFFSETS.playerNumber
  );
  return isReasonablePlayerNumber(playerNumber) ? playerNumber | 0 : 0;
}
