import {
  inspectPartyContext,
  readPartyContext,
} from "../Include/GWCA/Context/PartyContext.js";
import { createPartyInternals } from "./PartyMgrInternals.js";
import { createModule } from "./stdafx.js";
import {
  getPlayerControlledCharacter,
  getWorldHeroInfoArray,
  getWorldIsHardModeUnlocked,
  getWorldPartyAttributeArray,
  getWorldPetArray,
} from "../Include/GWCA/Context/WorldContext.js";

const UNSUPPORTED_ACTIONS = Object.freeze({
  AddHenchman: "Party action packet path has not been verified in JSPI.",
  AddHero: "Party action packet path has not been verified in JSPI.",
  FlagAll: "Hero flagging packet path has not been verified in JSPI.",
  FlagHero: "Hero flagging packet path has not been verified in JSPI.",
  FlagHeroAgent: "Hero flagging packet path has not been verified in JSPI.",
  InvitePlayer: "Party invitation packet path has not been verified in JSPI.",
  KickAllHeroes: "Party action packet path has not been verified in JSPI.",
  KickHenchman: "Party action packet path has not been verified in JSPI.",
  KickHero: "Party action packet path has not been verified in JSPI.",
  KickPlayer: "Party kick packet path has not been verified in JSPI.",
  RespondToPartyRequest:
    "Party request accept/decline packet path has not been verified in JSPI.",
  ReturnToOutpost:
    "Return-to-outpost UI/button path has not been verified in JSPI.",
  SearchParty: "Party-search packet path has not been verified in JSPI.",
  SearchPartyCancel:
    "Party-search cancel packet path has not been verified in JSPI.",
  SearchPartyReply:
    "Party-search reply packet path has not been verified in JSPI.",
  SetHeroBehavior:
    "Hero-behavior packet path has not been verified in JSPI.",
  SetPetBehavior:
    "Pet-behavior packet path has not been verified in JSPI.",
  UnflagAll: "Hero flagging packet path has not been verified in JSPI.",
  UnflagHero: "Hero flagging packet path has not been verified in JSPI.",
});

function getUnsupportedActionStatus(name) {
  const reason = UNSUPPORTED_ACTIONS[name];
  return {
    available: false,
    mode: "unavailable",
    reason: reason || "Unknown party action.",
  };
}

function getActionStatuses() {
  return Object.fromEntries(
    Object.keys(UNSUPPORTED_ACTIONS).map((name) => [
      name,
      getUnsupportedActionStatus(name),
    ])
  );
}

function getPlayerNumber(state) {
  const value = state.player?.api?.GetPlayerNumber?.();
  return Number.isInteger(value) ? value : 0;
}

