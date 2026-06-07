const INTERNAL_FUNCTIONS = Object.freeze({
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
  });
}
