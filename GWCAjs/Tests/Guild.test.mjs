import assert from "node:assert/strict";

import {
  GUILD_CONTEXT_OFFSETS,
  inspectGuildContext,
  readGuildContext,
} from "../Include/GWCA/Context/GuildContext.js";
import { GAME_CONTEXT_OFFSETS } from "../Include/GWCA/Context/GameContext.js";
import {
  GUILD_HISTORY_EVENT_OFFSETS,
  GUILD_OFFSETS,
  GUILD_PLAYER_OFFSETS,
  TOWN_ALLIANCE_OFFSETS,
  decodeGuildHistoryDate,
  decodeGuildHistoryText,
  describeGuildHistoryEvent,
} from "../Include/GWCA/GameEntities/Guild.js";
import { RegionType } from "../Include/GWCA/GameEntities/Map.js";
import { createGuildApi } from "../Source/GuildMgr.js";

const buffer = new ArrayBuffer(0x60000);
const view = new DataView(buffer);

const rootAddress = 0x10000;
const contextAddress = 0x18000;
const townAllianceBuffer = 0x22000;
const historyBuffer = 0x23000;
const historyAddress = 0x24000;
const guildBuffer = 0x25000;
const guildAddress = 0x26000;
const rosterBuffer = 0x27000;
const memberAddress = 0x28000;

let currentRegionType = RegionType.Outpost;
const state = {
  anchors: {
    gameplayContextAddress: rootAddress,
  },
  context: {
    api: {},
  },
  hook: {
    memory: { buffer },
    readUtf16(address, maxUnits) {
      const units = [];
      for (let index = 0; index < maxUnits; index += 1) {
        const unit = view.getUint16(address + index * 2, true);
        if (!unit) {
          break;
        }
        units.push(unit);
      }
      return String.fromCharCode(...units);
    },
  },
  map: {
    api: {
      GetCurrentMapInfo() {
        return { type: currentRegionType };
      },
    },
  },
  memory: {
    byteLength: buffer.byteLength,
    readType(type, address) {
      if (type === "u32" || type === "ptr") {
        return view.getUint32(address, true);
      }
      throw new Error("Unsupported test read type: " + type);
    },
  },
};

function writeU32(address, value) {
  view.setUint32(address, value >>> 0, true);
}

function writeUtf16(address, value, maxUnits) {
  assert.ok(value.length < maxUnits);
  for (let index = 0; index < maxUnits; index += 1) {
    view.setUint16(
      address + index * 2,
      index < value.length ? value.charCodeAt(index) : 0,
      true
    );
  }
}

function writeArray(address, dataAddress, capacity, size, param = 0) {
  writeU32(address, dataAddress);
  writeU32(address + 4, capacity);
  writeU32(address + 8, size);
  writeU32(address + 12, param);
}

writeU32(
  rootAddress + GAME_CONTEXT_OFFSETS.guild,
  contextAddress
);
writeUtf16(
  contextAddress + GUILD_CONTEXT_OFFSETS.playerName,
  "Fixture Player",
  20
);
writeU32(
  contextAddress + GUILD_CONTEXT_OFFSETS.playerGuildIndex,
  1
);
writeU32(
  contextAddress + GUILD_CONTEXT_OFFSETS.playerGuildRank,
  2
);
writeU32(
  contextAddress + GUILD_CONTEXT_OFFSETS.playerGhKey,
  0x11111111
);
writeU32(
  contextAddress + GUILD_CONTEXT_OFFSETS.playerGhKey + 4,
  0x22222222
);
writeUtf16(
  contextAddress + GUILD_CONTEXT_OFFSETS.announcement,
  "Fixture announcement",
  256
);
writeUtf16(
  contextAddress + GUILD_CONTEXT_OFFSETS.announcementAuthor,
  "Fixture Officer",
  20
);

