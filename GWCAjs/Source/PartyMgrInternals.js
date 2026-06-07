const INTERNAL_FUNCTIONS = Object.freeze({
  AddHenchman: Object.freeze({
    address: "ram:80388d1b",
    callable: false,
    exportName: "__gwca_msg_send_invite_henchman",
    functionName: "PartyClient::MsgSendInviteHenchman(unsigned int)",
    functionIndex: 10610,
    message: Object.freeze({
      opcode: 0x9f,
      size: 0x08,
      fields: Object.freeze(["opcode", "agentId"]),
    }),
    reason:
      "Experimental: lower-level henchman invitation sender patched into the runtime exports.",
    rawWasmSignature: "(i32) -> nil",
    signature: "void(agentId)",
  }),
  AddHero: Object.freeze({
    address: "ram:802bf6da",
    callable: false,
    exportName: "__gwca_msg_send_hero_activate",
    functionName: "CharMsgSendHeroActivate(EHero)",
    functionIndex: 6872,
    message: Object.freeze({
      opcode: 0x1e,
      size: 0x08,
      fields: Object.freeze(["opcode", "heroId"]),
    }),
    reason:
      "Experimental: lower-level hero activation sender patched into the runtime exports.",
    rawWasmSignature: "(i32) -> nil",
    signature: "void(heroId)",
  }),
  KickHenchman: Object.freeze({
    address: "ram:80388f2d",
    callable: false,
    exportName: "__gwca_msg_send_remove_henchman",
    functionName: "PartyClient::MsgSendRemoveHenchman(unsigned int)",
    functionIndex: 10618,
    message: Object.freeze({
      opcode: 0xa8,
      size: 0x08,
      fields: Object.freeze(["opcode", "agentId"]),
    }),
    reason:
      "Experimental: lower-level henchman removal sender patched into the runtime exports.",
    rawWasmSignature: "(i32) -> nil",
    signature: "void(agentId)",
  }),
  KickAllHeroes: Object.freeze({
    address: "ram:802bf71c",
    callable: false,
    exportName: "__gwca_msg_send_hero_deactivate",
    functionName: "CharMsgSendHeroDeactivate(EHero)",
    functionIndex: 6873,
    message: Object.freeze({
      opcode: 0x1f,
      size: 0x08,
      fields: Object.freeze(["opcode", "heroId"]),
    }),
    reason:
      "Experimental: hero deactivation sender using GWCA's all-heroes sentinel.",
    rawWasmSignature: "(i32) -> nil",
    signature: "void(0x26)",
  }),
  KickHero: Object.freeze({
    address: "ram:802bf71c",
    callable: false,
    exportName: "__gwca_msg_send_hero_deactivate",
    functionName: "CharMsgSendHeroDeactivate(EHero)",
    functionIndex: 6873,
    message: Object.freeze({
      opcode: 0x1f,
      size: 0x08,
      fields: Object.freeze(["opcode", "heroId"]),
    }),
    reason:
      "Experimental: lower-level hero deactivation sender patched into the runtime exports.",
    rawWasmSignature: "(i32) -> nil",
    signature: "void(heroId)",
  }),
  InvitePlayer: Object.freeze({
    address: "ram:80388d5e",
    callable: false,
    exportName: "__gwca_msg_send_invite_member",
    functionName: "PartyClient::MsgSendInviteMember(unsigned int)",
    functionIndex: 10611,
    message: Object.freeze({
      opcode: 0xa0,
      size: 0x08,
      fields: Object.freeze(["opcode", "playerId"]),
    }),
    reason:
      "Experimental: lower-level numeric party invitation sender patched into the runtime exports.",
    rawWasmSignature: "(i32) -> nil",
    signature: "void(playerId)",
  }),
  InvitePlayerByName: Object.freeze({
    address: "ram:80388da1",
    callable: false,
    exportName: "__gwca_msg_send_invite_member_by_name",
    functionName: "PartyClient::MsgSendInviteMemberByName(wchar_t const*)",
    functionIndex: 10612,
    message: Object.freeze({
      opcode: 0xa1,
      size: 0x2c,
      fields: Object.freeze(["opcode", "name[20]"]),
    }),
    reason:
      "Experimental: lower-level named party invitation sender patched into the runtime exports.",
    rawWasmSignature: "(i32) -> nil",
    signature: "void(nameAddress)",
  }),
  CancelPartyInvite: Object.freeze({
    address: "ram:80388786",
    callable: false,
    exportName: "__gwca_party_cancel_invitation",
    functionName: "PartyCliCancelInvitation(unsigned int)",
    functionIndex: 10561,
    mode: "partyClientWrapper",
    reason:
      "Experimental: party-client sent-invite cancellation wrapper patched into the runtime exports.",
    requiresPropContext: true,
    rawWasmSignature: "(i32) -> nil",
    signature: "void(partyId)",
  }),
  KickPlayer: Object.freeze({
    address: "ram:80388f70",
    callable: false,
    exportName: "__gwca_msg_send_remove_member",
    functionName: "PartyClient::MsgSendRemoveMember(unsigned int)",
    functionIndex: 10619,
    message: Object.freeze({
      opcode: 0xa9,
      size: 0x08,
      fields: Object.freeze(["opcode", "playerId"]),
    }),
    reason:
      "Experimental: lower-level party-member removal sender patched into the runtime exports.",
    rawWasmSignature: "(i32) -> nil",
    signature: "void(playerId)",
  }),
  LeaveParty: Object.freeze({
    address: "ram:805c138c",
    callable: false,
    exportName: "__gwca_party_button_on_click",
    functionName: "IUi::Game::Party::CPartyButtonFrame::OnClick(int)",
    functionIndex: 16298,
    mode: "uiCallback",
    reason:
      "Experimental: exact party-window Leave callback path patched into the runtime exports.",
    requiresPropContext: true,
    rawWasmSignature: "(i32, i32) -> nil",
    signature: "void(buttonContext, notifyParent)",
  }),
  RespondToPartyRequestAccept: Object.freeze({
    address: "ram:80388dec",
    callable: false,
    exportName: "__gwca_msg_send_invite_accept",
    functionName: "PartyClient::MsgSendInviteAccept(unsigned int)",
    functionIndex: 10613,
    message: Object.freeze({
      opcode: 0x9c,
      size: 0x08,
      fields: Object.freeze(["opcode", "partyId"]),
    }),
    reason:
      "Experimental: lower-level party invitation acceptance sender patched into the runtime exports.",
    rawWasmSignature: "(i32) -> nil",
    signature: "void(partyId)",
  }),
  RespondToPartyRequestDecline: Object.freeze({
    address: "ram:80388e72",
    callable: false,
    exportName: "__gwca_msg_send_invite_decline",
    functionName: "PartyClient::MsgSendInviteDecline(unsigned int)",
    functionIndex: 10615,
    message: Object.freeze({
      opcode: 0x9e,
      size: 0x08,
      fields: Object.freeze(["opcode", "partyId"]),
    }),
    reason:
      "Experimental: lower-level party invitation decline sender patched into the runtime exports.",
    rawWasmSignature: "(i32) -> nil",
    signature: "void(partyId)",
  }),
  SetHardMode: Object.freeze({
    address: "ram:80389237",
    callable: false,
    exportName: "__gwca_msg_send_hard_mode_set",
    functionName: "PartyClient::MsgSendHardModeSet(int)",
    functionIndex: 10629,
    message: Object.freeze({
      opcode: 0x9b,
      size: 0x08,
      fields: Object.freeze(["opcode", "enabled"]),
    }),
    reason:
      "Experimental: lower-level hard-mode packet sender patched into the runtime exports.",
    rawWasmSignature: "(i32) -> nil",
    signature: "void(enabled)",
  }),
  Tick: Object.freeze({
    address: "ram:8038927a",
    callable: false,
    exportName: "__gwca_msg_send_signal",
    functionName: "PartyClient::MsgSendSignal(int)",
    functionIndex: 10630,
    message: Object.freeze({
      opcode: 0xaf,
      size: 0x08,
      fields: Object.freeze(["opcode", "enabled"]),
    }),
    reason:
      "Experimental: lower-level ready-status packet sender patched into the runtime exports.",
    rawWasmSignature: "(i32) -> nil",
    signature: "void(enabled)",
  }),
});

