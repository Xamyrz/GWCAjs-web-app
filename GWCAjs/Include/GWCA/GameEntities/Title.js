import { readValue } from "../Utilities/Memory.js";

export const TITLE_SIZE = 0x2c;
export const TITLE_ID_NONE = 0xff;

export const TITLE_OFFSETS = Object.freeze({
  currentPoints: 0x04,
  currentTitleTierIndex: 0x08,
  maxTitleRank: 0x18,
  maxTitleTierIndex: 0x1c,
  nextTitleTierIndex: 0x10,
  pointsDescPtr: 0x24,
  pointsNeededCurrentRank: 0x0c,
  pointsNeededNextRank: 0x14,
  props: 0x00,
  textPtr: 0x28,
});

export const TITLE_NAMES = Object.freeze([
  "Hero",
  "TyrianCarto",
  "CanthanCarto",
  "Gladiator",
  "Champion",
  "Kurzick",
  "Luxon",
  "Drunkard",
  "Deprecated_SkillHunter",
  "Survivor",
  "KoaBD",
  "Deprecated_TreasureHunter",
  "Deprecated_Wisdom",
  "ProtectorTyria",
  "ProtectorCantha",
  "Lucky",
  "Unlucky",
  "Sunspear",
  "ElonianCarto",
  "ProtectorElona",
  "Lightbringer",
  "LDoA",
  "Commander",
  "Gamer",
  "SkillHunterTyria",
  "VanquisherTyria",
  "SkillHunterCantha",
  "VanquisherCantha",
  "SkillHunterElona",
  "VanquisherElona",
  "LegendaryCarto",
  "LegendaryGuardian",
  "LegendarySkillHunter",
  "LegendaryVanquisher",
  "Sweets",
  "GuardianTyria",
  "GuardianCantha",
  "GuardianElona",
  "Asuran",
  "Deldrimor",
  "Vanguard",
  "Norn",
  "MasterOfTheNorth",
  "Party",
  "Zaishen",
  "TreasureHunter",
  "Wisdom",
  "Codex",
]);

const TITLE_NAME_TO_ID = new Map(
  TITLE_NAMES.map((name, titleId) => [name.toLowerCase(), titleId])
);

export function normalizeTitleId(titleId) {
  if (typeof titleId === "number" && Number.isFinite(titleId)) {
    return titleId | 0;
  }
  if (typeof titleId === "string" && titleId.trim()) {
    const resolved = TITLE_NAME_TO_ID.get(titleId.trim().toLowerCase());
    return typeof resolved === "number" ? resolved : -1;
  }
  return -1;
}

export function isValidTitleId(titleId) {
  return (
    Number.isInteger(titleId) &&
    titleId >= 0 &&
    titleId < TITLE_NAMES.length
  );
}

export function readTitle(state, address, titleId = null) {
  const props = readValue(state, "u32", address + TITLE_OFFSETS.props);
  return {
    address,
    currentPoints: readValue(
      state,
      "u32",
      address + TITLE_OFFSETS.currentPoints
    ),
    currentTitleTierIndex: readValue(
      state,
      "u32",
      address + TITLE_OFFSETS.currentTitleTierIndex
    ),
    hasTiers: (props & 3) === 2,
    isPercentageBased: (props & 1) !== 0,
    maxTitleRank: readValue(
      state,
      "u32",
      address + TITLE_OFFSETS.maxTitleRank
    ),
    maxTitleTierIndex: readValue(
      state,
      "u32",
      address + TITLE_OFFSETS.maxTitleTierIndex
    ),
    nextTitleTierIndex: readValue(
      state,
      "u32",
      address + TITLE_OFFSETS.nextTitleTierIndex
    ),
    pointsDescPtr: readValue(
      state,
      "u32",
      address + TITLE_OFFSETS.pointsDescPtr
    ),
    pointsNeededCurrentRank: readValue(
      state,
      "u32",
      address + TITLE_OFFSETS.pointsNeededCurrentRank
    ),
    pointsNeededNextRank: readValue(
      state,
      "u32",
      address + TITLE_OFFSETS.pointsNeededNextRank
    ),
    props,
    textPtr: readValue(state, "u32", address + TITLE_OFFSETS.textPtr),
    titleId,
    titleName: isValidTitleId(titleId) ? TITLE_NAMES[titleId] : null,
  };
}