writeArray(
  contextAddress + GUILD_CONTEXT_OFFSETS.townAlliances,
  townAllianceBuffer,
  1,
  1
);
writeU32(
  townAllianceBuffer + TOWN_ALLIANCE_OFFSETS.rank,
  4
);
writeU32(
  townAllianceBuffer + TOWN_ALLIANCE_OFFSETS.allegiance,
  1
);
writeU32(
  townAllianceBuffer + TOWN_ALLIANCE_OFFSETS.faction,
  1234
);
writeUtf16(
  townAllianceBuffer + TOWN_ALLIANCE_OFFSETS.name,
  "Fixture Alliance",
  32
);
writeUtf16(
  townAllianceBuffer + TOWN_ALLIANCE_OFFSETS.tag,
  "ALLY",
  5
);
writeU32(
  townAllianceBuffer + TOWN_ALLIANCE_OFFSETS.mapId,
  77
);

writeArray(
  contextAddress + GUILD_CONTEXT_OFFSETS.guildHistory,
  historyBuffer,
  1,
  1,
  0x40
);
writeU32(historyBuffer, historyAddress);
writeU32(
  historyAddress + GUILD_HISTORY_EVENT_OFFSETS.time,
  0x00b9b39f
);
writeUtf16(
  historyAddress + GUILD_HISTORY_EVENT_OFFSETS.name,
  "\u0346\u0107Fixture Member\u0001\u0108Fixture Officer\u0001",
  64
);
writeU32(
  historyAddress + GUILD_HISTORY_EVENT_OFFSETS.index,
  0
);

writeArray(
  contextAddress + GUILD_CONTEXT_OFFSETS.guilds,
  guildBuffer,
  2,
  2
);
writeU32(guildBuffer, 0);
writeU32(guildBuffer + 4, guildAddress);
writeU32(guildAddress, 0x11111111);
writeU32(guildAddress + 4, 0x22222222);
writeU32(guildAddress + GUILD_OFFSETS.index, 1);
writeU32(guildAddress + GUILD_OFFSETS.rank, 42);
writeU32(guildAddress + GUILD_OFFSETS.features, 3);
writeUtf16(
  guildAddress + GUILD_OFFSETS.name,
  "Fixture Guild",
  32
);
writeU32(guildAddress + GUILD_OFFSETS.rating, 987);
writeU32(guildAddress + GUILD_OFFSETS.faction, 4);
writeU32(guildAddress + GUILD_OFFSETS.factionPoint, 4567);
writeU32(guildAddress + GUILD_OFFSETS.qualifierPoint, 89);
writeUtf16(guildAddress + GUILD_OFFSETS.tag, "TEST", 8);
writeU32(guildAddress + GUILD_OFFSETS.territory, 5);

writeArray(
  contextAddress + GUILD_CONTEXT_OFFSETS.playerRoster,
  rosterBuffer,
  2,
  2
);
writeU32(rosterBuffer, 0);
writeU32(rosterBuffer + 4, memberAddress);
writeU32(
  memberAddress + GUILD_PLAYER_OFFSETS.namePtr,
  memberAddress + GUILD_PLAYER_OFFSETS.invitedName
);
writeUtf16(
  memberAddress + GUILD_PLAYER_OFFSETS.invitedName,
  "Fixture Member",
  20
);
writeUtf16(
  memberAddress + GUILD_PLAYER_OFFSETS.currentName,
  "Current Member",
  20
);
writeUtf16(
  memberAddress + GUILD_PLAYER_OFFSETS.inviterName,
  "Fixture Inviter",
  20
);
writeUtf16(
  memberAddress + GUILD_PLAYER_OFFSETS.promoterName,
  "Fixture Promoter",
  64
);
writeU32(memberAddress + GUILD_PLAYER_OFFSETS.memberType, 3);
writeU32(memberAddress + GUILD_PLAYER_OFFSETS.status, 1);
writeU32(memberAddress + GUILD_PLAYER_OFFSETS.index, 1);
writeU32(
  contextAddress + GUILD_CONTEXT_OFFSETS.guildStatusCounts,
  1
);

