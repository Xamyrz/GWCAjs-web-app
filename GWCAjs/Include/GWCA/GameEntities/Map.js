import { readValue } from "../Utilities/Memory.js";

export const MISSION_MAP_ICON_SIZE = 0x28;
export const AREA_INFO_SIZE = 0x7c;
export const MAP_TYPE_INSTANCE_INFO_SIZE = 0x0c;

export const RegionType = Object.freeze({
  AllianceBattle: 0,
  Arena: 1,
  ExplorableZone: 2,
  GuildBattleArea: 3,
  GuildHall: 4,
  MissionOutpost: 5,
  CooperativeMission: 6,
  CompetitiveMission: 7,
  EliteMission: 8,
  Challenge: 9,
  Outpost: 10,
  ZaishenBattle: 11,
  HeroesAscent: 12,
  City: 13,
  MissionArea: 14,
  HeroBattleOutpost: 15,
  HeroBattleArea: 16,
  EotnMission: 17,
  Dungeon: 18,
  Marketplace: 19,
  Unknown: 20,
  DevRegion: 21,
});

export function readMissionMapIcon(state, address) {
  return {
    address,
    index: readValue(state, "u32", address),
    x: readValue(state, "f32", address + 0x04),
    y: readValue(state, "f32", address + 0x08),
    option: readValue(state, "u32", address + 0x14),
    modelId: readValue(state, "u32", address + 0x1c),
  };
}

export function readAreaInfo(state, address, mapId = null) {
  const flags = readValue(state, "u32", address + 0x10);
  const fileId = readValue(state, "u32", address + 0x68);
  return {
    address,
    campaign: readValue(state, "u32", address),
    continent: readValue(state, "u32", address + 0x04),
    region: readValue(state, "u32", address + 0x08),
    type: readValue(state, "u32", address + 0x0c),
    flags,
    thumbnailId: readValue(state, "u32", address + 0x14),
    minPartySize: readValue(state, "u32", address + 0x18),
    maxPartySize: readValue(state, "u32", address + 0x1c),
    minPlayerSize: readValue(state, "u32", address + 0x20),
    maxPlayerSize: readValue(state, "u32", address + 0x24),
    controlledOutpostId: readValue(state, "u32", address + 0x28),
    fractionMission: readValue(state, "u32", address + 0x2c),
    minLevel: readValue(state, "u32", address + 0x30),
    maxLevel: readValue(state, "u32", address + 0x34),
    neededPq: readValue(state, "u32", address + 0x38),
    missionMapsTo: readValue(state, "u32", address + 0x3c),
    x: readValue(state, "u32", address + 0x40),
    y: readValue(state, "u32", address + 0x44),
    iconStartX: readValue(state, "u32", address + 0x48),
    iconStartY: readValue(state, "u32", address + 0x4c),
    iconEndX: readValue(state, "u32", address + 0x50),
    iconEndY: readValue(state, "u32", address + 0x54),
    iconStartXDupe: readValue(state, "u32", address + 0x58),
    iconStartYDupe: readValue(state, "u32", address + 0x5c),
    iconEndXDupe: readValue(state, "u32", address + 0x60),
    iconEndYDupe: readValue(state, "u32", address + 0x64),
    fileId,
    fileId1:
      Number.isInteger(fileId) && fileId > 0
        ? ((fileId - 1) % 0xff00) + 0x100
        : null,
    fileId2:
      Number.isInteger(fileId) && fileId > 0
        ? Math.floor((fileId - 1) / 0xff00) + 0x100
        : null,
    missionChronology: readValue(state, "u32", address + 0x6c),
    haMapChronology: readValue(state, "u32", address + 0x70),
    nameId: readValue(state, "u32", address + 0x74),
    descriptionId: readValue(state, "u32", address + 0x78),
    mapId,
    hasEnterButton: (flags & 0x100) !== 0 || (flags & 0x40000) !== 0,
    isOnWorldMap: (flags & 0x20) === 0,
    isPvP: (flags & 0x40001) !== 0,
    isGuildHall: (flags & 0x800000) !== 0,
    isVanquishableArea: (flags & 0x10000000) !== 0,
    isUnlockable: (flags & 0x10000) !== 0,
    hasMissionMapsTo: (flags & 0x8000000) !== 0,
  };
}

export function readMapTypeInstanceInfo(state, address) {
  return {
    address,
    requestInstanceMapType: readValue(state, "u32", address),
    isOutpost: (readValue(state, "u8", address + 0x04) || 0) !== 0,
    mapRegionType: readValue(state, "u32", address + 0x08),
  };
}
