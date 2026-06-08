import {
  inspectPartyContext,
  readPartyContext,
} from "../Include/GWCA/Context/PartyContext.js";
import { createPartyInternals } from "./PartyMgrInternals.js";
import { createTextDecoder } from "./TextDecoder.js";
import { createModule } from "./stdafx.js";
import {
  getPlayerControlledCharacter,
  getWorldHeroFlagArray,
  getWorldHeroInfoArray,
  getWorldIsHardModeUnlocked,
  getWorldPartyAttributeArray,
  getWorldPetArray,
} from "../Include/GWCA/Context/WorldContext.js";
import { HERO_BEHAVIOR } from "../Include/GWCA/GameEntities/Hero.js";

const UNSUPPORTED_ACTIONS = Object.freeze({
  FlagAll: "Hero flagging packet path has not been verified in JSPI.",
  FlagHero: "Hero flagging packet path has not been verified in JSPI.",
  FlagHeroAgent: "Hero flagging packet path has not been verified in JSPI.",
  SearchPartyReply:
    "Party-search reply packet path has not been verified in JSPI.",
  UnflagAll: "Hero flagging packet path has not been verified in JSPI.",
  UnflagHero: "Hero flagging packet path has not been verified in JSPI.",
});

const HERO_BEHAVIOR_BY_NAME = Object.freeze({
  avoid: HERO_BEHAVIOR.AvoidCombat,
  avoidcombat: HERO_BEHAVIOR.AvoidCombat,
  fight: HERO_BEHAVIOR.Fight,
  guard: HERO_BEHAVIOR.Guard,
});

