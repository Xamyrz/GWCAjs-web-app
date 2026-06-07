import {
  isValidPointer,
  isValidRange,
  readUtf16,
  readValue,
} from "../Utilities/Memory.js";

export const GH_KEY_SIZE = 0x10;
export const CAPE_DESIGN_SIZE = 0x1c;
export const GUILD_SIZE = 0xb0;
export const GUILD_PLAYER_SIZE = 0x12c;
export const GUILD_HISTORY_EVENT_SIZE = 0x90;
export const TOWN_ALLIANCE_SIZE = 0x78;
export const MAX_GUILD_FACTION = 4;

export const GUILD_OFFSETS = Object.freeze({
  cape: 0x90,
  faction: 0x74,
  factionPoint: 0x78,
  features: 0x2c,
  index: 0x24,
  key: 0x00,
  name: 0x30,
  qualifierPoint: 0x7c,
  rank: 0x28,
  rating: 0x70,
  tag: 0x80,
  territory: 0xac,
});

export const GUILD_PLAYER_OFFSETS = Object.freeze({
  currentName: 0x30,
  index: 0x114,
  inviteTime: 0x100,
  invitedName: 0x08,
  inviterName: 0x58,
  memberType: 0x10c,
  namePtr: 0x04,
  offline: 0x108,
  promoterName: 0x80,
  status: 0x110,
  unknown104: 0x104,
});

export const GUILD_HISTORY_EVENT_OFFSETS = Object.freeze({
  index: 0x84,
  name: 0x04,
  time: 0x00,
});

export const GUILD_HISTORY_EVENT_TYPES = Object.freeze({
  GuildFounded: 0x0345,
  Kicked: 0x0349,
  LeftGuild: 0x8101,
  NewMember: 0x0346,
});

export const TOWN_ALLIANCE_OFFSETS = Object.freeze({
  allegiance: 0x04,
  cape: 0x58,
  faction: 0x08,
  mapId: 0x74,
  name: 0x0c,
  rank: 0x00,
  tag: 0x4c,
});

function hasValidEntityRange(state, address, size) {
  return isValidPointer(state, address, {
    alignment: 4,
    length: size,
  });
}

function isReasonableEnum(value, maximum = 16) {
  return Number.isInteger(value) && value >= 0 && value <= maximum;
}

function isGuildHistoryControlCode(codeUnit) {
  return (
    codeUnit < 0x20 ||
    (codeUnit >= 0x0100 && codeUnit <= 0x01ff) ||
    (codeUnit >= 0x0300 && codeUnit <= 0x036f) ||
    (codeUnit >= 0x2e00 && codeUnit <= 0x2eff)
  );
}

export function decodeGuildHistoryText(rawText) {
  const text = String(rawText ?? "");
  if (!text) {
    return {
      display: "",
      names: [],
      raw: "",
    };
  }

  const names = [];
  const eventCode = text.charCodeAt(0);
  let segment = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const codeUnit = char.charCodeAt(0);
    if (index === 0) {
      continue;
    }
    if (codeUnit === 1) {
      const name = segment.trim();
      if (name) {
        names.push(name);
      }
      segment = "";
      continue;
    }
    if (isGuildHistoryControlCode(codeUnit)) {
      continue;
    }
    segment += char;
  }

  const trailingName = segment.trim();
  if (trailingName) {
    names.push(trailingName);
  }

  return {
    display: names.length > 0 ? names.join(" / ") : text,
    eventCode,
    names,
    raw: text,
  };
}

export function decodeGuildHistoryDate(rawTime) {
  if (!Number.isInteger(rawTime)) {
    return {
      date: null,
      daySerial: null,
      displayDate: null,
    };
  }

  const daySerial = rawTime & 0xffff;
  if (daySerial <= 0) {
    return {
      date: null,
      daySerial,
      displayDate: null,
    };
  }

  const millis = Date.UTC(1900, 0, 1) + daySerial * 24 * 60 * 60 * 1000;
  const date = new Date(millis);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return {
    date:
      String(year).padStart(4, "0") +
      "-" +
      String(month).padStart(2, "0") +
      "-" +
      String(day).padStart(2, "0"),
    daySerial,
    displayDate: `${month}/${day}/${year}`,
  };
}

