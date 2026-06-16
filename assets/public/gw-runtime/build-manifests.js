function defineExportPatch(
  name,
  functionIndex,
  typeIndex,
  owner,
  verification = "live-action"
) {
  return Object.freeze({
    functionIndex,
    name,
    owner,
    typeIndex,
    verification,
  });
}

const BUILD_38615_JSPI_EXPORT_PATCHES = Object.freeze([
  defineExportPatch(
    "__gwca_msg_send_order_guild_adjust_faction",
    6893,
    5,
    "Player.DepositFaction"
  ),
  defineExportPatch(
    "__gwca_msg_send_order_set_profession_secondary",
    6903,
    2,
    "Player.ChangeSecondProfession"
  ),
  defineExportPatch(
    "__gwca_msg_send_set_title",
    6924,
    0,
    "Player.SetActiveTitle"
  ),
  defineExportPatch(
    "__gwca_msg_send_set_title_none",
    6925,
    4,
    "Player.RemoveActiveTitle"
  ),
  defineExportPatch(
    "__gwca_map_query_altitude",
    5557,
    109,
    "Map.QueryAltitude"
  ),
  defineExportPatch(
    "__gwca_party_select_challenge_mission",
    10577,
    0,
    "Map.EnterChallenge"
  ),
  defineExportPatch(
    "__gwca_party_cancel_enter_challenge",
    10574,
    4,
    "Map.CancelEnterChallenge"
  ),
  defineExportPatch(
    "__gwca_msg_send_travel_mission",
    10632,
    21,
    "Map.Travel"
  ),
  defineExportPatch(
    "__gwca_msg_send_abort_cinematic",
    7768,
    4,
    "Map.SkipCinematic"
  ),
  defineExportPatch(
    "__gwca_msg_send_travel_guild_hall",
    10631,
    2,
    "Guild.TravelGH"
  ),
  defineExportPatch(
    "__gwca_msg_send_travel_mission_login",
    10633,
    0,
    "Guild.LeaveGH"
  ),
  defineExportPatch(
    "__gwca_party_button_on_click",
    16298,
    2,
    "Party.LeaveParty"
  ),
  defineExportPatch(
    "__gwca_party_select_offer",
    10579,
    4,
    "Party.ReturnToOutpost",
    "static-tested"
  ),
  defineExportPatch(
    "__gwca_msg_send_command_ai_mode",
    6864,
    2,
    "Party.SetHeroBehavior",
    "static-tested"
  ),
  defineExportPatch(
    "__gwca_msg_send_command_ai_priority_target",
    6865,
    2,
    "Party.LockPetTarget",
    "static-tested"
  ),
  defineExportPatch(
    "__gwca_msg_send_hero_activate",
    6872,
    0,
    "Party.AddHero"
  ),
  defineExportPatch(
    "__gwca_msg_send_hero_deactivate",
    6873,
    0,
    "Party.KickHero"
  ),
  defineExportPatch(
    "__gwca_msg_send_invite_henchman",
    10610,
    0,
    "Party.AddHenchman"
  ),
  defineExportPatch(
    "__gwca_msg_send_invite_member",
    10611,
    0,
    "Party.InvitePlayer"
  ),
  defineExportPatch(
    "__gwca_msg_send_invite_member_by_name",
    10612,
    0,
    "Party.InvitePlayerByName"
  ),
  defineExportPatch(
    "__gwca_msg_send_invite_accept",
    10613,
    0,
    "Party.RespondToPartyRequestAccept"
  ),
  defineExportPatch(
    "__gwca_msg_send_invite_decline",
    10615,
    0,
    "Party.RespondToPartyRequestDecline"
  ),
  defineExportPatch(
    "__gwca_party_cancel_invitation",
    10561,
    0,
    "Party.CancelPartyInvite"
  ),
  defineExportPatch(
    "__gwca_msg_send_remove_henchman",
    10618,
    0,
    "Party.KickHenchman"
  ),
  defineExportPatch(
    "__gwca_msg_send_remove_member",
    10619,
    0,
    "Party.KickPlayer"
  ),
  defineExportPatch(
    "__gwca_msg_send_search_begin",
    10620,
    5,
    "Party.SearchParty",
    "static-tested"
  ),
  defineExportPatch(
    "__gwca_msg_send_search_end",
    10621,
    4,
    "Party.SearchPartyCancel",
    "static-tested"
  ),
  defineExportPatch(
    "__gwca_party_search_invite_cancel",
    10733,
    2,
    "Party.SearchInviteCancel",
    "static-verified"
  ),
  defineExportPatch(
    "__gwca_msg_send_hard_mode_set",
    10629,
    0,
    "Party.SetHardMode"
  ),
  defineExportPatch(
    "__gwca_msg_send_signal",
    10630,
    0,
    "Party.Tick"
  ),
  defineExportPatch(
    "__gwca_text_resolve_issue",
    5864,
    5,
    "Text.Decode"
  ),
  defineExportPatch(
    "__gwca_char_get_coded_name",
    9107,
    12,
    "Text.GetHeroCodedName"
  ),
]);

function defineManifest(definition) {
  return Object.freeze({
    ...definition,
    exportPatches: Object.freeze(definition.exportPatches.slice()),
    expected: Object.freeze({
      ...definition.expected,
      table: Object.freeze({ ...definition.expected.table }),
    }),
  });
}

export const BUILD_38615_JSPI_ID =
  "103f50bb0ce2d744bfbf88a91afce2328b";
export const BUILD_38615_WASM_ID =
  "10830b7275570948a0ac9c9ea6700b7a38";

const BUILD_MANIFESTS = new Map([
  [
    BUILD_38615_JSPI_ID,
    defineManifest({
      buildId: BUILD_38615_JSPI_ID,
      callbackTableReserve: 64,
      exportPatches: BUILD_38615_JSPI_EXPORT_PATCHES,
      gameBuild: 38615,
      variant: "jspi",
      expected: {
        definedFunctionCount: 17567,
        exportCount: 52,
        importedFunctionCount: 213,
        table: {
          count: 1,
          elementType: 0x70,
          initial: 4676,
          maximum: 4676,
        },
        typeCount: 218,
      },
    }),
  ],
  [
    BUILD_38615_WASM_ID,
    defineManifest({
      buildId: BUILD_38615_WASM_ID,
      callbackTableReserve: 64,
      exportPatches: [],
      gameBuild: 38615,
      variant: "standard",
      expected: {
        definedFunctionCount: 17619,
        exportCount: 104,
        importedFunctionCount: 213,
        table: {
          count: 1,
          elementType: 0x70,
          initial: 4676,
          maximum: 4676,
        },
        typeCount: 230,
      },
    }),
  ],
]);

export function getBuildManifest(buildId) {
  return typeof buildId === "string"
    ? BUILD_MANIFESTS.get(buildId) || null
    : null;
}

export function listBuildManifests() {
  return Array.from(BUILD_MANIFESTS.values());
}