const HERO_BEHAVIOR_VALUES = new Set(Object.values(HERO_BEHAVIOR));

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
  const textDecoder = createTextDecoder(state);

  function getContext() {
    return readPartyContext(state);
  }

  function getActionStatus(name) {
    if (name === "RespondToPartyRequest") {
      const accept = internals.getActionStatus(
        "RespondToPartyRequestAccept"
      );
      const decline = internals.getActionStatus(
        "RespondToPartyRequestDecline"
      );
      return {
        available: accept.available && decline.available,
        accept,
        decline,
        mode:
          accept.available && decline.available
            ? "messageFunction"
            : "unavailable",
        reason:
          accept.available && decline.available
            ? "Accept and decline exports are patched into the runtime."
            : "One or both party-request exports are unavailable.",
      };
    }
    if (name === "SetPetBehavior") {
      const behavior = internals.getActionStatus("SetHeroBehavior");
      const lockTarget = internals.getActionStatus("LockPetTarget");
      return {
        available: behavior.available && lockTarget.available,
        behavior,
        lockTarget,
        mode:
          behavior.available && lockTarget.available
            ? "messageFunction"
            : "unavailable",
        reason:
          behavior.available && lockTarget.available
            ? "Behavior and target-lock exports are patched into the runtime."
            : "One or both pet behavior exports are unavailable.",
      };
    }
    return internals.getInternalFunction(name)
      ? internals.getActionStatus(name)
      : getUnsupportedActionStatus(name);
  }

  function findInviteByLeaderName(list, name) {
    const normalizedName = String(name || "").trim().toLowerCase();
    if (!normalizedName) {
      return null;
    }
    return (
      list?.entries?.find(
        (entry) =>
          entry &&
          typeof entry.leaderName === "string" &&
          entry.leaderName.trim().toLowerCase() === normalizedName
      ) || null
    );
  }

  function findInviteByIdOrIndex(list, value) {
    const normalized = Number(value);
    if (!Number.isInteger(normalized) || normalized < 0) {
      return null;
    }
    const entries = list?.entries?.filter(Boolean) || [];
    const byPartyId =
      entries.find((entry) => entry.partyId === normalized) || null;
    if (byPartyId) {
      return byPartyId;
    }
    const byIndex =
      entries.find((entry) => entry.index === normalized) || null;
    if (byIndex) {
      return byIndex;
    }
    if (normalized > 0 && entries.length === 1) {
      return entries[0];
    }
    return (
      entries.find((entry) =>
        entry.players?.entries?.some(
          (player) => player?.loginNumber === normalized
        )
      ) || null
    );
  }

  function getAllActionStatuses() {
    return {
      ...getActionStatuses(),
      ...internals.getActionStatuses(),
      RespondToPartyRequest: getActionStatus("RespondToPartyRequest"),
      SetPetBehavior: getActionStatus("SetPetBehavior"),
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

  function getHeroFlagByAgentId(agentId) {
    const normalizedAgentId = Number(agentId);
    if (!Number.isInteger(normalizedAgentId) || normalizedAgentId <= 0) {
      return null;
    }
    return (
      getWorldHeroFlagArray(state)?.entries.find(
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

  function getPetInfo(ownerAgentId = 0) {
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
  }

  function unsupported() {
    return false;
  }

  function getCurrentTargetAgentId() {
    const directTargetId = state?.agent?.api?.GetTargetId?.();
    if (Number.isInteger(directTargetId) && directTargetId > 0) {
      return directTargetId;
    }
    const target = state?.agent?.api?.GetTarget?.();
    return Number.isInteger(target?.agentId) && target.agentId > 0
      ? target.agentId
      : 0;
  }

  function normalizePositiveInteger(value) {
    const normalized = Number(value);
    return Number.isInteger(normalized) && normalized > 0
      ? normalized
      : 0;
  }

  function normalizeHeroBehavior(value) {
    if (typeof value === "string") {
      const key = value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
      return Object.hasOwn(HERO_BEHAVIOR_BY_NAME, key)
        ? HERO_BEHAVIOR_BY_NAME[key]
        : null;
    }
    const normalized = Number(value);
    return Number.isInteger(normalized) && HERO_BEHAVIOR_VALUES.has(normalized)
      ? normalized
      : null;
  }

  function tick(flag = true) {
    const party = getPartyInfo();
    if (!party) {
      return false;
    }
    const shouldTick = !!flag;
    if ((getPlayerMember()?.ticked || false) === shouldTick) {
      return true;
    }
    return internals.tick(shouldTick);
  }

  return Object.freeze({
    AddHenchman(agentId) {
      const normalizedAgentId = normalizePositiveInteger(agentId);
      return normalizedAgentId
        ? internals.addHenchman(normalizedAgentId)
        : false;
    },
    AddHero(heroId) {
      const normalizedHeroId = normalizePositiveInteger(heroId);
      return normalizedHeroId && normalizedHeroId < 0x28
        ? internals.addHero(normalizedHeroId)
        : false;
    },
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
    DecodeHeroNameByIndex(heroIndex = 1) {
      const hero = getHeroPartyMember(heroIndex);
      return hero
        ? textDecoder.decodeHeroAgentName(hero.agentId)
        : Promise.resolve(null);
    },
    DecodePetName(ownerAgentId = 0) {
      const pet = getPetInfo(ownerAgentId);
      return pet
        ? textDecoder.decodeAddress(pet.nameAddress)
        : Promise.resolve(null);
    },
    GetTextDecoderStatus: textDecoder.getStatus,
    FlagAll: unsupported,
    FlagHero: unsupported,
    FlagHeroAgent: unsupported,
    HeroBehavior: HERO_BEHAVIOR,
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
    GetPartyRequests() {
      return getContext()?.requests || null;
    },
    GetPartyPlayerCount() {
      return getPartyInfo()?.players.size || 0;
    },
    GetPartySearch: getPartySearch,
    GetPartySearchArray() {
      return getContext()?.partySearch || null;
    },
    GetPendingPartyRequests() {
      return getContext()?.requests?.entries || [];
    },
    GetPartySize() {
      return getPartyInfo()?.partySize || 0;
    },
    GetSendingPartyRequests() {
      return getContext()?.sending || null;
    },
    GetPetInfo: getPetInfo,
    GetUnsupportedAction: getActionStatus,
    InvitePlayer(player) {
      if (typeof player === "string") {
        const name = player.trim();
        return name && name.length < 20
          ? internals.invitePlayerByName(name)
          : false;
      }
      const normalizedPlayerId = normalizePositiveInteger(player);
      return normalizedPlayerId
        ? internals.invitePlayer(normalizedPlayerId)
        : false;
    },
    KickAllHeroes() {
      return internals.kickAllHeroes();
    },
    KickHenchman(agentId) {
      const normalizedAgentId = normalizePositiveInteger(agentId);
      return normalizedAgentId
        ? internals.kickHenchman(normalizedAgentId)
        : false;
    },
    KickHero(heroId) {
      const normalizedHeroId = normalizePositiveInteger(heroId);
      return normalizedHeroId && normalizedHeroId < 0x29
        ? internals.kickHero(normalizedHeroId)
        : false;
    },
    KickPlayer(playerId) {
      const normalizedPlayerId = normalizePositiveInteger(playerId);
      return normalizedPlayerId
        ? internals.kickPlayer(normalizedPlayerId)
        : false;
    },
    CancelPartyInvite(partyId) {
      if (typeof partyId === "string") {
        const request = findInviteByLeaderName(getContext()?.sending, partyId);
        return request
          ? internals.cancelPartyInvite(request.partyId)
          : false;
      }
      const request = findInviteByIdOrIndex(getContext()?.sending, partyId);
      return request ? internals.cancelPartyInvite(request.partyId) : false;
    },
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
    RespondToPartyRequest(partyId, accept = true) {
      if (typeof partyId === "string") {
        const request = findInviteByLeaderName(getContext()?.requests, partyId);
        return request
          ? internals.respondToPartyRequest(request.partyId, !!accept)
          : false;
      }
      const normalizedPartyId = normalizePositiveInteger(partyId);
      return normalizedPartyId
        ? internals.respondToPartyRequest(normalizedPartyId, !!accept)
        : false;
    },
    ReturnToOutpost() {
      const context = getContext();
      return context?.isDefeated ? internals.returnToOutpost() : false;
    },
    SearchParty(searchType, advertisement = "") {
      const normalizedSearchType = Number(searchType);
      if (
        !Number.isInteger(normalizedSearchType) ||
        normalizedSearchType < 0
      ) {
        return false;
      }
      const text = String(advertisement || "");
      return text.length < 32
        ? internals.searchParty(normalizedSearchType, text)
        : false;
    },
    SearchPartyCancel() {
      return internals.searchPartyCancel();
    },
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
    SetHeroBehavior(agentId, behavior) {
      const normalizedAgentId = normalizePositiveInteger(agentId);
      const normalizedBehavior = normalizeHeroBehavior(behavior);
      if (!normalizedAgentId || normalizedBehavior === null) {
        return false;
      }
      const heroFlag = getHeroFlagByAgentId(normalizedAgentId);
      if (!heroFlag) {
        return false;
      }
      if (heroFlag.behavior === normalizedBehavior) {
        return true;
      }
      return internals.setHeroBehavior(normalizedAgentId, normalizedBehavior);
    },
    SetPetBehavior(behavior, lockTargetId = 0) {
      const normalizedBehavior = normalizeHeroBehavior(behavior);
      if (normalizedBehavior === null) {
        return false;
      }
      const pet = getPetInfo();
      if (!pet?.agentId) {
        return false;
      }
      const targetAgentId =
        normalizedBehavior === HERO_BEHAVIOR.Fight
          ? normalizePositiveInteger(lockTargetId) || getCurrentTargetAgentId()
          : 0;
      if (normalizedBehavior === HERO_BEHAVIOR.Fight && !targetAgentId) {
        return false;
      }
      if (
        pet.lockedTargetId === targetAgentId &&
        pet.behavior === normalizedBehavior
      ) {
        return true;
      }
      if (
        pet.lockedTargetId !== targetAgentId &&
        !internals.lockPetTarget(pet.agentId, targetAgentId)
      ) {
        return false;
      }
      if (
        pet.behavior !== normalizedBehavior &&
        !internals.setHeroBehavior(pet.agentId, normalizedBehavior)
      ) {
        return false;
      }
      return true;
    },
    SetTickToggle() {
      return tick(!getPlayerMember()?.ticked);
    },
    Tick: tick,
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
