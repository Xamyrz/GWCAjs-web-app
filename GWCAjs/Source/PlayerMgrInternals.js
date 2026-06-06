const INTERNAL_FUNCTIONS = Object.freeze({
  ChangeSecondProfession: Object.freeze({
    address: "ram:80c50e1e",
    callable: false,
    calls: "SendOrderSetProfessionSecondary",
    disabled: true,
    exportName: "__gwca_change_second_profession",
    functionName: "CharCliProfSetSecondary(unsigned long, ECharProfession)",
    functionIndex: 9265,
    reason:
      "Disabled: exporting the containing WASM function enters the wrong asyncify/prologue path.",
    rawWasmSignature: "(i32, i32, i32, i32) -> nil",
    signature: "void(agentId, profession)",
  }),
  DepositFaction: Object.freeze({
    address: "ram:80c4c3a0",
    callable: false,
    calls: "SendOrderGuildAdjustFaction",
    disabled: true,
    exportName: "__gwca_deposit_faction",
    functionName:
      "CharCliPlayerOrderGuildAdjustFaction(unsigned int, ECharFaction, unsigned int)",
    functionIndex: 9222,
    reason:
      "Disabled: exporting the containing WASM function enters the wrong asyncify/prologue path.",
    rawWasmSignature: "(i32, f32, i32, i32, i32) -> nil",
    signature: "void(always0, allegiance, amount)",
  }),
  GetTitleData: Object.freeze({
    address: "ram:818b4f92",
    callable: false,
    dataAddress: 0x276f60,
    functionName: "ConstGetTitleClientData(ETitle)",
    functionIndex: 17415,
    reason: "Read directly from its resolved linear-memory data table.",
    rawWasmSignature: "(i32) -> nil",
    signature: "TitleClientData*(titleId)",
  }),
  RemoveActiveTitle: Object.freeze({
    address: "ram:80c501af",
    callable: false,
    calls: "SendSetTitleNone",
    disabled: true,
    exportName: "__gwca_remove_active_title",
    functionName: "CharCliPlayerSetTitleNone()",
    functionIndex: 9253,
    reason:
      "Disabled: exporting the containing WASM function enters the wrong asyncify/prologue path.",
    rawWasmSignature: "(i32) -> i32",
    signature: "void()",
  }),
  SetActiveTitle: Object.freeze({
    address: "ram:80c500f6",
    callable: false,
    calls: "SendSetTitle",
    disabled: true,
    exportName: "__gwca_set_active_title",
    functionName: "CharCliPlayerSetTitle(unsigned int)",
    functionIndex: 9252,
    reason:
      "Disabled: exporting the containing WASM function enters the wrong asyncify/prologue path.",
    rawWasmSignature: "(i32) -> i32",
    signature: "void(titleId)",
  }),
  SendOrderGuildAdjustFaction: Object.freeze({
    address: "ram:80a148d6",
    callable: false,
    exportName: "__gwca_msg_send_order_guild_adjust_faction",
    functionName:
      "CharMsgSendOrderGuildAdjustFaction(unsigned int, ECharFaction, unsigned int)",
    functionIndex: 6893,
    message: Object.freeze({
      opcode: 0x35,
      size: 0x10,
      fields: Object.freeze(["opcode", "always0", "allegiance", "amount"]),
    }),
    reason:
      "Experimental: lower-level message sender patched into the runtime exports.",
    rawWasmSignature: "(i32, i32, i32) -> nil",
    signature: "void(always0, allegiance, amount)",
  }),
  SendOrderSetProfessionSecondary: Object.freeze({
    address: "ram:80a15825",
    callable: false,
    exportName: "__gwca_msg_send_order_set_profession_secondary",
    functionName:
      "CharMsgSendOrderSetProfessionSecondary(unsigned long, ECharProfession)",
    functionIndex: 6903,
    message: Object.freeze({
      opcode: 0x41,
      size: 0x0c,
      fields: Object.freeze(["opcode", "agentId", "profession"]),
    }),
    reason:
      "Experimental: lower-level message sender patched into the runtime exports.",
    rawWasmSignature: "(i32, i32) -> nil",
    signature: "void(agentId, profession)",
  }),
  SendSetTitle: Object.freeze({
    address: "ram:80a19238",
    callable: false,
    exportName: "__gwca_msg_send_set_title",
    functionName: "CharMsgSendSetTitle(unsigned int)",
    functionIndex: 6924,
    message: Object.freeze({
      opcode: 0x58,
      size: 0x08,
      fields: Object.freeze(["opcode", "titleId"]),
    }),
    reason:
      "Experimental: lower-level message sender patched into the runtime exports.",
    rawWasmSignature: "(i32) -> nil",
    signature: "void(titleId)",
  }),
  SendSetTitleNone: Object.freeze({
    address: "ram:80a1938b",
    callable: false,
    exportName: "__gwca_msg_send_set_title_none",
    functionName: "CharMsgSendSetTitleNone()",
    functionIndex: 6925,
    message: Object.freeze({
      opcode: 0x59,
      size: 0x04,
      fields: Object.freeze(["opcode"]),
    }),
    reason:
      "Experimental: lower-level message sender patched into the runtime exports.",
    rawWasmSignature: "() -> nil",
    signature: "void()",
  }),
});

