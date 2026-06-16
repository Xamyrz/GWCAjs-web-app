import { PARTY_INTERNAL_CALLS } from "../Evidence/InternalCalls.js";
import { createInternalCallRuntime } from "./InternalCallRuntime.js";

const PARTY_BUTTON_CONTEXT_SIZE = 0x38;
const PARTY_BUTTON_MODE_OFFSET = 0x34;
const PARTY_BUTTON_MODE_LEAVE = 1;
export function createPartyInternals(state) {
  const runtime = createInternalCallRuntime(state, PARTY_INTERNAL_CALLS, {
    defaultMode: "messageFunction",
  });

  return Object.freeze({
    ...runtime,
    setHardMode(enabled) {
      return runtime.call("SetHardMode", [enabled ? 1 : 0]).called === true;
    },
    addHenchman(agentId) {
      return runtime.call("AddHenchman", [agentId]).called === true;
    },
    addHero(heroId) {
      return runtime.call("AddHero", [heroId]).called === true;
    },
    lockPetTarget(agentId, targetAgentId) {
      return runtime.call("LockPetTarget", [agentId, targetAgentId]).called === true;
    },
    kickHenchman(agentId) {
      return runtime.call("KickHenchman", [agentId]).called === true;
    },
    kickAllHeroes() {
      return runtime.call("KickAllHeroes", [0x26]).called === true;
    },
    kickHero(heroId) {
      return runtime.call("KickHero", [heroId]).called === true;
    },
    invitePlayer(playerId) {
      return runtime.call("InvitePlayer", [playerId]).called === true;
    },
    invitePlayerByName(name) {
      if (typeof state?.hook?.withUtf16 !== "function") {
        return false;
      }
      try {
        return state.hook.withUtf16(name, (nameAddress) =>
          runtime.call("InvitePlayerByName", [nameAddress]).called === true
        );
      } catch (error) {
        return false;
      }
    },
    cancelPartyInvite(partyId) {
      return runtime.call("CancelPartyInvite", [partyId]).called === true;
    },
    kickPlayer(playerId) {
      return runtime.call("KickPlayer", [playerId]).called === true;
    },
    searchParty(searchType, advertisement) {
      if (typeof state?.hook?.withUtf16 !== "function") {
        return false;
      }
      try {
        return state.hook.withUtf16(advertisement, (advertisementAddress) =>
          runtime.call("SearchParty", [searchType, advertisementAddress, 0]).called ===
          true
        );
      } catch (error) {
        return false;
      }
    },
    searchPartyCancel() {
      return runtime.call("SearchPartyCancel", []).called === true;
    },
    leaveParty() {
      if (
        typeof state?.hook?.withAllocation !== "function" ||
        typeof state?.hook?.writeU32 !== "function"
      ) {
        return false;
      }
      try {
        return state.hook.withAllocation(
          PARTY_BUTTON_CONTEXT_SIZE,
          (contextAddress) => {
            for (
              let offset = 0;
              offset < PARTY_BUTTON_CONTEXT_SIZE;
              offset += 4
            ) {
              state.hook.writeU32(contextAddress + offset, 0);
            }
            state.hook.writeU32(
              contextAddress + PARTY_BUTTON_MODE_OFFSET,
              PARTY_BUTTON_MODE_LEAVE
            );
            return runtime.call("LeaveParty", [contextAddress, 0]).called === true;
          }
        );
      } catch (error) {
        return false;
      }
    },
    returnToOutpost() {
      return runtime.call("ReturnToOutpost", []).called === true;
    },
    setHeroBehavior(agentId, behavior) {
      return runtime.call("SetHeroBehavior", [agentId, behavior]).called === true;
    },
    tick(enabled) {
      return runtime.call("Tick", [enabled ? 1 : 0]).called === true;
    },
    respondToPartyRequest(partyId, accept) {
      const name = accept
        ? "RespondToPartyRequestAccept"
        : "RespondToPartyRequestDecline";
      return runtime.call(name, [partyId]).called === true;
    },
  });
}