export function describeGuildHistoryEvent(decodedText, decodedDate) {
  const names = decodedText?.names || [];
  const datePrefix = decodedDate?.displayDate
    ? decodedDate.displayDate + " "
    : "";
  switch (decodedText?.eventCode) {
    case GUILD_HISTORY_EVENT_TYPES.GuildFounded:
      return names[0]
        ? `${datePrefix}Guild founded by ${names[0]}.`
        : `${datePrefix}Guild founded.`;
    case GUILD_HISTORY_EVENT_TYPES.NewMember:
      if (names[0] && names[1]) {
        return `${datePrefix}New member ${names[0]} (invited by ${names[1]}).`;
      }
      return names[0] ? `${datePrefix}New member ${names[0]}.` : "";
    case GUILD_HISTORY_EVENT_TYPES.Kicked:
      if (names[0] && names[1]) {
        return `${datePrefix}${names[0]} kicked by ${names[1]}.`;
      }
      return names[0] ? `${datePrefix}${names[0]} kicked.` : "";
    case GUILD_HISTORY_EVENT_TYPES.LeftGuild:
      return names[0] ? `${datePrefix}${names[0]} left the guild.` : "";
    default:
      return decodedText?.display
        ? `${datePrefix}${decodedText.display}`
        : datePrefix.trim();
  }
}

export function readGHKey(state, address) {
  if (!isValidRange(state, address, GH_KEY_SIZE, 4)) {
    return null;
  }
  const words = Array.from({ length: 4 }, (_, index) =>
    readValue(state, "u32", address + index * 4)
  );
  if (words.some((value) => !Number.isInteger(value))) {
    return null;
  }
  return {
    address: address >>> 0,
    empty: words.every((value) => value === 0),
    words,
  };
}

export function hasGuildHallKey(key) {
  return !!key && Array.isArray(key.words) && key.words.some(Boolean);
}

export function readCapeDesign(state, address) {
  if (!isValidRange(state, address, CAPE_DESIGN_SIZE, 4)) {
    return null;
  }
  return {
    address: address >>> 0,
    backgroundColor: readValue(state, "u32", address),
    detailColor: readValue(state, "u32", address + 0x04),
    emblemColor: readValue(state, "u32", address + 0x08),
    shape: readValue(state, "u32", address + 0x0c),
    detail: readValue(state, "u32", address + 0x10),
    emblem: readValue(state, "u32", address + 0x14),
    trim: readValue(state, "u32", address + 0x18),
  };
}

export function readGuild(state, address) {
  if (!hasValidEntityRange(state, address, GUILD_SIZE)) {
    return null;
  }
  return {
    address: address >>> 0,
    cape: readCapeDesign(state, address + GUILD_OFFSETS.cape),
    faction: readValue(state, "u32", address + GUILD_OFFSETS.faction),
    factionPoint: readValue(
      state,
      "u32",
      address + GUILD_OFFSETS.factionPoint
    ),
    features: readValue(state, "u32", address + GUILD_OFFSETS.features),
    index: readValue(state, "u32", address + GUILD_OFFSETS.index),
    key: readGHKey(state, address + GUILD_OFFSETS.key),
    name: readUtf16(state, address + GUILD_OFFSETS.name, 32),
    qualifierPoint: readValue(
      state,
      "u32",
      address + GUILD_OFFSETS.qualifierPoint
    ),
    rank: readValue(state, "u32", address + GUILD_OFFSETS.rank),
    rating: readValue(state, "u32", address + GUILD_OFFSETS.rating),
    tag: readUtf16(state, address + GUILD_OFFSETS.tag, 8),
    territory: readValue(state, "u32", address + GUILD_OFFSETS.territory),
  };
}

export function isPlausibleGuild(state, guild, expectedIndex = null) {
  return explainGuildPlausibility(state, guild, expectedIndex).plausible;
}

export function explainGuildPlausibility(
  state,
  guild,
  expectedIndex = null
) {
  const reasons = [];
  if (!guild) {
    reasons.push("guild could not be read");
    return { plausible: false, reasons };
  }
  if (!hasValidEntityRange(state, guild.address, GUILD_SIZE)) {
    reasons.push("guild range is invalid");
  }
  if (!guild.key) {
    reasons.push("GHKey is invalid");
  }
  if (!guild.cape) {
    reasons.push("CapeDesign is invalid");
  }
  if (
    !Number.isInteger(guild.index) ||
    guild.index < 0 ||
    guild.index >= 0x10000
  ) {
    reasons.push("guild index is outside the expected range");
  }
  if (expectedIndex !== null && guild.index !== expectedIndex) {
    reasons.push(
      `guild index ${guild.index} does not match slot ${expectedIndex}`
    );
  }
  if (!isReasonableEnum(guild.faction, MAX_GUILD_FACTION)) {
    reasons.push(`faction ${guild.faction} is outside the expected range`);
  }
  if (typeof guild.name !== "string") {
    reasons.push("guild name is not readable");
  }
  if (typeof guild.tag !== "string") {
    reasons.push("guild tag is not readable");
  }
  return {
    plausible: reasons.length === 0,
    reasons,
  };
}

