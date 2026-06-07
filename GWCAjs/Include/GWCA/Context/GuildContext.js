import { getNamedGameContextChildAddress } from "./GameContext.js";
import { readArray, readPointerArray } from "../GameContainers/Array.js";
import {
  GUILD_HISTORY_EVENT_SIZE,
  GUILD_PLAYER_SIZE,
  GUILD_SIZE,
  TOWN_ALLIANCE_SIZE,
  explainGuildPlausibility,
  explainGuildPlayerPlausibility,
  hasGuildHallKey,
  readGHKey,
  readGuild,
  readGuildHistoryEvent,
  readGuildPlayer,
  readTownAlliance,
} from "../GameEntities/Guild.js";
import {
  isValidPointer,
  isValidRange,
  readUtf16,
  readValue,
} from "../Utilities/Memory.js";

export const GUILD_CONTEXT_SIZE = 0x3bc;

export const GUILD_CONTEXT_OFFSETS = Object.freeze({
  announcement: 0x078,
  announcementAuthor: 0x278,
  guildHistory: 0x2cc,
  guilds: 0x2f8,
  guildStatusCounts: 0x378,
  playerGuildIndex: 0x060,
  playerGuildRank: 0x2a0,
  playerGhKey: 0x064,
  playerName: 0x034,
  playerRoster: 0x358,
  townAlliances: 0x2a8,
});

const MAX_GUILDS = 4096;
const MAX_HISTORY_EVENTS = 4096;
const MAX_ROSTER_ENTRIES = 4096;
const MAX_TOWN_ALLIANCES = 128;

export function getGuildContextAddress(state) {
  return getNamedGameContextChildAddress(state, "guild", 0, {
    minSize: GUILD_CONTEXT_SIZE,
  });
}

function inspectPointerEntities(
  state,
  address,
  options,
  readEntity,
  explainEntity = null
) {
  const array = readPointerArray(state, address, options);
  if (!array) {
    return {
      reason: "array header, backing buffer, or pointer slot is invalid",
      rawHeader: readArrayHeaderSnapshot(state, address),
      rawPointers: readPointerSlotSnapshot(state, address, options),
      valid: false,
    };
  }

  const entries = [];
  for (let index = 0; index < array.pointers.length; index += 1) {
    const pointer = array.pointers[index];
    if (!pointer) {
      entries.push(null);
      continue;
    }
    const entry = readEntity(state, pointer);
    if (!entry) {
      return {
        array,
        invalidIndex: index,
        pointer,
        rawHeader: readArrayHeaderSnapshot(state, address),
        reason: "pointed entity could not be read",
        valid: false,
      };
    }
    const explanation = explainEntity
      ? explainEntity(state, entry, index)
      : { plausible: true, reasons: [] };
    if (!explanation.plausible) {
      return {
        array,
        entry,
        invalidIndex: index,
        pointer,
        rawHeader: readArrayHeaderSnapshot(state, address),
        reason: "pointed entity failed plausibility checks",
        reasons: explanation.reasons,
        valid: false,
      };
    }
    entries.push(entry);
  }

  return {
    value: {
      ...array,
      entries,
      nonNullCount: entries.filter(Boolean).length,
    },
    valid: true,
  };
}

function readArrayHeaderSnapshot(state, address) {
  return {
    address: address >>> 0,
    buffer: readValue(state, "u32", address),
    capacity: readValue(state, "u32", address + 4),
    size: readValue(state, "u32", address + 8),
    param: readValue(state, "u32", address + 12),
  };
}

function readPointerSlotSnapshot(state, address, options = {}) {
  const header = readArrayHeaderSnapshot(state, address);
  const useCapacity = !!options.useCapacity;
  const slotLimit = useCapacity ? header.capacity : header.size;
  if (
    !Number.isInteger(header.buffer) ||
    !Number.isInteger(slotLimit) ||
    slotLimit < 0 ||
    !isValidRange(state, header.buffer, Math.min(slotLimit, 16) * 4, 4)
  ) {
    return [];
  }
  return Array.from(
    { length: Math.min(slotLimit, 16) },
    (_, index) => ({
      index,
      pointer: readValue(state, "u32", header.buffer + index * 4),
    })
  );
}

function invalidInspection(address, reason, details = {}) {
  return {
    address: address >>> 0,
    reason,
    valid: false,
    ...details,
  };
}