const PARTY_BUTTON_CONTEXT_SIZE = 0x38;
const PARTY_BUTTON_MODE_OFFSET = 0x34;
const PARTY_BUTTON_MODE_LEAVE = 1;
const PROP_CONTEXT_SLOT_ADDRESS = 0x28b680;

function getRawExports(state) {
  if (typeof state?.hook?.getRawExports !== "function") {
    return null;
  }
  try {
    return state.hook.getRawExports();
  } catch (error) {
    return null;
  }
}

function isCallable(state, value) {
  const exportsObject = getRawExports(state);
  return !!(
    value?.exportName &&
    exportsObject &&
    typeof exportsObject[value.exportName] === "function"
  );
}

function cloneFunctionInfo(state, value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const callable = isCallable(state, value);
  return {
    ...value,
    callable,
    exportAvailable: callable,
    reason: callable
      ? "Export patched into the runtime; call semantics still need in-game verification."
      : value.reason,
  };
}

export function createPartyInternals(state) {
  function getActivePropContextAddress() {
    const anchoredAddress = state?.anchors?.gameplayContextAddress || 0;
    if (anchoredAddress) {
      return anchoredAddress >>> 0;
    }
    if (typeof state?.scanner?.tryResolveAddress === "function") {
      return (
        state.scanner.tryResolveAddress("modules.gameplay.contextAddress") || 0
      ) >>> 0;
    }
    return 0;
  }

  function withPropContext(callback) {
    if (
      typeof state?.hook?.readU32 !== "function" ||
      typeof state?.hook?.writeU32 !== "function"
    ) {
      return callback();
    }
    const propContextAddress = getActivePropContextAddress();
    if (!propContextAddress) {
      return callback();
    }

    const previous = state.hook.readU32(PROP_CONTEXT_SLOT_ADDRESS) || 0;
    state.hook.writeU32(PROP_CONTEXT_SLOT_ADDRESS, propContextAddress);
    try {
      return callback();
    } finally {
      state.hook.writeU32(PROP_CONTEXT_SLOT_ADDRESS, previous);
    }
  }

  function getInternalFunction(name) {
    return cloneFunctionInfo(state, INTERNAL_FUNCTIONS[name]);
  }

  function getActionStatus(name) {
    const internalFunction = getInternalFunction(name);
    return {
      available: internalFunction?.callable === true,
      internalFunction,
      mode: internalFunction?.callable
        ? internalFunction.mode || "messageFunction"
        : "unavailable",
      reason:
        internalFunction?.reason ||
        "No internal party function metadata is available.",
    };
  }

  function call(name, args) {
    const info = INTERNAL_FUNCTIONS[name];
    const internalFunction = getInternalFunction(name);
    if (!info?.exportName) {
      return {
        called: false,
        internalFunction,
        reason: "Unknown internal function.",
      };
    }
    if (
      !internalFunction?.callable ||
      typeof state?.hook?.callExport !== "function"
    ) {
      return {
        called: false,
        internalFunction,
        reason: "Internal function export is not available in this runtime.",
      };
    }

    try {
      return {
        called: true,
        internalFunction,
        result: info.requiresPropContext
          ? withPropContext(() => state.hook.callExport(info.exportName, ...args))
          : state.hook.callExport(info.exportName, ...args),
      };
    } catch (error) {
      return {
        called: false,
        error: error instanceof Error ? error.message : String(error),
        internalFunction,
        reason: "Internal function call failed.",
      };
    }
  }

  return Object.freeze({
    call,
    callMessage(name, args) {
      return call(name, args).called === true;
    },
    getActionStatus,
    getActionStatuses() {
      return Object.fromEntries(
        Object.keys(INTERNAL_FUNCTIONS).map((name) => [
          name,
          getActionStatus(name),
        ])
      );
    },
    getInternalFunction,
    getInternalFunctions() {
      return Object.fromEntries(
        Object.entries(INTERNAL_FUNCTIONS).map(([name, value]) => [
          name,
          cloneFunctionInfo(state, value),
        ])
      );
    },
    setHardMode(enabled) {
      return call("SetHardMode", [enabled ? 1 : 0]).called === true;
    },
    addHenchman(agentId) {
      return call("AddHenchman", [agentId]).called === true;
    },
    addHero(heroId) {
      return call("AddHero", [heroId]).called === true;
    },
    kickHenchman(agentId) {
      return call("KickHenchman", [agentId]).called === true;
    },
    kickAllHeroes() {
      return call("KickAllHeroes", [0x26]).called === true;
    },
    kickHero(heroId) {
      return call("KickHero", [heroId]).called === true;
    },
    invitePlayer(playerId) {
      return call("InvitePlayer", [playerId]).called === true;
    },
    invitePlayerByName(name) {
      if (typeof state?.hook?.withUtf16 !== "function") {
        return false;
      }
      try {
        return state.hook.withUtf16(name, (nameAddress) =>
          call("InvitePlayerByName", [nameAddress]).called === true
        );
      } catch (error) {
        return false;
      }
    },
    cancelPartyInvite(partyId) {
      return call("CancelPartyInvite", [partyId]).called === true;
    },
    kickPlayer(playerId) {
      return call("KickPlayer", [playerId]).called === true;
    },
    leaveParty() {
      if (
        typeof state?.hook?.withAllocation !== "function" ||
        typeof state?.hook?.writeU32 !== "function"
      ) {
        return false;
      }
      try {
        return state.hook.withAllocation(
          PARTY_BUTTON_CONTEXT_SIZE,
          (contextAddress) => {
            for (
              let offset = 0;
              offset < PARTY_BUTTON_CONTEXT_SIZE;
              offset += 4
            ) {
              state.hook.writeU32(contextAddress + offset, 0);
            }
            state.hook.writeU32(
              contextAddress + PARTY_BUTTON_MODE_OFFSET,
              PARTY_BUTTON_MODE_LEAVE
            );
            return call("LeaveParty", [contextAddress, 0]).called === true;
          }
        );
      } catch (error) {
        return false;
      }
    },
    tick(enabled) {
      return call("Tick", [enabled ? 1 : 0]).called === true;
    },
    respondToPartyRequest(partyId, accept) {
      const name = accept
        ? "RespondToPartyRequestAccept"
        : "RespondToPartyRequestDecline";
      return call(name, [partyId]).called === true;
    },
  });
}