const context = readGuildContext(state);
assert.ok(context);
assert.equal(context.valid, true);
assert.equal(context.playerName, "Fixture Player");
assert.equal(context.playerGuildIndex, 1);
assert.equal(context.playerGuildRank, 2);
assert.equal(context.hasGuildHallKey, true);
assert.equal(context.announcement, "Fixture announcement");
assert.equal(context.announcementAuthor, "Fixture Officer");
assert.equal(context.guilds.entries[1].name, "Fixture Guild");
assert.equal(context.guilds.entries[1].tag, "TEST");
assert.equal(
  context.guildHistory.entries[0].rawName,
  "\u0346\u0107Fixture Member\u0001\u0108Fixture Officer\u0001"
);
assert.deepEqual(context.guildHistory.entries[0].names, [
  "Fixture Member",
  "Fixture Officer",
]);
assert.equal(
  context.guildHistory.entries[0].name,
  "Fixture Member / Fixture Officer"
);
assert.equal(context.guildHistory.entries[0].date, "2025-11-24");
assert.equal(context.guildHistory.entries[0].displayDate, "11/24/2025");
assert.equal(
  context.guildHistory.entries[0].description,
  "11/24/2025 New member Fixture Member (invited by Fixture Officer)."
);
assert.equal(context.playerRoster.entries[1].currentName, "Current Member");
assert.equal(context.townAlliances.entries[0].name, "Fixture Alliance");
assert.equal(context.activeMemberCount, 1);

const api = createGuildApi(state);
assert.equal(api.IsAvailable(), true);
assert.equal(api.GetPlayerGuildIndex(), 1);
assert.equal(api.GetPlayerGuild().name, "Fixture Guild");
assert.equal(api.GetGuildInfo(1).tag, "TEST");
assert.equal(api.GetGuildInfo(2), null);
assert.equal(api.GetPlayerGuildAnnouncement(), "Fixture announcement");
assert.equal(api.GetPlayerGuildAnnouncer(), "Fixture Officer");
assert.equal(api.GetCurrentGH(), null);
assert.equal(api.Describe().isCurrentMapGuildHall, false);
assert.equal(api.Describe().currentGuildHall, null);
currentRegionType = RegionType.GuildHall;
assert.equal(api.GetCurrentGH().name, "Fixture Guild");
assert.equal(api.Describe().isCurrentMapGuildHall, true);
assert.equal(api.Describe().currentGuildHall.name, "Fixture Guild");
assert.equal(api.GetActionStatus("TravelGH").available, false);
assert.equal(api.TravelGH(), false);
assert.equal(api.LeaveGH(), false);

const internalCalls = [];
state.hook.getRawExports = () => ({
  __gwca_msg_send_travel_guild_hall() {},
  __gwca_msg_send_travel_mission_login() {},
});
state.hook.callExport = (name, ...args) => {
  internalCalls.push({ args, name });
};
state.hook.writeU32 = writeU32;
state.memory.temporaryBuffers = {
  withBuffer(size, callback) {
    assert.equal(size, 16);
    return callback({ address: 0x2d000, size });
  },
};
assert.equal(api.GetActionStatus("TravelGH").available, true);
assert.equal(api.GetActionStatus("LeaveGH").available, true);
assert.equal(api.LeaveGH(), true);
assert.equal(api.TravelGH(), true);
assert.deepEqual(internalCalls, [
  {
    args: [1],
    name: "__gwca_msg_send_travel_mission_login",
  },
  {
    args: [0x2d000, 0],
    name: "__gwca_msg_send_travel_guild_hall",
  },
]);
assert.equal(view.getUint32(0x2d000, true), 0x11111111);
assert.equal(view.getUint32(0x2d004, true), 0x22222222);
assert.equal(view.getUint32(0x2d008, true), 0);
assert.equal(view.getUint32(0x2d00c, true), 0);
delete state.hook.getRawExports;
delete state.hook.callExport;
delete state.hook.writeU32;
delete state.memory.temporaryBuffers;

writeU32(guildAddress + GUILD_OFFSETS.index, 2);
assert.equal(readGuildContext(state), null);
assert.match(inspectGuildContext(state).reason, /guild entry/i);
writeU32(guildAddress + GUILD_OFFSETS.index, 1);

writeU32(guildAddress + GUILD_OFFSETS.faction, 5);
assert.equal(readGuildContext(state), null);
assert.match(inspectGuildContext(state).guilds.reasons[0], /faction 5/i);
writeU32(guildAddress + GUILD_OFFSETS.faction, 4);

