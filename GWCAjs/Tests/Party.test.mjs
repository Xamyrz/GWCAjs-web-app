import assert from "node:assert/strict";

import {
  GAME_CONTEXT_OFFSETS,
} from "../Include/GWCA/Context/GameContext.js";
import {
  PLAYER_CONTROLLED_CHARACTER_OFFSETS,
  WORLD_CONTEXT_OFFSETS,
} from "../Include/GWCA/Context/WorldContext.js";
import {
  ATTRIBUTE_OFFSETS,
  PARTY_ATTRIBUTE_ACTIVE_IDS_OFFSET,
} from "../Include/GWCA/GameEntities/Attribute.js";
import {
  HERO_BEHAVIOR,
  HERO_FLAG_OFFSETS,
  HERO_INFO_OFFSETS,
  PET_INFO_OFFSETS,
} from "../Include/GWCA/GameEntities/Hero.js";
import {
  PARTY_CONTEXT_OFFSETS,
  inspectPartyContext,
  readPartyContext,
} from "../Include/GWCA/Context/PartyContext.js";
import {
  HENCHMAN_PARTY_MEMBER_OFFSETS,
  HENCHMAN_PARTY_MEMBER_SIZE,
  HERO_PARTY_MEMBER_OFFSETS,
  HERO_PARTY_MEMBER_SIZE,
  PARTY_INFO_OFFSETS,
  PARTY_SEARCH_OFFSETS,
  PLAYER_PARTY_MEMBER_OFFSETS,
  PLAYER_PARTY_MEMBER_SIZE,
} from "../Include/GWCA/GameEntities/Party.js";
import { createPartyApi } from "../Source/PartyMgr.js";

const buffer = new ArrayBuffer(0x50000);
const view = new DataView(buffer);

const rootAddress = 0x10000;
const contextAddress = 0x18000;
const partiesBuffer = 0x1a000;
const partyAddress = 0x1b000;
const playersBuffer = 0x1c000;
const heroesBuffer = 0x1d000;
const henchmenBuffer = 0x1e000;
const searchBuffer = 0x1f000;
const searchAddress = 0x20000;
const worldAddress = 0x21000;
const controlledCharacterAddress = 0x22000;
const worldPlayerBuffer = 0x23000;
const heroInfoBuffer = 0x24000;
const partyAttributeBuffer = 0x25000;
const activeAttributeIdsBuffer = 0x25800;
const petBuffer = 0x26000;
const heroFlagBuffer = 0x26800;
const petNameAddress = 0x27000;
const requestPartyAddress = 0x28000;
const sendingPartyAddress = 0x29000;
const requestPlayersBuffer = 0x2a000;
const sendingPlayersBuffer = 0x2b000;
const temporaryAddress = 0x30000;
const propContextSlotAddress = 0x28b680;
let propContextSlot = 0;

const state = {
  anchors: {
    gameplayContextAddress: rootAddress,
  },
  context: {
    api: {},
  },
  hook: {
    memory: { buffer },
    readU32(address) {
      if (address === propContextSlotAddress) {
        return propContextSlot;
      }
      return view.getUint32(address, true);
    },
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
    withAllocation(size, callback) {
      assert.ok(size <= 0x100);
      return callback(temporaryAddress);
    },
    withUtf16(value, callback) {
      writeUtf16(temporaryAddress, value, 20);
      return callback(temporaryAddress);
    },
    writeU32(address, value) {
      if (address === propContextSlotAddress) {
        propContextSlot = value >>> 0;
        return;
      }
      view.setUint32(address, value >>> 0, true);
    },
  },
  memory: {
    byteLength: buffer.byteLength,
    readType(type, address) {
      if (type === "u32" || type === "ptr") {
        return view.getUint32(address, true);
      }
      if (type === "f32") {
        return view.getFloat32(address, true);
      }
      throw new Error("Unsupported test read type: " + type);
    },
  },
  player: {
    api: {
      GetPlayerNumber() {
        return 1001;
      },
      GetPlayerByID(playerId) {
        return (
          {
            501: { name: "Alice", partyLeaderPlayerNumber: 501 },
            502: { name: "Bob", partyLeaderPlayerNumber: 501 },
            601: { name: "Carol", partyLeaderPlayerNumber: 601 },
            602: { name: "Dave", partyLeaderPlayerNumber: 601 },
          }[playerId] || null
        );
      },
    },
  },
};

