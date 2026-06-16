export const INTERNAL_CALL_BUILD_ID =
  "103f50bb0ce2d744bfbf88a91afce2328b";

function freezeDefinition(id, definition) {
  const message = definition.message
    ? Object.freeze({
        ...definition.message,
        fields: Object.freeze(definition.message.fields.slice()),
      })
    : undefined;
  return Object.freeze({
    buildId: INTERNAL_CALL_BUILD_ID,
    evidence: Object.freeze((definition.evidence || []).slice()),
    gameBuild: 38615,
    id,
    ...definition,
    ...(message ? { message } : {}),
  });
}

function defineGroup(manager, definitions) {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(definitions).map(([name, definition]) => [
        name,
        freezeDefinition(`${manager}.${name}`, {
          manager,
          ...definition,
        }),
      ])
    )
  );
}

const COMMON_EVIDENCE = Object.freeze([
  "GWCAjs/SymbolMapping/38615/function-map.json",
  "GWCAjs/Ghidra-Notes.md",
  "GWCAjs/HANDOVER.md",
]);

export const PLAYER_INTERNAL_CALLS = defineGroup("Player", {
  ChangeSecondProfession: {
    address: "ram:80c50e1e",
    calls: "SendOrderSetProfessionSecondary",
    disabled: true,
    exportName: "__gwca_change_second_profession",
    functionIndex: 9265,
    functionName: "CharCliProfSetSecondary(unsigned long, ECharProfession)",
    rawWasmSignature: "(i32, i32, i32, i32) -> nil",
    reason:
      "Disabled because the containing WASM function enters an incompatible asyncify/prologue path.",
    signature: "void(agentId, profession)",
    verification: "rejected",
    evidence: COMMON_EVIDENCE,
  },
  DepositFaction: {
    address: "ram:80c4c3a0",
    calls: "SendOrderGuildAdjustFaction",
    disabled: true,
    exportName: "__gwca_deposit_faction",
    functionIndex: 9222,
    functionName:
      "CharCliPlayerOrderGuildAdjustFaction(unsigned int, ECharFaction, unsigned int)",
    rawWasmSignature: "(i32, f32, i32, i32, i32) -> nil",
    reason:
      "Disabled because the containing WASM function enters an incompatible asyncify/prologue path.",
    signature: "void(always0, allegiance, amount)",
    verification: "rejected",
    evidence: COMMON_EVIDENCE,
  },
  GetTitleData: {
    address: "ram:818b4f92",
    dataAddress: 0x276f60,
    functionName: "ConstGetTitleClientData(ETitle)",
    rawWasmSignature: "(i32) -> nil",
    reason: "Read directly from the resolved linear-memory data table.",
    signature: "TitleClientData*(titleId)",
    verification: "live-readonly",
    evidence: COMMON_EVIDENCE,
  },
  RemoveActiveTitle: {
    address: "ram:80c501af",
    calls: "SendSetTitleNone",
    disabled: true,
    exportName: "__gwca_remove_active_title",
    functionIndex: 9253,
    functionName: "CharCliPlayerSetTitleNone()",
    rawWasmSignature: "(i32) -> i32",
    reason:
      "Disabled because the containing WASM function enters an incompatible asyncify/prologue path.",
    signature: "void()",
    verification: "rejected",
    evidence: COMMON_EVIDENCE,
  },
  SetActiveTitle: {
    address: "ram:80c500f6",
    calls: "SendSetTitle",
    disabled: true,
    exportName: "__gwca_set_active_title",
    functionIndex: 9252,
    functionName: "CharCliPlayerSetTitle(unsigned int)",
    rawWasmSignature: "(i32) -> i32",
    reason:
      "Disabled because the containing WASM function enters an incompatible asyncify/prologue path.",
    signature: "void(titleId)",
    verification: "rejected",
    evidence: COMMON_EVIDENCE,
  },
  SendOrderGuildAdjustFaction: {
    address: "ram:80a148d6",
    exportName: "__gwca_msg_send_order_guild_adjust_faction",
    functionIndex: 6893,
    functionName:
      "CharMsgSendOrderGuildAdjustFaction(unsigned int, ECharFaction, unsigned int)",
    message: {
      fields: ["opcode", "always0", "allegiance", "amount"],
      opcode: 0x35,
      size: 0x10,
    },
    rawWasmSignature: "(i32, i32, i32) -> nil",
    signature: "void(always0, allegiance, amount)",
    typeIndex: 5,
    verification: "live-action",
    evidence: COMMON_EVIDENCE,
  },
  SendOrderSetProfessionSecondary: {
    address: "ram:80a15825",
    exportName: "__gwca_msg_send_order_set_profession_secondary",
    functionIndex: 6903,
    functionName:
      "CharMsgSendOrderSetProfessionSecondary(unsigned long, ECharProfession)",
    message: {
      fields: ["opcode", "agentId", "profession"],
      opcode: 0x41,
      size: 0x0c,
    },
    rawWasmSignature: "(i32, i32) -> nil",
    signature: "void(agentId, profession)",
    typeIndex: 2,
    verification: "live-action",
    evidence: COMMON_EVIDENCE,
  },
  SendSetTitle: {
    address: "ram:80a19238",
    exportName: "__gwca_msg_send_set_title",
    functionIndex: 6924,
    functionName: "CharMsgSendSetTitle(unsigned int)",
    message: {
      fields: ["opcode", "titleId"],
      opcode: 0x58,
      size: 0x08,
    },
    rawWasmSignature: "(i32) -> nil",
    signature: "void(titleId)",
    typeIndex: 0,
    verification: "live-action",
    evidence: COMMON_EVIDENCE,
  },
  SendSetTitleNone: {
    address: "ram:80a1938b",
    exportName: "__gwca_msg_send_set_title_none",
    functionIndex: 6925,
    functionName: "CharMsgSendSetTitleNone()",
    message: {
      fields: ["opcode"],
      opcode: 0x59,
      size: 0x04,
    },
    rawWasmSignature: "() -> nil",
    signature: "void()",
    typeIndex: 4,
    verification: "live-action",
    evidence: COMMON_EVIDENCE,
  },
});

