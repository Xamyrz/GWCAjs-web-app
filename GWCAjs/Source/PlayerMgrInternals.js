import { PLAYER_INTERNAL_CALLS } from "../Evidence/InternalCalls.js";
import { createInternalCallRuntime } from "./InternalCallRuntime.js";

const ACTION_NOTES = Object.freeze({
  ChangeSecondProfession:
    "The disabled CharCli wrapper is represented by the verified lower-level SendOrderSetProfessionSecondary target.",
  DepositFaction:
    "The disabled CharCli wrapper is represented by the verified lower-level SendOrderGuildAdjustFaction target.",
  RemoveActiveTitle:
    "The disabled CharCli wrapper is represented by the verified lower-level SendSetTitleNone target.",
  SetActiveTitle:
    "The disabled CharCli wrapper is represented by the verified lower-level SendSetTitle target.",
});

export function createPlayerInternals(state) {
  return createInternalCallRuntime(state, PLAYER_INTERNAL_CALLS, {
    actionNames: Object.keys(ACTION_NOTES),
    actionNotes: ACTION_NOTES,
    defaultMode: "messageFunction",
  });
}