writeU32(
  contextAddress + GUILD_CONTEXT_OFFSETS.playerGuildIndex,
  3
);
assert.equal(readGuildContext(state), null);
assert.match(inspectGuildContext(state).reason, /guild index/i);
writeU32(
  contextAddress + GUILD_CONTEXT_OFFSETS.playerGuildIndex,
  1
);

writeU32(
  contextAddress + GUILD_CONTEXT_OFFSETS.guildStatusCounts,
  2
);
assert.equal(readGuildContext(state), null);
assert.match(inspectGuildContext(state).reason, /status counts/i);
writeU32(
  contextAddress + GUILD_CONTEXT_OFFSETS.guildStatusCounts,
  1
);

writeU32(guildBuffer + 4, buffer.byteLength - 4);
assert.equal(readGuildContext(state), null);
assert.match(inspectGuildContext(state).reason, /guild array/i);
writeU32(guildBuffer + 4, guildAddress);

writeU32(rootAddress + GAME_CONTEXT_OFFSETS.guild, 0);
assert.equal(api.IsAvailable(), false);
assert.match(api.Describe().context.reason, /unavailable/i);

assert.deepEqual(decodeGuildHistoryText("\u0345\u0107Damo Dalton\u0001"), {
  display: "Damo Dalton",
  eventCode: 0x0345,
  names: ["Damo Dalton"],
  raw: "\u0345\u0107Damo Dalton\u0001",
});
assert.deepEqual(
  decodeGuildHistoryText(
    "\u0346\u0107Persona Sai\u0001\u0108Damo Dalton\u0001"
  ),
  {
    display: "Persona Sai / Damo Dalton",
    eventCode: 0x0346,
    names: ["Persona Sai", "Damo Dalton"],
    raw: "\u0346\u0107Persona Sai\u0001\u0108Damo Dalton\u0001",
  }
);
assert.deepEqual(
  decodeGuildHistoryText(
    "\u0349\u0107Antonia Ulton\u0001\u0108Persona Sai\u0001"
  ),
  {
    display: "Antonia Ulton / Persona Sai",
    eventCode: 0x0349,
    names: ["Antonia Ulton", "Persona Sai"],
    raw: "\u0349\u0107Antonia Ulton\u0001\u0108Persona Sai\u0001",
  }
);
assert.deepEqual(
  decodeGuildHistoryText("\u8101\u2e7a\u0107Antonia Ulton\u0001"),
  {
    display: "Antonia Ulton",
    eventCode: 0x8101,
    names: ["Antonia Ulton"],
    raw: "\u8101\u2e7a\u0107Antonia Ulton\u0001",
  }
);
assert.deepEqual(decodeGuildHistoryDate(0x00a4b39f), {
  date: "2025-11-24",
  daySerial: 45983,
  displayDate: "11/24/2025",
});
assert.equal(
  describeGuildHistoryEvent(
    decodeGuildHistoryText("\u0345\u0107Damo Dalton\u0001"),
    decodeGuildHistoryDate(0x00a4b39f)
  ),
  "11/24/2025 Guild founded by Damo Dalton."
);
assert.equal(
  describeGuildHistoryEvent(
    decodeGuildHistoryText(
      "\u0346\u0107Persona Sai\u0001\u0108Damo Dalton\u0001"
    ),
    decodeGuildHistoryDate(0x00b9b39f)
  ),
  "11/24/2025 New member Persona Sai (invited by Damo Dalton)."
);
assert.equal(
  describeGuildHistoryEvent(
    decodeGuildHistoryText(
      "\u0349\u0107Antonia Ulton\u0001\u0108Persona Sai\u0001"
    ),
    decodeGuildHistoryDate(0x02e8b462)
  ),
  "6/7/2026 Antonia Ulton kicked by Persona Sai."
);
assert.equal(
  describeGuildHistoryEvent(
    decodeGuildHistoryText("\u8101\u2e7a\u0107Antonia Ulton\u0001"),
    decodeGuildHistoryDate(0x02e9b462)
  ),
  "6/7/2026 Antonia Ulton left the guild."
);

console.log("GuildContext, entity, and manager checks passed");
