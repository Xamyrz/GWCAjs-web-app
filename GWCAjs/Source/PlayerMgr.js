import {
  getWorldContextAddress,
  getWorldPlayerNumber,
  getWorldTitleArray,
  resolveWorldContext,
} from "../Include/GWCA/Context/WorldContext.js";
import {
  isValidTitleId,
  normalizeTitleId,
  readTitle,
  TITLE_ID_NONE,
  TITLE_NAMES,
} from "../Include/GWCA/GameEntities/Title.js";
import { readValue } from "../Include/GWCA/Utilities/Memory.js";
import { createPlayerInternals } from "./PlayerMgrInternals.js";
import {
  createPlayerStateView,
  getStoredCharacterName,
} from "./PlayerMgrState.js";
import { createModule } from "./stdafx.js";

const TITLE_CLIENT_DATA_ADDRESS = 0x276f60;
const TITLE_CLIENT_DATA_STRIDE = 0x0c;
const TITLE_CLIENT_DATA_OFFSETS = Object.freeze({
  nameId: 0x08,
  titleId: 0x04,
  unknown0: 0x00,
});

function getTitleTrack(state, titleId) {
  const normalizedTitleId = normalizeTitleId(titleId);
  if (!isValidTitleId(normalizedTitleId)) {
    return null;
  }

  const titleArray = getWorldTitleArray(state);
  if (!titleArray || normalizedTitleId >= titleArray.size) {
    return null;
  }

  return readTitle(
    state,
    (titleArray.buffer + normalizedTitleId * titleArray.stride) >>> 0,
    normalizedTitleId
  );
}

function getTitleData(state, titleId) {
  const normalizedTitleId = normalizeTitleId(titleId);
  if (!isValidTitleId(normalizedTitleId)) {
    return null;
  }

  const address =
    (TITLE_CLIENT_DATA_ADDRESS +
      normalizedTitleId * TITLE_CLIENT_DATA_STRIDE) >>>
    0;
  const tableTitleId = readValue(
    state,
    "u32",
    address + TITLE_CLIENT_DATA_OFFSETS.titleId
  );
  const nameId = readValue(
    state,
    "u32",
    address + TITLE_CLIENT_DATA_OFFSETS.nameId
  );
  const unknown0 = readValue(
    state,
    "u32",
    address + TITLE_CLIENT_DATA_OFFSETS.unknown0
  );
  if (tableTitleId === normalizedTitleId && typeof nameId === "number") {
    return {
      address,
      clientDataAvailable: true,
      nameId,
      source: "ConstGetTitleClientData(ETitle)",
      titleId: tableTitleId,
      titleName: TITLE_NAMES[normalizedTitleId],
      unknown0,
    };
  }

  return {
    address,
    clientDataAvailable: false,
    nameId: null,
    source: "TitleID enum fallback",
    titleId: normalizedTitleId,
    titleName: TITLE_NAMES[normalizedTitleId],
    unknown0: null,
  };
}

function getRuntimePlayer(global = globalThis) {
  return global.GW?.player || null;
}