export const MAP_INTERNAL_CALLS = defineGroup("Map", {
  QueryAltitude: {
    address: "ram:80256d05",
    exportName: "__gwca_map_query_altitude",
    functionIndex: 5557,
    functionName:
      "MapQueryAltitude(MapPoint const&, float, float*, Coord3f*)",
    rawWasmSignature: "(i32, f32, i32, i32) -> i32",
    requiresPropContext: true,
    signature: "int(MapPoint*, radius, float*, Coord3f*)",
    typeIndex: 109,
    verification: "live-action",
    evidence: COMMON_EVIDENCE,
  },
  Travel: {
    exportName: "__gwca_msg_send_travel_mission",
    functionIndex: 10632,
    functionName:
      "PartyClient::MsgSendTravelMission(EMission, ETerritory, unsigned int, ELanguage, int)",
    message: {
      fields: [
        "opcode",
        "mapId",
        "region",
        "districtNumber",
        "language",
        "unknown0",
      ],
      opcode: 0xb1,
      size: 0x18,
    },
    rawWasmSignature: "(i32, i32, i32, i32, i32) -> nil",
    signature: "void(mapId, region, districtNumber, language, unknown0)",
    typeIndex: 21,
    verification: "live-action",
    evidence: COMMON_EVIDENCE,
  },
  SkipCinematic: {
    exportName: "__gwca_msg_send_abort_cinematic",
    functionIndex: 7768,
    functionName: "Cinematic::MsgSendAbortRequest()",
    message: {
      fields: ["opcode"],
      opcode: 0x63,
      size: 0x04,
    },
    rawWasmSignature: "() -> nil",
    signature: "void()",
    typeIndex: 4,
    verification: "live-action",
    evidence: COMMON_EVIDENCE,
  },
  EnterChallenge: {
    exportName: "__gwca_party_select_challenge_mission",
    functionIndex: 10577,
    functionName: "PartyCliSelectMission(int)",
    rawWasmSignature: "(i32) -> nil",
    requiresPropContext: true,
    signature: "void(identifier)",
    typeIndex: 0,
    verification: "live-action",
    evidence: COMMON_EVIDENCE,
  },
  CancelEnterChallenge: {
    exportName: "__gwca_party_cancel_enter_challenge",
    functionIndex: 10574,
    functionName: "PartyCliRedirectCancel()",
    rawWasmSignature: "() -> nil",
    requiresPropContext: true,
    signature: "void()",
    typeIndex: 4,
    verification: "live-action",
    evidence: COMMON_EVIDENCE,
  },
});