export function readGuildPlayer(state, address) {
  if (!hasValidEntityRange(state, address, GUILD_PLAYER_SIZE)) {
    return null;
  }
  const namePtr = readValue(
    state,
    "u32",
    address + GUILD_PLAYER_OFFSETS.namePtr
  );
  return {
    address: address >>> 0,
    currentName: readUtf16(
      state,
      address + GUILD_PLAYER_OFFSETS.currentName,
      20
    ),
    index: readValue(state, "u32", address + GUILD_PLAYER_OFFSETS.index),
    inviteTime: readValue(
      state,
      "u32",
      address + GUILD_PLAYER_OFFSETS.inviteTime
    ),
    invitedName: readUtf16(
      state,
      address + GUILD_PLAYER_OFFSETS.invitedName,
      20
    ),
    inviterName: readUtf16(
      state,
      address + GUILD_PLAYER_OFFSETS.inviterName,
      20
    ),
    memberType: readValue(
      state,
      "u32",
      address + GUILD_PLAYER_OFFSETS.memberType
    ),
    namePtr,
    offline: readValue(
      state,
      "u32",
      address + GUILD_PLAYER_OFFSETS.offline
    ),
    promoterName: readUtf16(
      state,
      address + GUILD_PLAYER_OFFSETS.promoterName,
      64
    ),
    publicAddress: (address + 8) >>> 0,
    status: readValue(
      state,
      "u32",
      address + GUILD_PLAYER_OFFSETS.status
    ),
    unknown104: readValue(
      state,
      "u32",
      address + GUILD_PLAYER_OFFSETS.unknown104
    ),
  };
}

export function isPlausibleGuildPlayer(state, player) {
  return explainGuildPlayerPlausibility(state, player).plausible;
}

export function explainGuildPlayerPlausibility(state, player) {
  const reasons = [];
  if (!player) {
    reasons.push("guild player could not be read");
    return { plausible: false, reasons };
  }
  if (!hasValidEntityRange(state, player.address, GUILD_PLAYER_SIZE)) {
    reasons.push("guild player range is invalid");
  }
  if (
    player.namePtr &&
    !isValidPointer(state, player.namePtr, {
      alignment: 2,
      length: 2,
    })
  ) {
    reasons.push("name pointer is invalid");
  }
  if (!isReasonableEnum(player.memberType)) {
    reasons.push(`member type ${player.memberType} is outside the expected range`);
  }
  if (!isReasonableEnum(player.status)) {
    reasons.push(`status ${player.status} is outside the expected range`);
  }
  if (
    !Number.isInteger(player.index) ||
    player.index < 0 ||
    player.index >= 0x10000
  ) {
    reasons.push("guild player index is outside the expected range");
  }
  return {
    plausible: reasons.length === 0,
    reasons,
  };
}

export function readGuildHistoryEvent(state, address) {
  if (!hasValidEntityRange(state, address, GUILD_HISTORY_EVENT_SIZE)) {
    return null;
  }
  const rawName = readUtf16(
    state,
    address + GUILD_HISTORY_EVENT_OFFSETS.name,
    64
  );
  const decodedName = decodeGuildHistoryText(rawName);
  const time = readValue(
    state,
    "u32",
    address + GUILD_HISTORY_EVENT_OFFSETS.time
  );
  const decodedDate = decodeGuildHistoryDate(time);
  return {
    address: address >>> 0,
    date: decodedDate.date,
    daySerial: decodedDate.daySerial,
    description: describeGuildHistoryEvent(decodedName, decodedDate),
    displayDate: decodedDate.displayDate,
    eventCode: decodedName.eventCode,
    index: readValue(
      state,
      "u32",
      address + GUILD_HISTORY_EVENT_OFFSETS.index
    ),
    name: decodedName.display,
    names: decodedName.names,
    rawName,
    time,
  };
}

export function readTownAlliance(state, address) {
  if (!hasValidEntityRange(state, address, TOWN_ALLIANCE_SIZE)) {
    return null;
  }
  return {
    address: address >>> 0,
    allegiance: readValue(
      state,
      "u32",
      address + TOWN_ALLIANCE_OFFSETS.allegiance
    ),
    cape: readCapeDesign(state, address + TOWN_ALLIANCE_OFFSETS.cape),
    faction: readValue(
      state,
      "u32",
      address + TOWN_ALLIANCE_OFFSETS.faction
    ),
    mapId: readValue(
      state,
      "u32",
      address + TOWN_ALLIANCE_OFFSETS.mapId
    ),
    name: readUtf16(state, address + TOWN_ALLIANCE_OFFSETS.name, 32),
    rank: readValue(state, "u32", address + TOWN_ALLIANCE_OFFSETS.rank),
    tag: readUtf16(state, address + TOWN_ALLIANCE_OFFSETS.tag, 5),
  };
}