function writeU32(address, value) {
  view.setUint32(address, value >>> 0, true);
}

function writeF32(address, value) {
  view.setFloat32(address, value, true);
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

function writeLink(address, previousLinkAddress, nextNodeRaw) {
  writeU32(address, previousLinkAddress);
  writeU32(address + 4, nextNodeRaw);
}

function writePartyInfoList(listAddress, nodes) {
  const offset = PARTY_INFO_OFFSETS.inviteLink;
  const sentinelAddress = listAddress + 4;
  writeU32(listAddress, offset);
  if (nodes.length === 0) {
    writeLink(sentinelAddress, sentinelAddress, sentinelAddress - offset);
    return;
  }
  writeLink(
    sentinelAddress,
    nodes[nodes.length - 1] + offset,
    nodes[0]
  );
  nodes.forEach((nodeAddress, index) => {
    const previousLinkAddress =
      index === 0
        ? sentinelAddress
        : nodes[index - 1] + offset;
    const nextNodeRaw =
      index === nodes.length - 1
        ? sentinelAddress - offset
        : nodes[index + 1];
    writeLink(nodeAddress + offset, previousLinkAddress, nextNodeRaw);
  });
}

writeU32(rootAddress + GAME_CONTEXT_OFFSETS.party, contextAddress);
writeU32(rootAddress + GAME_CONTEXT_OFFSETS.world, worldAddress);
writeU32(worldAddress + WORLD_CONTEXT_OFFSETS.playerNumber, 1001);
writeU32(worldAddress + WORLD_CONTEXT_OFFSETS.isHardModeUnlocked, 1);
writeArray(worldAddress + WORLD_CONTEXT_OFFSETS.players, worldPlayerBuffer, 1, 1);
writeU32(
  worldAddress + WORLD_CONTEXT_OFFSETS.playerControlledChar,
  controlledCharacterAddress
);
writeU32(
  controlledCharacterAddress + PLAYER_CONTROLLED_CHARACTER_OFFSETS.agentId,
  9001
);
writeU32(
  controlledCharacterAddress + PLAYER_CONTROLLED_CHARACTER_OFFSETS.compositeId,
  0x300003e9
);
writeArray(
  worldAddress + WORLD_CONTEXT_OFFSETS.heroInfo,
  heroInfoBuffer,
  1,
  1
);
writeU32(heroInfoBuffer + HERO_INFO_OFFSETS.heroId, 5);
writeU32(heroInfoBuffer + HERO_INFO_OFFSETS.agentId, 3001);
writeU32(heroInfoBuffer + HERO_INFO_OFFSETS.level, 20);
writeU32(heroInfoBuffer + HERO_INFO_OFFSETS.primary, 4);
writeU32(heroInfoBuffer + HERO_INFO_OFFSETS.secondary, 5);
writeU32(heroInfoBuffer + HERO_INFO_OFFSETS.heroFileId, 10005);
writeU32(heroInfoBuffer + HERO_INFO_OFFSETS.modelFileId, 20005);
writeUtf16(heroInfoBuffer + HERO_INFO_OFFSETS.name, "Hero Five", 20);
writeArray(
  worldAddress + WORLD_CONTEXT_OFFSETS.heroFlags,
  heroFlagBuffer,
  1,
  1
);
writeU32(heroFlagBuffer + HERO_FLAG_OFFSETS.heroId, 5);
writeU32(heroFlagBuffer + HERO_FLAG_OFFSETS.agentId, 3001);
writeU32(heroFlagBuffer + HERO_FLAG_OFFSETS.level, 20);
writeU32(heroFlagBuffer + HERO_FLAG_OFFSETS.behavior, HERO_BEHAVIOR.Guard);
writeF32(heroFlagBuffer + HERO_FLAG_OFFSETS.flagX, 100);
writeF32(heroFlagBuffer + HERO_FLAG_OFFSETS.flagY, 200);
writeU32(heroFlagBuffer + HERO_FLAG_OFFSETS.lockedTargetId, 0);
writeArray(
  worldAddress + WORLD_CONTEXT_OFFSETS.attributes,
  partyAttributeBuffer,
  1,
  1
);
writeU32(partyAttributeBuffer, 3001);
writeU32(partyAttributeBuffer + 4 + ATTRIBUTE_OFFSETS.id, 7);
writeU32(partyAttributeBuffer + 4 + ATTRIBUTE_OFFSETS.levelBase, 11);
writeU32(partyAttributeBuffer + 4 + ATTRIBUTE_OFFSETS.level, 12);
writeU32(partyAttributeBuffer + 4 + ATTRIBUTE_OFFSETS.decrementPoints, 2);
writeU32(partyAttributeBuffer + 4 + ATTRIBUTE_OFFSETS.incrementPoints, 3);
writeArray(
  partyAttributeBuffer + PARTY_ATTRIBUTE_ACTIVE_IDS_OFFSET,
  activeAttributeIdsBuffer,
  1,
  1
);
writeU32(activeAttributeIdsBuffer, 0);
writeArray(worldAddress + WORLD_CONTEXT_OFFSETS.pets, petBuffer, 1, 1);
writeU32(petBuffer + PET_INFO_OFFSETS.agentId, 9100);
writeU32(petBuffer + PET_INFO_OFFSETS.ownerAgentId, 9001);
writeU32(petBuffer + PET_INFO_OFFSETS.name, petNameAddress);
writeU32(petBuffer + PET_INFO_OFFSETS.modelFileId1, 41);
writeU32(petBuffer + PET_INFO_OFFSETS.modelFileId2, 42);
writeU32(petBuffer + PET_INFO_OFFSETS.behavior, 1);
writeU32(petBuffer + PET_INFO_OFFSETS.lockedTargetId, 9200);
writeUtf16(petNameAddress, "Test Pet", 64);
writeU32(
  contextAddress + PARTY_CONTEXT_OFFSETS.flag,
  0x10 | 0x80
);
writeU32(
  contextAddress + PARTY_CONTEXT_OFFSETS.searchClientId,
  7
);
writePartyInfoList(contextAddress + PARTY_CONTEXT_OFFSETS.requests, [
  requestPartyAddress,
]);
writeU32(contextAddress + PARTY_CONTEXT_OFFSETS.requestsCount, 1);
writePartyInfoList(contextAddress + PARTY_CONTEXT_OFFSETS.sending, [
  sendingPartyAddress,
]);
writeU32(contextAddress + PARTY_CONTEXT_OFFSETS.sendingCount, 1);
writeArray(contextAddress + PARTY_CONTEXT_OFFSETS.parties, partiesBuffer, 2, 2);
writeU32(partiesBuffer, 0);
writeU32(partiesBuffer + 4, partyAddress);
writeU32(contextAddress + PARTY_CONTEXT_OFFSETS.playerParty, partyAddress);
writeArray(contextAddress + PARTY_CONTEXT_OFFSETS.partySearch, searchBuffer, 1, 1);
writeU32(searchBuffer, searchAddress);

writeU32(partyAddress + PARTY_INFO_OFFSETS.partyId, 1);
writeArray(
  partyAddress + PARTY_INFO_OFFSETS.players,
  playersBuffer,
  2,
  2
);
writeArray(
  partyAddress + PARTY_INFO_OFFSETS.henchmen,
  henchmenBuffer,
  1,
  1
);
writeArray(partyAddress + PARTY_INFO_OFFSETS.heroes, heroesBuffer, 1, 1);
writeArray(partyAddress + PARTY_INFO_OFFSETS.others, 0, 0, 0);
writeU32(requestPartyAddress + PARTY_INFO_OFFSETS.partyId, 77);
writeArray(
  requestPartyAddress + PARTY_INFO_OFFSETS.players,
  requestPlayersBuffer,
  2,
  2
);
writeArray(requestPartyAddress + PARTY_INFO_OFFSETS.henchmen, 0, 0, 0);
writeArray(requestPartyAddress + PARTY_INFO_OFFSETS.heroes, 0, 0, 0);
writeArray(requestPartyAddress + PARTY_INFO_OFFSETS.others, 0, 0, 0);
writeU32(
  requestPlayersBuffer + PLAYER_PARTY_MEMBER_OFFSETS.loginNumber,
  501
);
writeU32(
  requestPlayersBuffer + PLAYER_PARTY_MEMBER_SIZE +
    PLAYER_PARTY_MEMBER_OFFSETS.loginNumber,
  502
);
writeU32(sendingPartyAddress + PARTY_INFO_OFFSETS.partyId, 88);
writeArray(
  sendingPartyAddress + PARTY_INFO_OFFSETS.players,
  sendingPlayersBuffer,
  2,
  2
);
writeArray(sendingPartyAddress + PARTY_INFO_OFFSETS.henchmen, 0, 0, 0);
writeArray(sendingPartyAddress + PARTY_INFO_OFFSETS.heroes, 0, 0, 0);
writeArray(sendingPartyAddress + PARTY_INFO_OFFSETS.others, 0, 0, 0);
writeU32(
  sendingPlayersBuffer + PLAYER_PARTY_MEMBER_OFFSETS.loginNumber,
  601
);
writeU32(
  sendingPlayersBuffer + PLAYER_PARTY_MEMBER_SIZE +
    PLAYER_PARTY_MEMBER_OFFSETS.loginNumber,
  602
);

writeU32(playersBuffer + PLAYER_PARTY_MEMBER_OFFSETS.loginNumber, 1001);
writeU32(playersBuffer + PLAYER_PARTY_MEMBER_OFFSETS.calledTargetId, 2001);
writeU32(playersBuffer + PLAYER_PARTY_MEMBER_OFFSETS.state, 3);
writeU32(
  playersBuffer + PLAYER_PARTY_MEMBER_SIZE + PLAYER_PARTY_MEMBER_OFFSETS.loginNumber,
  1002
);
writeU32(
  playersBuffer + PLAYER_PARTY_MEMBER_SIZE + PLAYER_PARTY_MEMBER_OFFSETS.state,
  1
);

writeU32(heroesBuffer + HERO_PARTY_MEMBER_OFFSETS.agentId, 3001);
writeU32(heroesBuffer + HERO_PARTY_MEMBER_OFFSETS.ownerPlayerId, 1001);
writeU32(heroesBuffer + HERO_PARTY_MEMBER_OFFSETS.heroId, 5);
writeU32(heroesBuffer + HERO_PARTY_MEMBER_OFFSETS.primary, 4);
writeU32(heroesBuffer + HERO_PARTY_MEMBER_OFFSETS.secondary, 5);
writeU32(heroesBuffer + HERO_PARTY_MEMBER_OFFSETS.level, 20);

writeU32(henchmenBuffer + HENCHMAN_PARTY_MEMBER_OFFSETS.agentId, 4001);
writeUtf16(henchmenBuffer + HENCHMAN_PARTY_MEMBER_OFFSETS.name, "Hench One", 20);
writeU32(henchmenBuffer + HENCHMAN_PARTY_MEMBER_OFFSETS.profession, 3);
writeU32(henchmenBuffer + HENCHMAN_PARTY_MEMBER_OFFSETS.level, 20);

writeU32(searchAddress + PARTY_SEARCH_OFFSETS.partySearchId, 7);
writeU32(searchAddress + PARTY_SEARCH_OFFSETS.partySearchType, 2);
writeU32(searchAddress + PARTY_SEARCH_OFFSETS.hardMode, 1);
writeU32(searchAddress + PARTY_SEARCH_OFFSETS.district, 12);
writeU32(searchAddress + PARTY_SEARCH_OFFSETS.language, 1);
writeU32(searchAddress + PARTY_SEARCH_OFFSETS.partySize, 4);
writeU32(searchAddress + PARTY_SEARCH_OFFSETS.heroCount, 1);
writeUtf16(searchAddress + PARTY_SEARCH_OFFSETS.message, "Questing", 32);
writeUtf16(searchAddress + PARTY_SEARCH_OFFSETS.partyLeader, "Leader Name", 20);
writeU32(searchAddress + PARTY_SEARCH_OFFSETS.primary, 1);
writeU32(searchAddress + PARTY_SEARCH_OFFSETS.secondary, 2);
writeU32(searchAddress + PARTY_SEARCH_OFFSETS.level, 20);
writeU32(searchAddress + PARTY_SEARCH_OFFSETS.timestamp, 123456);

const context = readPartyContext(state);
assert.ok(context);
assert.equal(context.valid, true);
assert.equal(context.isHardMode, true);
assert.equal(context.isLeader, true);
assert.equal(context.isDefeated, false);
assert.equal(context.playerParty.partyId, 1);
assert.equal(context.requests.entries[0].partyId, 77);
assert.equal(context.requests.entries[0].leaderName, "Alice");
assert.equal(context.sending.entries[0].partyId, 88);
assert.equal(context.sending.entries[0].leaderName, "Carol");
assert.equal(context.playerParty.players.size, 2);
assert.equal(context.playerParty.heroes.entries[0].heroId, 5);
assert.equal(context.playerParty.henchmen.entries[0].name, "Hench One");
assert.equal(context.partySearch.entries[0].message, "Questing");

const api = createPartyApi(state);
assert.equal(api.GetPartySize(), 4);
assert.equal(api.GetPartyPlayerCount(), 2);
assert.equal(api.GetPartyHeroCount(), 1);
assert.equal(api.GetPartyHenchmanCount(), 1);
assert.equal(api.GetIsPartyInHardMode(), true);
assert.equal(api.GetIsHardModeUnlocked(), true);
assert.equal(api.GetIsPartyDefeated(), false);
assert.equal(api.GetIsLeader(), true);
assert.equal(api.GetIsPlayerLoaded(), true);
assert.equal(api.GetIsPlayerTicked(), true);
assert.equal(api.GetIsPlayerTicked(1), false);
assert.equal(api.GetIsPartyLoaded(), true);
assert.equal(api.GetIsPartyTicked(), false);
assert.equal(api.GetHeroAgentID(0), 9001);
assert.equal(api.GetHeroAgentID(1), 3001);
assert.equal(api.GetHeroAgentID(2), 0);
assert.equal(api.GetAgentHeroID(3001), 1);
assert.equal(api.GetAgentHeroID(9001), 0);
assert.equal(api.GetHeroPartyMember(1).heroId, 5);
assert.equal(api.GetHeroPartyMember(2), null);
assert.deepEqual(api.GetHeroInfo(5), {
  address: heroInfoBuffer,
  agentId: 3001,
  heroFileId: 10005,
  heroId: 5,
  index: 0,
  level: 20,
  modelFileId: 20005,
  name: "Hero Five",
  primary: 4,
  secondary: 5,
});
assert.deepEqual(api.GetHeroInfoByIndex(1), api.GetHeroInfo(5));
assert.equal(api.GetHeroInfoByIndex(2), null);
assert.equal(api.GetHeroInfo(6), null);
assert.equal(api.GetPetInfo().name, "Test Pet");
assert.equal(api.GetPetInfo().nameEncoding, "plain");
assert.equal(api.GetPetInfo().rawName, "Test Pet");
assert.equal(api.GetPetInfo(9001).agentId, 9100);
assert.equal(api.GetPetInfo(9002), null);
assert.equal(api.GetAgentAttributes(3001).attributes.length, 1);
assert.deepEqual(api.GetAgentAttributes(3001).activeAttributeIds, [0]);
assert.deepEqual(api.GetAgentAttributes(3001).attributes[0], {
  address: partyAttributeBuffer + 4,
  decrementPoints: 2,
  id: 7,
  incrementPoints: 3,
  index: 0,
  level: 12,
  levelBase: 11,
});
assert.equal(api.GetAgentAttributes(3001).allAttributes.length, 51);
assert.equal(api.GetAgentAttributes(3002), null);
assert.equal(api.GetPartyInfo(1).partyId, 1);
assert.equal(api.GetPartyRequests().entries[0].partyId, 77);
assert.deepEqual(
  api.GetPendingPartyRequests().map((entry) => entry.partyId),
  [77]
);
assert.equal(api.GetSendingPartyRequests().entries[0].partyId, 88);
assert.equal(api.GetPartyRequests().entries[0].leaderName, "Alice");
assert.equal(api.GetSendingPartyRequests().entries[0].leaderName, "Carol");
assert.equal(api.GetPartySearch(7).partyLeader, "Leader Name");
assert.equal(api.GetActionStatus("LeaveParty").available, false);
assert.equal(api.GetActionStatus("SetHardMode").available, false);
assert.equal(api.LeaveParty(), false);
assert.equal(api.AddHero(5), false);

writeU32(contextAddress + PARTY_CONTEXT_OFFSETS.flag, 0x80);
assert.equal(api.GetIsPartyInHardMode(), false);
assert.equal(api.SetHardMode(true), false);
const internalCalls = [];
state.hook.getRawExports = () => ({
  __gwca_msg_send_command_ai_mode() {},
  __gwca_msg_send_command_ai_priority_target() {},
  __gwca_msg_send_hero_activate() {},
  __gwca_msg_send_hero_deactivate() {},
  __gwca_msg_send_invite_henchman() {},
  __gwca_msg_send_invite_member() {},
  __gwca_msg_send_invite_member_by_name() {},
  __gwca_msg_send_invite_accept() {},
  __gwca_msg_send_invite_decline() {},
  __gwca_party_cancel_invitation() {},
  __gwca_msg_send_search_begin() {},
  __gwca_msg_send_search_end() {},
  __gwca_msg_send_remove_henchman() {},
  __gwca_msg_send_remove_member() {},
  __gwca_msg_send_hard_mode_set() {},
  __gwca_party_button_on_click() {},
  __gwca_party_select_offer() {},
  __gwca_msg_send_signal() {},
});
state.hook.callExport = (name, ...args) => {
  internalCalls.push({ args, name });
};
assert.equal(api.GetActionStatus("SetHardMode").available, true);
assert.equal(api.GetActionStatus("Tick").available, true);
assert.equal(api.GetActionStatus("LeaveParty").available, true);
assert.equal(api.GetActionStatus("ReturnToOutpost").available, true);
assert.equal(api.GetActionStatus("AddHero").available, true);
assert.equal(api.GetActionStatus("KickHero").available, true);
assert.equal(api.GetActionStatus("KickAllHeroes").available, true);
assert.equal(api.GetActionStatus("SetHeroBehavior").available, true);
assert.equal(api.GetActionStatus("SetPetBehavior").available, true);
assert.equal(api.GetActionStatus("AddHenchman").available, true);
assert.equal(api.GetActionStatus("KickHenchman").available, true);
assert.equal(api.GetActionStatus("InvitePlayer").available, true);
assert.equal(api.GetActionStatus("KickPlayer").available, true);
assert.equal(api.GetActionStatus("CancelPartyInvite").available, true);
assert.equal(api.GetActionStatus("SearchParty").available, true);
assert.equal(api.GetActionStatus("SearchPartyCancel").available, true);
assert.equal(
  api.GetActionStatus("RespondToPartyRequestAccept").available,
  true
);
assert.equal(api.GetActionStatus("RespondToPartyRequest").available, true);
assert.equal(api.SetHardMode(true), true);
assert.equal(api.Tick(false), true);
assert.equal(api.LeaveParty(), true);
assert.equal(api.AddHero(5), true);
assert.equal(api.KickHero(5), true);
assert.equal(api.KickAllHeroes(), true);
assert.equal(api.AddHenchman(4001), true);
assert.equal(api.KickHenchman(4001), true);
assert.equal(api.InvitePlayer(1002), true);
assert.equal(api.InvitePlayer("Player Name"), true);
assert.equal(api.KickPlayer(1002), true);
assert.equal(api.SearchParty(2, "Questing"), true);
assert.equal(api.SearchPartyCancel(), true);
assert.equal(api.RespondToPartyRequest(7, true), true);
assert.equal(api.RespondToPartyRequest(7, false), true);
assert.equal(api.RespondToPartyRequest("Alice", true), true);
assert.equal(api.CancelPartyInvite(88), true);
assert.equal(api.CancelPartyInvite(0), true);
assert.equal(api.CancelPartyInvite("Carol"), true);
assert.equal(api.CancelPartyInvite("carol"), true);
assert.equal(api.CancelPartyInvite(2), true);
assert.equal(api.ReturnToOutpost(), false);
writeU32(contextAddress + PARTY_CONTEXT_OFFSETS.flag, 0x20 | 0x80);
assert.equal(api.ReturnToOutpost(), true);
writeU32(contextAddress + PARTY_CONTEXT_OFFSETS.flag, 0x80);
assert.equal(api.SetHeroBehavior(3001, HERO_BEHAVIOR.Fight), true);
writeU32(heroFlagBuffer + HERO_FLAG_OFFSETS.behavior, HERO_BEHAVIOR.Fight);
assert.equal(api.SetHeroBehavior(3001, "fight"), true);
assert.equal(api.SetHeroBehavior(3002, HERO_BEHAVIOR.Guard), false);
assert.equal(api.SetHeroBehavior(3001, 3), false);
assert.equal(api.SetPetBehavior(HERO_BEHAVIOR.Fight), false);
assert.equal(api.SetPetBehavior(HERO_BEHAVIOR.Fight, 9300), true);
assert.equal(api.AddHero(0), false);
assert.equal(api.AddHero(0x28), false);
assert.equal(api.KickHero(0x29), false);
assert.equal(api.AddHenchman(0), false);
assert.equal(api.InvitePlayer(""), false);
assert.equal(api.InvitePlayer("12345678901234567890"), false);
assert.equal(api.KickPlayer(0), false);
assert.equal(api.SearchParty(-1, "Questing"), false);
assert.equal(api.SearchParty(2, "12345678901234567890123456789012"), false);
assert.equal(api.RespondToPartyRequest(0), false);
assert.equal(api.SetPetBehavior(3), false);
assert.deepEqual(internalCalls, [
  {
    args: [1],
    name: "__gwca_msg_send_hard_mode_set",
  },
  {
    args: [0],
    name: "__gwca_msg_send_signal",
  },
  {
    args: [temporaryAddress, 0],
    name: "__gwca_party_button_on_click",
  },
  {
    args: [5],
    name: "__gwca_msg_send_hero_activate",
  },
  {
    args: [5],
    name: "__gwca_msg_send_hero_deactivate",
  },
  {
    args: [0x26],
    name: "__gwca_msg_send_hero_deactivate",
  },
  {
    args: [4001],
    name: "__gwca_msg_send_invite_henchman",
  },
  {
    args: [4001],
    name: "__gwca_msg_send_remove_henchman",
  },
  {
    args: [1002],
    name: "__gwca_msg_send_invite_member",
  },
  {
    args: [temporaryAddress],
    name: "__gwca_msg_send_invite_member_by_name",
  },
  {
    args: [1002],
    name: "__gwca_msg_send_remove_member",
  },
  {
    args: [2, temporaryAddress, 0],
    name: "__gwca_msg_send_search_begin",
  },
  {
    args: [],
    name: "__gwca_msg_send_search_end",
  },
  {
    args: [7],
    name: "__gwca_msg_send_invite_accept",
  },
  {
    args: [7],
    name: "__gwca_msg_send_invite_decline",
  },
  {
    args: [77],
    name: "__gwca_msg_send_invite_accept",
  },
  {
    args: [88],
    name: "__gwca_party_cancel_invitation",
  },
  {
    args: [88],
    name: "__gwca_party_cancel_invitation",
  },
  {
    args: [88],
    name: "__gwca_party_cancel_invitation",
  },
  {
    args: [88],
    name: "__gwca_party_cancel_invitation",
  },
  {
    args: [88],
    name: "__gwca_party_cancel_invitation",
  },
  {
    args: [],
    name: "__gwca_party_select_offer",
  },
  {
    args: [3001, HERO_BEHAVIOR.Fight],
    name: "__gwca_msg_send_command_ai_mode",
  },
  {
    args: [9100, 9300],
    name: "__gwca_msg_send_command_ai_priority_target",
  },
  {
    args: [9100, HERO_BEHAVIOR.Fight],
    name: "__gwca_msg_send_command_ai_mode",
  },
]);
assert.equal(state.hook.readUtf16(temporaryAddress, 20), "Questing");
assert.equal(view.getUint32(temporaryAddress + 0x34, true), 1);
assert.equal(propContextSlot, 0);
writeU32(contextAddress + PARTY_CONTEXT_OFFSETS.flag, 0x10 | 0x80);
assert.equal(api.SetHardMode(true), true);
assert.equal(internalCalls.length, 25);
writeU32(playersBuffer + PLAYER_PARTY_MEMBER_OFFSETS.state, 1);
assert.equal(api.Tick(false), true);
assert.equal(internalCalls.length, 25);
assert.equal(api.SetTickToggle(), true);
assert.deepEqual(internalCalls.at(-1), {
  args: [1],
  name: "__gwca_msg_send_signal",
});
writeU32(playersBuffer + PLAYER_PARTY_MEMBER_OFFSETS.state, 3);
assert.equal(api.SetTickToggle(), true);
assert.deepEqual(internalCalls.at(-1), {
  args: [0],
  name: "__gwca_msg_send_signal",
});
writeArray(partyAddress + PARTY_INFO_OFFSETS.heroes, 0, 0, 0);
writeArray(partyAddress + PARTY_INFO_OFFSETS.henchmen, 0, 0, 0);
assert.equal(api.GetPartySize(), 2);
writeArray(
  partyAddress + PARTY_INFO_OFFSETS.players,
  playersBuffer,
  1,
  1
);
assert.equal(api.GetPartySize(), 1);
assert.equal(api.LeaveParty(), true);
assert.equal(internalCalls.length, 27);
writeArray(
  partyAddress + PARTY_INFO_OFFSETS.players,
  playersBuffer,
  2,
  2
);
writeArray(partyAddress + PARTY_INFO_OFFSETS.henchmen, henchmenBuffer, 1, 1);
writeArray(partyAddress + PARTY_INFO_OFFSETS.heroes, heroesBuffer, 1, 1);
delete state.hook.getRawExports;
delete state.hook.callExport;

writeU32(contextAddress + PARTY_CONTEXT_OFFSETS.playerParty, buffer.byteLength - 4);
assert.equal(readPartyContext(state), null);
assert.match(inspectPartyContext(state).reason, /player party/i);
writeU32(contextAddress + PARTY_CONTEXT_OFFSETS.playerParty, partyAddress);

writeU32(partiesBuffer + 4, buffer.byteLength - 4);
assert.equal(readPartyContext(state), null);
assert.match(inspectPartyContext(state).reason, /party array/i);
writeU32(partiesBuffer + 4, partyAddress);

console.log("PartyContext and manager checks passed");