export const GUILD_INTERNAL_CALLS = defineGroup("Guild", {
  LeaveGH: {
    address: "ram:80389377",
    exportName: "__gwca_msg_send_travel_mission_login",
    functionIndex: 10633,
    functionName: "PartyClient::MsgSendTravelMissionLogin(int)",
    message: {
      fields: ["opcode", "unknown0"],
      opcode: 0xb2,
      size: 0x08,
    },
    rawWasmSignature: "(i32) -> nil",
    signature: "void(unknown0)",
    typeIndex: 0,
    verification: "live-action",
    evidence: COMMON_EVIDENCE,
  },
  TravelGH: {
    address: "ram:803892bd",
    exportName: "__gwca_msg_send_travel_guild_hall",
    functionIndex: 10631,
    functionName: "PartyClient::MsgSendTravelGuildHall(Guid const&, int)",
    message: {
      fields: ["opcode", "guid[4]", "unknown0"],
      opcode: 0xb0,
      size: 0x18,
    },
    rawWasmSignature: "(i32, i32) -> nil",
    signature: "void(ghKeyPtr, unknown0)",
    typeIndex: 2,
    verification: "live-action",
    evidence: COMMON_EVIDENCE,
  },
});

export const PARTY_INTERNAL_CALLS = defineGroup("Party", {
  AddHenchman: {
    address: "ram:80388d1b",
    exportName: "__gwca_msg_send_invite_henchman",
    functionIndex: 10610,
    functionName: "PartyClient::MsgSendInviteHenchman(unsigned int)",
    message: { fields: ["opcode", "agentId"], opcode: 0x9f, size: 0x08 },
    rawWasmSignature: "(i32) -> nil",
    signature: "void(agentId)",
    typeIndex: 0,
    verification: "live-action",
    evidence: COMMON_EVIDENCE,
  },
  AddHero: {
    address: "ram:802bf6da",
    exportName: "__gwca_msg_send_hero_activate",
    functionIndex: 6872,
    functionName: "CharMsgSendHeroActivate(EHero)",
    message: { fields: ["opcode", "heroId"], opcode: 0x1e, size: 0x08 },
    rawWasmSignature: "(i32) -> nil",
    signature: "void(heroId)",
    typeIndex: 0,
    verification: "live-action",
    evidence: COMMON_EVIDENCE,
  },
  LockPetTarget: {
    address: "ram:802bf4c0",
    exportName: "__gwca_msg_send_command_ai_priority_target",
    functionIndex: 6865,
    functionName:
      "CharMsgSendCommandAiPriorityTarget(unsigned long, unsigned long)",
    message: {
      fields: ["opcode", "agentId", "targetAgentId"],
      opcode: 0x16,
      size: 0x0c,
    },
    rawWasmSignature: "(i32, i32) -> nil",
    signature: "void(agentId, targetAgentId)",
    typeIndex: 2,
    verification: "static-tested",
    evidence: COMMON_EVIDENCE,
  },
  SetHeroBehavior: {
    address: "ram:802bf477",
    exportName: "__gwca_msg_send_command_ai_mode",
    functionIndex: 6864,
    functionName: "CharMsgSendCommandAiMode(unsigned long, ECharAiMode)",
    message: {
      fields: ["opcode", "agentId", "behavior"],
      opcode: 0x15,
      size: 0x0c,
    },
    rawWasmSignature: "(i32, i32) -> nil",
    signature: "void(agentId, behavior)",
    typeIndex: 2,
    verification: "static-tested",
    evidence: COMMON_EVIDENCE,
  },
  KickHenchman: {
    address: "ram:80388f2d",
    exportName: "__gwca_msg_send_remove_henchman",
    functionIndex: 10618,
    functionName: "PartyClient::MsgSendRemoveHenchman(unsigned int)",
    message: { fields: ["opcode", "agentId"], opcode: 0xa8, size: 0x08 },
    rawWasmSignature: "(i32) -> nil",
    signature: "void(agentId)",
    typeIndex: 0,
    verification: "live-action",
    evidence: COMMON_EVIDENCE,
  },
  KickAllHeroes: {
    address: "ram:802bf71c",
    exportName: "__gwca_msg_send_hero_deactivate",
    functionIndex: 6873,
    functionName: "CharMsgSendHeroDeactivate(EHero)",
    message: { fields: ["opcode", "heroId"], opcode: 0x1f, size: 0x08 },
    rawWasmSignature: "(i32) -> nil",
    signature: "void(0x26)",
    typeIndex: 0,
    verification: "live-action",
    evidence: COMMON_EVIDENCE,
  },
  KickHero: {
    address: "ram:802bf71c",
    exportName: "__gwca_msg_send_hero_deactivate",
    functionIndex: 6873,
    functionName: "CharMsgSendHeroDeactivate(EHero)",
    message: { fields: ["opcode", "heroId"], opcode: 0x1f, size: 0x08 },
    rawWasmSignature: "(i32) -> nil",
    signature: "void(heroId)",
    typeIndex: 0,
    verification: "live-action",
    evidence: COMMON_EVIDENCE,
  },
  InvitePlayer: {
    address: "ram:80388d5e",
    exportName: "__gwca_msg_send_invite_member",
    functionIndex: 10611,
    functionName: "PartyClient::MsgSendInviteMember(unsigned int)",
    message: { fields: ["opcode", "playerId"], opcode: 0xa0, size: 0x08 },
    rawWasmSignature: "(i32) -> nil",
    signature: "void(playerId)",
    typeIndex: 0,
    verification: "live-action",
    evidence: COMMON_EVIDENCE,
  },
  InvitePlayerByName: {
    address: "ram:80388da1",
    exportName: "__gwca_msg_send_invite_member_by_name",
    functionIndex: 10612,
    functionName: "PartyClient::MsgSendInviteMemberByName(wchar_t const*)",
    message: { fields: ["opcode", "name[20]"], opcode: 0xa1, size: 0x2c },
    rawWasmSignature: "(i32) -> nil",
    signature: "void(nameAddress)",
    typeIndex: 0,
    verification: "live-action",
    evidence: COMMON_EVIDENCE,
  },
  CancelPartyInvite: {
    address: "ram:80388786",
    exportName: "__gwca_party_cancel_invitation",
    functionIndex: 10561,
    functionName: "PartyCliCancelInvitation(unsigned int)",
    mode: "partyClientWrapper",
    rawWasmSignature: "(i32) -> nil",
    requiresPropContext: true,
    signature: "void(partyId)",
    typeIndex: 0,
    verification: "live-action",
    evidence: COMMON_EVIDENCE,
  },
  KickPlayer: {
    address: "ram:80388f70",
    exportName: "__gwca_msg_send_remove_member",
    functionIndex: 10619,
    functionName: "PartyClient::MsgSendRemoveMember(unsigned int)",
    message: { fields: ["opcode", "playerId"], opcode: 0xa9, size: 0x08 },
    rawWasmSignature: "(i32) -> nil",
    signature: "void(playerId)",
    typeIndex: 0,
    verification: "live-action",
    evidence: COMMON_EVIDENCE,
  },
  SearchParty: {
    address: "ram:80388fb3",
    exportName: "__gwca_msg_send_search_begin",
    functionIndex: 10620,
    functionName:
      "PartyClient::MsgSendSearchBeginRequest(EPartySearchMode, wchar_t const*, unsigned int)",
    message: {
      fields: ["opcode", "searchType", "advertisement[32]", "unknown0"],
      opcode: 0xaa,
      size: 0x4c,
    },
    rawWasmSignature: "(i32, i32, i32) -> nil",
    signature: "void(searchType, advertisementAddress, unknown0)",
    typeIndex: 5,
    verification: "static-tested",
    evidence: COMMON_EVIDENCE,
  },
  SearchPartyCancel: {
    address: "ram:8038900f",
    exportName: "__gwca_msg_send_search_end",
    functionIndex: 10621,
    functionName: "PartyClient::MsgSendSearchEndRequest()",
    message: { fields: ["opcode"], opcode: 0xab, size: 0x04 },
    rawWasmSignature: "() -> nil",
    signature: "void()",
    typeIndex: 4,
    verification: "static-tested",
    evidence: COMMON_EVIDENCE,
  },
  SearchInviteCancel: {
    address: "ram:8038e90e",
    exportName: "__gwca_party_search_invite_cancel",
    functionIndex: 10733,
    functionName: "PartyClient::CSearchTable::InviteCancel(unsigned int)",
    rawWasmSignature: "(i32, i32) -> nil",
    signature: "void(searchTable, partySearchId)",
    typeIndex: 2,
    verification: "static-verified",
    evidence: COMMON_EVIDENCE,
  },
  LeaveParty: {
    address: "ram:805c138c",
    exportName: "__gwca_party_button_on_click",
    functionIndex: 16298,
    functionName: "IUi::Game::Party::CPartyButtonFrame::OnClick(int)",
    mode: "uiCallback",
    rawWasmSignature: "(i32, i32) -> nil",
    requiresPropContext: true,
    signature: "void(buttonContext, notifyParent)",
    typeIndex: 2,
    verification: "live-action",
    evidence: COMMON_EVIDENCE,
  },
  ReturnToOutpost: {
    address: "ram:80388914",
    exportName: "__gwca_party_select_offer",
    functionIndex: 10579,
    functionName: "PartyCliSelectOffer()",
    mode: "partyClientWrapper",
    rawWasmSignature: "() -> nil",
    requiresPropContext: true,
    signature: "void()",
    typeIndex: 4,
    verification: "static-tested",
    evidence: COMMON_EVIDENCE,
  },
  RespondToPartyRequestAccept: {
    address: "ram:80388dec",
    exportName: "__gwca_msg_send_invite_accept",
    functionIndex: 10613,
    functionName: "PartyClient::MsgSendInviteAccept(unsigned int)",
    message: { fields: ["opcode", "partyId"], opcode: 0x9c, size: 0x08 },
    rawWasmSignature: "(i32) -> nil",
    signature: "void(partyId)",
    typeIndex: 0,
    verification: "live-action",
    evidence: COMMON_EVIDENCE,
  },
  RespondToPartyRequestDecline: {
    address: "ram:80388e72",
    exportName: "__gwca_msg_send_invite_decline",
    functionIndex: 10615,
    functionName: "PartyClient::MsgSendInviteDecline(unsigned int)",
    message: { fields: ["opcode", "partyId"], opcode: 0x9e, size: 0x08 },
    rawWasmSignature: "(i32) -> nil",
    signature: "void(partyId)",
    typeIndex: 0,
    verification: "live-action",
    evidence: COMMON_EVIDENCE,
  },
  SetHardMode: {
    address: "ram:80389237",
    exportName: "__gwca_msg_send_hard_mode_set",
    functionIndex: 10629,
    functionName: "PartyClient::MsgSendHardModeSet(int)",
    message: { fields: ["opcode", "enabled"], opcode: 0x9b, size: 0x08 },
    rawWasmSignature: "(i32) -> nil",
    signature: "void(enabled)",
    typeIndex: 0,
    verification: "live-action",
    evidence: COMMON_EVIDENCE,
  },
  Tick: {
    address: "ram:8038927a",
    exportName: "__gwca_msg_send_signal",
    functionIndex: 10630,
    functionName: "PartyClient::MsgSendSignal(int)",
    message: { fields: ["opcode", "enabled"], opcode: 0xaf, size: 0x08 },
    rawWasmSignature: "(i32) -> nil",
    signature: "void(enabled)",
    typeIndex: 0,
    verification: "live-action",
    evidence: COMMON_EVIDENCE,
  },
});