const ACTION_NOTES = Object.freeze({
  ChangeSecondProfession:
    "The CharCli wrapper is disabled; using the lower-level SendOrderSetProfessionSecondary target.",
  DepositFaction:
    "The CharCli wrapper is disabled; using the lower-level SendOrderGuildAdjustFaction target.",
  RemoveActiveTitle:
    "The CharCli wrapper is disabled; using the lower-level SendSetTitleNone target.",
  SetActiveTitle:
    "The CharCli wrapper is disabled; using the lower-level SendSetTitle target.",
});

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
  if (value?.disabled) {
    return false;
  }
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

export function createPlayerInternals(state) {
  function getInternalFunction(name) {
    return cloneFunctionInfo(state, INTERNAL_FUNCTIONS[name]);
  }

  function getInternalFunctions() {
    return Object.fromEntries(
      Object.entries(INTERNAL_FUNCTIONS).map(([name, value]) => [
        name,
        cloneFunctionInfo(state, value),
      ])
    );
  }

  function getActionStatus(name) {
    const internalFunction = getInternalFunction(name);
    const messageFunction = internalFunction?.calls
      ? getInternalFunction(internalFunction.calls)
      : null;
    const directAvailable = internalFunction?.callable === true;
    const messageAvailable = messageFunction?.callable === true;
    const available = directAvailable || messageAvailable;

    return {
      available,
      directAvailable,
      internalFunction,
      messageAvailable,
      messageFunction,
      mode: messageAvailable
        ? "messageFunction"
        : directAvailable
          ? "directFunction"
          : "unavailable",
      reason: available
        ? messageAvailable && internalFunction?.disabled
          ? ACTION_NOTES[name] || "Using lower-level message function."
          : "Callable export is available."
        : internalFunction?.reason ||
          ACTION_NOTES[name] ||
          "Not implemented for the WASM runtime yet.",
    };
  }

  function call(name, args) {
    const info = INTERNAL_FUNCTIONS[name];
    const internalFunction = cloneFunctionInfo(state, info);
    if (!info?.exportName) {
      return {
        called: false,
        internalFunction,
        reason: "Unknown internal function.",
      };
    }
    if (info.disabled) {
      return {
        called: false,
        internalFunction,
        reason: info.reason,
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
        result: state.hook.callExport(info.exportName, ...args),
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
        Object.keys(ACTION_NOTES).map((name) => [name, getActionStatus(name)])
      );
    },
    getInternalFunction,
    getInternalFunctions,
  });
}