function toMapPoint2(position) {
  if (!position || typeof position !== "object") {
    return null;
  }
  const x = Number(position.x);
  const y = Number(position.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function getActiveTitleId(state, playerState) {
  const player = playerState.getPlayer();
  if (!player?.activeTitleTier) {
    return TITLE_ID_NONE;
  }

  const titleArray = getWorldTitleArray(state);
  if (!titleArray) {
    return TITLE_ID_NONE;
  }

  for (let titleId = 0; titleId < titleArray.size; titleId += 1) {
    const title = readTitle(
      state,
      (titleArray.buffer + titleId * titleArray.stride) >>> 0,
      titleId
    );
    if (title.currentTitleTierIndex === player.activeTitleTier) {
      return titleId;
    }
  }
  return TITLE_ID_NONE;
}

function createPlayerApi(state, global = globalThis) {
  const internals = createPlayerInternals(state);
  const playerState = createPlayerStateView(state, global);

  function getPosition(options = {}) {
    const runtimePlayer = getRuntimePlayer(global);
    if (!runtimePlayer || typeof runtimePlayer.getPosition !== "function") {
      return null;
    }
    const controlledAgentId = playerState.getControlledCharacterAgentId();
    const agentId = controlledAgentId || playerState.getPlayer()?.agentId || 0;
    const position = runtimePlayer.getPosition({
      ...options,
      agentId: options.agentId || agentId,
    });
    const mapPoint = toMapPoint2(position);
    if (mapPoint) {
      return mapPoint;
    }
    const directPosition =
      agentId &&
      typeof runtimePlayer.getDirectAgentPositionByAgentId === "function"
        ? runtimePlayer.getDirectAgentPositionByAgentId(agentId)
        : null;
    return toMapPoint2(directPosition);
  }

  return Object.freeze({
    Describe() {
      const playerArray = playerState.getPlayerArray();
      const titleArray = getWorldTitleArray(state);
      return {
        charContextAddress: state.anchors?.charContextAddress || 0,
        direct: {
          playerAddress: playerState.resolvePlayerAddress(),
          playerArray,
          playerNumber: playerState.getCurrentPlayerNumber(),
          contextChain: resolveWorldContext(state),
          actionStatuses: internals.getActionStatuses(),
          internalFunctions: internals.getInternalFunctions(),
          titleArray,
          titleDataSource: "ConstGetTitleClientData(ETitle) table at 0x276f60",
          worldContextAddress: getWorldContextAddress(state),
          worldPlayerArray: playerArray,
          worldPlayerNumber: getWorldPlayerNumber(state),
        },
        storedCharacterName: state.player?.storedCharacterName || null,
      };
    },
    DescribeFastPlayerPath() {
      return playerState.describeFastPlayerPath();
    },
    CallInternalFunction(name, ...args) {
      return internals.call(name, args);
    },
    GetInternalFunction(name) {
      return internals.getInternalFunction(name);
    },
    GetInternalFunctions() {
      return internals.getInternalFunctions();
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
    GetCharacterName() {
      return (
        playerState.getPlayer()?.name ||
        playerState.getConfiguredCharacterName()
      );
    },
    GetAmountOfPlayersInInstance() {
      const playerArray = playerState.getPlayerArray();
      return playerArray && playerArray.size > 0 ? playerArray.size - 1 : 0;
    },
    GetPlayer(playerId = 0) {
      return playerState.getPlayer(playerId);
    },
    GetPlayerAddress(playerId = 0) {
      return playerId === 0
        ? playerState.resolveCurrentPlayerAddressFast() || 0
        : playerState.resolvePlayerAddress(playerId) || 0;
    },
    GetPlayerAgentId(playerId = 0) {
      if (!playerId) {
        const controlledAgentId =
          playerState.getControlledCharacterAgentId();
        if (controlledAgentId) {
          return controlledAgentId;
        }
      }
      return playerState.getPlayer(playerId)?.agentId || 0;
    },
    GetAgent(options = {}) {
      const runtimePlayer = getRuntimePlayer(global);
      return runtimePlayer && typeof runtimePlayer.getAgent === "function"
        ? runtimePlayer.getAgent(options)
        : null;
    },
    GetAgentAddress(options = {}) {
      const runtimePlayer = getRuntimePlayer(global);
      return runtimePlayer &&
        typeof runtimePlayer.getAgentAddress === "function"
        ? runtimePlayer.getAgentAddress(options) || 0
        : 0;
    },
    GetPosition: getPosition,
    getPosition,
    getposition: getPosition,
    GetDirectAgentContext() {
      const runtimePlayer = getRuntimePlayer(global);
      return runtimePlayer &&
        typeof runtimePlayer.getDirectAgentContext === "function"
        ? runtimePlayer.getDirectAgentContext()
        : null;
    },
    InspectAgentContextCandidates() {
      const runtimePlayer = getRuntimePlayer(global);
      return runtimePlayer &&
        typeof runtimePlayer.inspectAgentContextCandidates === "function"
        ? runtimePlayer.inspectAgentContextCandidates()
        : [];
    },
    GetDirectAgentAddressByAgentId(agentId) {
      const runtimePlayer = getRuntimePlayer(global);
      return runtimePlayer &&
        typeof runtimePlayer.getDirectAgentAddressByAgentId === "function"
        ? runtimePlayer.getDirectAgentAddressByAgentId(agentId) || 0
        : 0;
    },
    GetDirectAgentPositionByAgentId(agentId) {
      const runtimePlayer = getRuntimePlayer(global);
      return runtimePlayer &&
        typeof runtimePlayer.getDirectAgentPositionByAgentId === "function"
        ? runtimePlayer.getDirectAgentPositionByAgentId(agentId)
        : null;
    },
    DiscoverAgent(options = {}) {
      const runtimePlayer = getRuntimePlayer(global);
      return runtimePlayer && typeof runtimePlayer.discoverAgent === "function"
        ? runtimePlayer.discoverAgent(options)
        : null;
    },
    PromoteAgentAddress(address) {
      const runtimePlayer = getRuntimePlayer(global);
      return runtimePlayer &&
        typeof runtimePlayer.promoteAgentAddress === "function"
        ? runtimePlayer.promoteAgentAddress(address)
        : {
            available: false,
            error: "Runtime player promotion is not available",
          };
    },
    PromotePlayerAddress(address) {
      const runtimePlayer = getRuntimePlayer(global);
      return runtimePlayer &&
        typeof runtimePlayer.promotePlayerAddress === "function"
        ? runtimePlayer.promotePlayerAddress(address)
        : {
            available: false,
            error: "Runtime player promotion is not available",
          };
    },
    ClearPromotions() {
      const runtimePlayer = getRuntimePlayer(global);
      if (runtimePlayer && typeof runtimePlayer.clearPromotions === "function") {
        runtimePlayer.clearPromotions();
        return true;
      }
      return false;
    },
    FindAgentLivingCandidatesByAgentId(agentId, options = {}) {
      const runtimePlayer = getRuntimePlayer(global);
      return runtimePlayer &&
        typeof runtimePlayer.findAgentLivingCandidatesByAgentId === "function"
        ? runtimePlayer.findAgentLivingCandidatesByAgentId(agentId, options)
        : [];
    },
    FindAgentLivingCandidatesByPlayerNumber(playerNumber, options = {}) {
      const runtimePlayer = getRuntimePlayer(global);
      return runtimePlayer &&
        typeof runtimePlayer.findAgentLivingCandidatesByPlayerNumber === "function"
        ? runtimePlayer.findAgentLivingCandidatesByPlayerNumber(
            playerNumber,
            options
          )
        : [];
    },
    GetPlayerArray() {
      return playerState.getPlayerArray();
    },
    GetPlayerByID(playerId = 0) {
      return playerState.getPlayer(playerId);
    },
    GetPlayerByName(name) {
      return playerState.getPlayerByName(name);
    },
    GetPlayerName(playerId = 0) {
      return playerState.getPlayer(playerId)?.name || null;
    },
    GetPlayerEncodedName(playerId = 0) {
      return playerState.getPlayerEncodedName(playerId);
    },
    GetPlayerNumber() {
      return playerState.getCurrentPlayerNumber();
    },
    GetStoredCharacterName() {
      return state.player?.storedCharacterName || null;
    },
    SetPlayerName(playerId = 0, replaceName = "") {
      return playerState.setPlayerName(playerId, replaceName);
    },
    GetTitleArray() {
      return getWorldTitleArray(state);
    },
    GetTitleIDs() {
      const titleArray = getWorldTitleArray(state);
      return titleArray
        ? Array.from({ length: titleArray.size }, (_, titleId) => titleId)
        : [];
    },
    GetTitleIdByName(name) {
      return normalizeTitleId(name);
    },
    GetTitleName(titleId) {
      const normalizedTitleId = normalizeTitleId(titleId);
      return isValidTitleId(normalizedTitleId)
        ? TITLE_NAMES[normalizedTitleId]
        : null;
    },
    GetTitleNames() {
      return TITLE_NAMES.slice();
    },
    GetTitleTrack(titleId) {
      return getTitleTrack(state, titleId);
    },
    GetActiveTitleId() {
      return getActiveTitleId(state, playerState);
    },
    GetActiveTitleName() {
      const titleId = getActiveTitleId(state, playerState);
      return titleId === TITLE_ID_NONE ? null : TITLE_NAMES[titleId] || null;
    },
    GetActiveTitle() {
      const titleId = getActiveTitleId(state, playerState);
      return titleId === TITLE_ID_NONE
        ? null
        : getTitleTrack(state, titleId);
    },
    GetTitleData(titleId) {
      return getTitleData(state, titleId);
    },
    SetActiveTitle(titleId) {
      const normalizedTitleId = normalizeTitleId(titleId);
      return isValidTitleId(normalizedTitleId)
        ? internals.callMessage("SendSetTitle", [normalizedTitleId])
        : false;
    },
    RemoveActiveTitle() {
      return internals.callMessage("SendSetTitleNone", []);
    },
    ChangeSecondProfession(profession, heroIndex = 0) {
      const heroIndexValue = Number(heroIndex);
      const professionValue = Number(profession);
      if (
        !Number.isInteger(heroIndexValue) ||
        !Number.isInteger(professionValue) ||
        (heroIndexValue >>> 0) !== 0
      ) {
        return false;
      }
      const agentId = playerState.getControlledCharacterAgentId();
      return agentId
        ? internals.callMessage("SendOrderSetProfessionSecondary", [
            agentId,
            professionValue >>> 0,
          ])
        : false;
    },
    DepositFaction(allegiance, amount = 5000) {
      const allegianceValue = Number(allegiance);
      const amountValue = Number(amount);
      if (!Number.isInteger(allegianceValue) || !Number.isInteger(amountValue)) {
        return false;
      }
      const allegianceId = allegianceValue >>> 0;
      const factionAmount = amountValue >>> 0;
      if (allegianceId > 1 || factionAmount === 0) {
        return false;
      }
      return internals.callMessage("SendOrderGuildAdjustFaction", [
        0,
        allegianceId,
        factionAmount,
      ]);
    },
    IsAvailable() {
      return this.GetPlayerAddress() !== 0;
    },
  });
}

export const PlayerModule = createModule(
  "PlayerMgr",
  async function initModule(state, global = globalThis) {
    state.player = Object.freeze({
      api: createPlayerApi(state, global),
      charContextAddress: state.anchors?.charContextAddress || 0,
      storedCharacterName: getStoredCharacterName(global),
    });

    return {
      charContextAddress: state.player.charContextAddress || null,
      storedCharacterName: state.player.storedCharacterName,
    };
  }
);

export function getPlayerApi(global = globalThis) {
  return global.GWCAjs?.Player || null;
}