export const TEXT_INTERNAL_CALLS = defineGroup("Text", {
  Decode: {
    exportName: "__gwca_text_resolve_issue",
    functionIndex: 5864,
    functionName:
      "TextResolveIssue(wchar_t const*, void (*)(void*, wchar_t const*), void*)",
    rawWasmSignature: "(i32, i32, i32) -> nil",
    requiresPropContext: true,
    signature: "void(encodedAddress, callbackIndex, callbackParam)",
    typeIndex: 5,
    verification: "live-action",
    evidence: COMMON_EVIDENCE,
  },
  GetHeroCodedName: {
    exportName: "__gwca_char_get_coded_name",
    functionIndex: 9107,
    functionName: "CharCliAgentGetCodedName(unsigned long)",
    rawWasmSignature: "(i32) -> i32",
    requiresPropContext: true,
    signature: "wchar_t*(agentId)",
    typeIndex: 12,
    verification: "live-action",
    evidence: COMMON_EVIDENCE,
  },
});

export const INTERNAL_CALL_GROUPS = Object.freeze({
  Guild: GUILD_INTERNAL_CALLS,
  Map: MAP_INTERNAL_CALLS,
  Party: PARTY_INTERNAL_CALLS,
  Player: PLAYER_INTERNAL_CALLS,
  Text: TEXT_INTERNAL_CALLS,
});

export function getInternalCallDefinitions(manager) {
  return INTERNAL_CALL_GROUPS[manager] || Object.freeze({});
}

export function listInternalCallDefinitions() {
  return Object.values(INTERNAL_CALL_GROUPS).flatMap((group) =>
    Object.values(group)
  );
}

export function findInternalCallDefinition(query) {
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return (
    listInternalCallDefinitions().find((definition) =>
      [
        definition.id,
        definition.exportName,
        definition.functionName,
        String(definition.functionIndex ?? ""),
      ].some((value) => String(value || "").toLowerCase() === normalized)
    ) || null
  );
}
