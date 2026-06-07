import {
  inspectGuildContext,
  readGuildContext,
} from "../Include/GWCA/Context/GuildContext.js";
import { RegionType } from "../Include/GWCA/GameEntities/Map.js";
import { createGuildInternals } from "./GuildMgrInternals.js";
import { createModule } from "./stdafx.js";

export function createGuildApi(state) {
  const internals = createGuildInternals(state);

  function getContext() {
    return readGuildContext(state);
  }

  function getGuildInfo(guildId) {
    const normalizedGuildId = Number(guildId);
    if (
      !Number.isInteger(normalizedGuildId) ||
      normalizedGuildId < 0
    ) {
      return null;
    }
    const context = getContext();
    return context && normalizedGuildId < context.guilds.size
      ? context.guilds.entries[normalizedGuildId] || null
      : null;
  }

  function getCurrentGuildHall() {
    const mapInfo = state.map?.api?.GetCurrentMapInfo?.();
    if (!mapInfo || mapInfo.type !== RegionType.GuildHall) {
      return null;
    }
    const context = getContext();
    return context?.guilds.entries.find(Boolean) || null;
  }

  return Object.freeze({
    Describe() {
      const mapInfo = state.map?.api?.GetCurrentMapInfo?.() || null;
      return {
        actionStatuses: internals.getActionStatuses(),
        internalFunctions: internals.getInternalFunctions(),
        context: inspectGuildContext(state),
        currentGuildHall: getCurrentGuildHall(),
        isCurrentMapGuildHall: mapInfo?.type === RegionType.GuildHall,
        verification: {
          build: 38615,
          level: "live-tested-readonly",
          source:
            "Current JSPI GuildClient decompilation plus live outpost validation.",
        },
      };
    },
    GetActionStatus(name) {
      return internals.getActionStatus(name);
    },
    GetActionStatuses() {
      return internals.getActionStatuses();
    },
    GetUnsupportedAction(name) {
      return internals.getActionStatus(name);
    },
    GetInternalFunction(name) {
      return internals.getInternalFunction(name);
    },
    GetInternalFunctions() {
      return internals.getInternalFunctions();
    },
    CallInternalFunction(name, ...args) {
      return internals.call(name, args);
    },
    GetContext: getContext,
    GetCurrentGH() {
      return getCurrentGuildHall();
    },
    GetGuildArray() {
      return getContext()?.guilds || null;
    },
    GetGuildHistory() {
      return getContext()?.guildHistory || null;
    },
    GetGuildInfo: getGuildInfo,
    GetGuildRoster() {
      return getContext()?.playerRoster || null;
    },
    GetPlayerGuild() {
      const context = getContext();
      return context
        ? getGuildInfo(context.playerGuildIndex)
        : null;
    },
    GetPlayerGuildAnnouncement() {
      return getContext()?.announcement ?? null;
    },
    GetPlayerGuildAnnouncer() {
      return getContext()?.announcementAuthor ?? null;
    },
    GetPlayerGuildIndex() {
      return getContext()?.playerGuildIndex ?? 0;
    },
    GetPlayerGuildRank() {
      return getContext()?.playerGuildRank ?? 0;
    },
    GetPlayerGuildHallKey() {
      return getContext()?.playerGhKey ?? null;
    },
    GetTownAlliances() {
      return getContext()?.townAlliances || null;
    },
    IsAvailable() {
      return getContext() !== null;
    },
    LeaveGH() {
      return internals.leaveGuildHall();
    },
    TravelGH(key = null, unknown0 = 0) {
      return internals.travelGuildHall(key || getContext()?.playerGhKey, unknown0);
    },
  });
}

export const GuildModule = createModule(
  "GuildMgr",
  async function initModule(state) {
    if (!state.context?.api) {
      throw new Error("Context must be initialized before GuildMgr");
    }
    state.guild = Object.freeze({
      api: createGuildApi(state),
    });
    const inspection = inspectGuildContext(state);
    return {
      address: inspection.address || null,
      reason: inspection.reason,
      valid: inspection.valid,
      verification: "build-38615-live-tested-readonly",
    };
  }
);