export function inspectGuildContext(state) {
  const address = getGuildContextAddress(state);
  if (!address) {
    return invalidInspection(0, "GuildContext pointer is unavailable.");
  }
  if (
    !isValidPointer(state, address, {
      alignment: 4,
      length: GUILD_CONTEXT_SIZE,
    })
  ) {
    return invalidInspection(
      address,
      "GuildContext does not fit in linear memory."
    );
  }

  const townAllianceArray = readArray(
    state,
    address + GUILD_CONTEXT_OFFSETS.townAlliances,
    TOWN_ALLIANCE_SIZE,
    {
      allowEmpty: true,
      maxCapacity: MAX_TOWN_ALLIANCES,
      maxSize: MAX_TOWN_ALLIANCES,
    }
  );
  if (!townAllianceArray) {
    return invalidInspection(address, "Town-alliance array is invalid.");
  }
  const townAlliances = {
    ...townAllianceArray,
    entries: Array.from(
      { length: townAllianceArray.size },
      (_, index) =>
        readTownAlliance(
          state,
          townAllianceArray.buffer + index * TOWN_ALLIANCE_SIZE
        )
    ),
  };
  if (townAlliances.entries.some((entry) => !entry)) {
    return invalidInspection(address, "Town-alliance entry is invalid.");
  }

  const guildHistory = inspectPointerEntities(
    state,
    address + GUILD_CONTEXT_OFFSETS.guildHistory,
    {
      allowEmpty: true,
      allowNull: true,
      maxCapacity: MAX_HISTORY_EVENTS,
      maxSize: MAX_HISTORY_EVENTS,
      pointerOptions: {
        alignment: 4,
        length: GUILD_HISTORY_EVENT_SIZE,
      },
    },
    readGuildHistoryEvent
  );
  if (!guildHistory.valid) {
    return invalidInspection(address, "Guild-history array is invalid.", {
      guildHistory,
    });
  }

  const guildInspection = inspectPointerEntities(
    state,
    address + GUILD_CONTEXT_OFFSETS.guilds,
    {
      allowEmpty: true,
      allowNull: true,
      maxCapacity: MAX_GUILDS,
      maxSize: MAX_GUILDS,
      pointerOptions: {
        alignment: 4,
        length: GUILD_SIZE,
      },
    },
    readGuild,
    explainGuildPlausibility
  );
  if (!guildInspection.valid) {
    return invalidInspection(
      address,
      "Guild array or an indexed guild entry is invalid.",
      { guilds: guildInspection }
    );
  }
  const guilds = guildInspection.value;

  const rosterInspection = inspectPointerEntities(
    state,
    address + GUILD_CONTEXT_OFFSETS.playerRoster,
    {
      allowEmpty: true,
      allowNull: true,
      maxCapacity: MAX_ROSTER_ENTRIES,
      maxSize: MAX_ROSTER_ENTRIES,
      pointerOptions: {
        alignment: 4,
        length: GUILD_PLAYER_SIZE,
      },
    },
    readGuildPlayer,
    explainGuildPlayerPlausibility
  );
  if (!rosterInspection.valid) {
    return invalidInspection(address, "Guild-roster array is invalid.", {
      playerRoster: rosterInspection,
    });
  }
  const playerRoster = rosterInspection.value;

  const playerGuildIndex = readValue(
    state,
    "u32",
    address + GUILD_CONTEXT_OFFSETS.playerGuildIndex
  );
  const playerGuildRank = readValue(
    state,
    "u32",
    address + GUILD_CONTEXT_OFFSETS.playerGuildRank
  );
  const playerGhKey = readGHKey(
    state,
    address + GUILD_CONTEXT_OFFSETS.playerGhKey
  );
  if (
    !Number.isInteger(playerGuildIndex) ||
    !Number.isInteger(playerGuildRank) ||
    playerGuildRank > 16 ||
    !playerGhKey
  ) {
    return invalidInspection(
      address,
      "Player guild identity fields are invalid."
    );
  }
  if (
    playerGuildIndex !== 0 &&
    (playerGuildIndex >= guilds.size ||
      !guilds.entries[playerGuildIndex])
  ) {
    return invalidInspection(
      address,
      "Player guild index does not reference a populated guild entry.",
      { playerGuildIndex }
    );
  }

  const guildStatusCounts = Array.from({ length: 3 }, (_, index) =>
    readValue(
      state,
      "u32",
      address + GUILD_CONTEXT_OFFSETS.guildStatusCounts + index * 4
    )
  );
  const activeMemberCount = guildStatusCounts.reduce(
    (total, value) => total + value,
    0
  );
  if (
    guildStatusCounts.some((value) => !Number.isInteger(value)) ||
    activeMemberCount > playerRoster.nonNullCount
  ) {
    return invalidInspection(
      address,
      "Guild roster status counts are inconsistent."
    );
  }

  return {
    activeMemberCount,
    address: address >>> 0,
    announcement: readUtf16(
      state,
      address + GUILD_CONTEXT_OFFSETS.announcement,
      256
    ),
    announcementAuthor: readUtf16(
      state,
      address + GUILD_CONTEXT_OFFSETS.announcementAuthor,
      20
    ),
    guildHistory: guildHistory.value,
    guilds,
    guildStatusCounts,
    hasGuildHallKey: hasGuildHallKey(playerGhKey),
    playerGhKey,
    playerGuildIndex,
    playerGuildRank,
    playerName: readUtf16(
      state,
      address + GUILD_CONTEXT_OFFSETS.playerName,
      20
    ),
    playerRoster,
    reason: null,
    townAlliances,
    valid: true,
  };
}

export function readGuildContext(state) {
  const context = inspectGuildContext(state);
  return context.valid ? context : null;
}