export function createPartyApi(state) {
  const internals = createPartyInternals(state);

  function getContext() {
    return readPartyContext(state);
  }

  function getActionStatus(name) {
    return internals.getInternalFunction(name)
      ? internals.getActionStatus(name)
      : getUnsupportedActionStatus(name);
  }

  function getAllActionStatuses() {
    return {
      ...getActionStatuses(),
      ...internals.getActionStatuses(),
    };
  }

  function getPartyInfo(partyId = 0) {
    const context = getContext();
    if (!context) {
      return null;
    }
    const normalizedPartyId = Number(partyId);
    if (!Number.isInteger(normalizedPartyId) || normalizedPartyId < 0) {
      return null;
    }
    if (normalizedPartyId === 0) {
      return context.playerParty;
    }
    return normalizedPartyId < context.parties.entries.length
      ? context.parties.entries[normalizedPartyId]
      : null;
  }

  function getPartySearch(partySearchId = 0) {
    const context = getContext();
    if (!context) {
      return null;
    }
    const normalizedPartySearchId = Number(partySearchId);
    if (
      !Number.isInteger(normalizedPartySearchId) ||
      normalizedPartySearchId < 0
    ) {
      return null;
    }
    return (
      context.partySearch.entries.find(
        (entry) =>
          entry && entry.partySearchId === normalizedPartySearchId
      ) || null
    );
  }

  function getPlayerMember(playerIndex = -1) {
    const party = getPartyInfo();
    if (!party) {
      return null;
    }
    const normalizedPlayerIndex = Number(playerIndex);
    if (normalizedPlayerIndex === -1) {
      const currentPlayerNumber = getPlayerNumber(state);
      return (
        party.players.entries.find(
          (entry) => entry.loginNumber === currentPlayerNumber
        ) || null
      );
    }
    return Number.isInteger(normalizedPlayerIndex) &&
      normalizedPlayerIndex >= 0 &&
      normalizedPlayerIndex < party.players.entries.length
      ? party.players.entries[normalizedPlayerIndex]
      : null;
  }

  function getHeroMemberByAgentId(agentId) {
    const normalizedAgentId = Number(agentId);
    if (!Number.isInteger(normalizedAgentId) || normalizedAgentId <= 0) {
      return null;
    }
    return (
      getPartyInfo()?.heroes.entries.find(
        (entry) => entry.agentId === normalizedAgentId
      ) || null
    );
  }

  function getHeroPartyMember(heroIndex = 1) {
    const normalizedHeroIndex = Number(heroIndex);
    const heroes = getPartyInfo()?.heroes.entries;
    return heroes &&
      Number.isInteger(normalizedHeroIndex) &&
      normalizedHeroIndex > 0 &&
      normalizedHeroIndex <= heroes.length
      ? heroes[normalizedHeroIndex - 1]
      : null;
  }

  function unsupported() {
    return false;
  }

  return Object.freeze({
    AddHenchman: unsupported,
    AddHero: unsupported,
    Describe() {
      return {
        actionStatuses: getAllActionStatuses(),
        context: inspectPartyContext(state),
        internalFunctions: internals.getInternalFunctions(),
        verification: {
          build: 38615,
          level: "live-tested-readonly",
          source:
            "Current JSPI PartyClient context constructor and getter decompilation.",
        },
      };
    },
    FlagAll: unsupported,
    FlagHero: unsupported,
    FlagHeroAgent: unsupported,
    GetActionStatus: getActionStatus,
    GetActionStatuses: getAllActionStatuses,
    GetAgentAttributes(agentId) {
      const normalizedAgentId = Number(agentId);
      if (!Number.isInteger(normalizedAgentId) || normalizedAgentId <= 0) {
        return null;
      }
      return (
        getWorldPartyAttributeArray(state)?.entries.find(
          (entry) => entry.agentId === normalizedAgentId
        ) || null
      );
    },
    GetAgentHeroID(agentId) {
      const hero = getHeroMemberByAgentId(agentId);
      return hero ? hero.index + 1 : 0;
    },
    GetHeroAgentID(heroIndex) {
      const normalizedHeroIndex = Number(heroIndex);
      if (normalizedHeroIndex === 0) {
        return getPlayerControlledCharacter(state)?.agentId || 0;
      }
      return getHeroPartyMember(normalizedHeroIndex)?.agentId || 0;
    },
    GetHeroInfo(heroId) {
      const normalizedHeroId = Number(heroId);
      if (!Number.isInteger(normalizedHeroId) || normalizedHeroId <= 0) {
        return null;
      }
      return (
        getWorldHeroInfoArray(state)?.entries.find(
          (entry) => entry.heroId === normalizedHeroId
        ) || null
      );
    },
    GetHeroInfoByIndex(heroIndex = 1) {
      const hero = getHeroPartyMember(heroIndex);
      if (!hero) {
        return null;
      }
      return (
        getWorldHeroInfoArray(state)?.entries.find(
          (entry) => entry.heroId === hero.heroId
        ) || null
      );
    },
    GetHeroPartyMember: getHeroPartyMember,
    GetIsHardModeUnlocked() {
      return getWorldIsHardModeUnlocked(state);
    },
    GetIsLeader() {
      return getContext()?.isLeader || false;
    },
    GetIsPartyDefeated() {
      return getContext()?.isDefeated || false;
    },
    GetIsPartyInHardMode() {
      return getContext()?.isHardMode || false;
    },
    GetIsPartyLoaded() {
      const party = getPartyInfo();
      return party
        ? party.players.entries.every((entry) => entry.connected)
        : false;
    },
    GetIsPartyTicked() {
      const party = getPartyInfo();
      return party
        ? party.players.entries.every((entry) => entry.ticked)
        : false;
    },
    GetIsPlayerLoaded(playerIndex = -1) {
      return getPlayerMember(playerIndex)?.connected || false;
    },
    GetIsPlayerTicked(playerIndex = -1) {
      return getPlayerMember(playerIndex)?.ticked || false;
    },
    GetPartyContext: getContext,
    GetPartyHenchmanCount() {
      return getPartyInfo()?.henchmen.size || 0;
    },
    GetPartyHeroCount() {
      return getPartyInfo()?.heroes.size || 0;
    },
    GetPartyInfo: getPartyInfo,
    GetPartyPlayerCount() {
      return getPartyInfo()?.players.size || 0;
    },
    GetPartySearch: getPartySearch,
    GetPartySearchArray() {
      return getContext()?.partySearch || null;
    },
    GetPartySize() {
      return getPartyInfo()?.partySize || 0;
    },
    GetPetInfo(ownerAgentId = 0) {
      const normalizedOwnerAgentId = Number(ownerAgentId);
      const effectiveOwnerAgentId =
        Number.isInteger(normalizedOwnerAgentId) && normalizedOwnerAgentId > 0
          ? normalizedOwnerAgentId
          : getPlayerControlledCharacter(state)?.agentId || 0;
      if (!effectiveOwnerAgentId) {
        return null;
      }
      return (
        getWorldPetArray(state)?.entries.find(
          (entry) => entry.ownerAgentId === effectiveOwnerAgentId
        ) || null
      );
    },
    GetUnsupportedAction: getActionStatus,
    InvitePlayer: unsupported,
    KickAllHeroes: unsupported,
    KickHenchman: unsupported,
    KickHero: unsupported,
    KickPlayer: unsupported,
    LeaveParty() {
      const party = getPartyInfo();
      if (!party) {
        return false;
      }
      if (party.partySize <= 1) {
        return true;
      }
      return internals.leaveParty();
    },
    RespondToPartyRequest: unsupported,
    ReturnToOutpost: unsupported,
    SearchParty: unsupported,
    SearchPartyCancel: unsupported,
    SearchPartyReply: unsupported,
    SetHardMode(enabled = true) {
      const context = getContext();
      if (!context?.playerParty) {
        return false;
      }
      const shouldEnable = !!enabled;
      if (context.isHardMode === shouldEnable) {
        return true;
      }
      return internals.setHardMode(shouldEnable);
    },
    SetHeroBehavior: unsupported,
    SetPetBehavior: unsupported,
    SetTickToggle() {
      return false;
    },
    Tick(flag = true) {
      const party = getPartyInfo();
      if (!party) {
        return false;
      }
      const shouldTick = !!flag;
      if ((getPlayerMember()?.ticked || false) === shouldTick) {
        return true;
      }
      return internals.tick(shouldTick);
    },
    UnflagAll: unsupported,
    UnflagHero: unsupported,
  });
}

export const PartyModule = createModule(
  "PartyMgr",
  async function initModule(state) {
    if (!state.context?.api) {
      throw new Error("Context must be initialized before PartyMgr");
    }
    state.party = Object.freeze({
      api: createPartyApi(state),
    });
    const inspection = inspectPartyContext(state);
    return {
      address: inspection.address || null,
      reason: inspection.reason,
      valid: inspection.valid,
      verification: "build-38615-static-readonly",
    };
  }
);
