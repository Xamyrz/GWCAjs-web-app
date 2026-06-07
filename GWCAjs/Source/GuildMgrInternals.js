const INTERNAL_FUNCTIONS = Object.freeze({
  LeaveGH: Object.freeze({
    address: "ram:80389377",
    callable: false,
    exportName: "__gwca_msg_send_travel_mission_login",
    functionName: "PartyClient::MsgSendTravelMissionLogin(int)",
    functionIndex: 10633,
    message: Object.freeze({
      opcode: 0xb2,
      size: 0x08,
      fields: Object.freeze(["opcode", "unknown0"]),
    }),
    reason:
      "Experimental: lower-level message sender reached by the kLeaveGuildHall UI path.",
    rawWasmSignature: "(i32) -> nil",
    signature: "void(unknown0)",
  }),
  TravelGH: Object.freeze({
    address: "ram:803892bd",
    callable: false,
    exportName: "__gwca_msg_send_travel_guild_hall",
    functionName: "PartyClient::MsgSendTravelGuildHall(Guid const&, int)",
    functionIndex: 10631,
    message: Object.freeze({
      opcode: 0xb0,
      size: 0x18,
      fields: Object.freeze(["opcode", "guid[4]", "unknown0"]),
    }),
    reason:
      "Experimental: lower-level message sender reached by the kGuildHall UI path.",
    rawWasmSignature: "(i32, i32) -> nil",
    signature: "void(ghKeyPtr, unknown0)",
  }),
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

export function createGuildInternals(state) {
  function getInternalFunction(name) {
    return cloneFunctionInfo(state, INTERNAL_FUNCTIONS[name]);
  }

  function getActionStatus(name) {
    const internalFunction = getInternalFunction(name);
    return {
      available: internalFunction?.callable === true,
      internalFunction,
      mode: internalFunction?.callable ? "messageFunction" : "unavailable",
      reason:
        internalFunction?.reason ||
        "No internal guild function metadata is available.",
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

  function withGuildHallKey(key, callback) {
    const words = Array.isArray(key?.words) ? key.words : null;
    if (!words || words.length < 4 || !words.some(Boolean)) {
      return {
        called: false,
        internalFunction: getInternalFunction("TravelGH"),
        reason: "A non-empty GHKey is required.",
      };
    }

    const temporaryBuffers = state?.memory?.temporaryBuffers;
    if (!temporaryBuffers) {
      return {
        called: false,
        internalFunction: getInternalFunction("TravelGH"),
        reason: "Temporary buffer pool is not available.",
      };
    }

    return temporaryBuffers.withBuffer(16, (lease) => {
      for (let index = 0; index < 4; index += 1) {
        state.hook.writeU32(lease.address + index * 4, words[index] >>> 0);
      }
      return callback(lease.address);
    });
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
    leaveGuildHall() {
      return call("LeaveGH", [1]).called === true;
    },
    travelGuildHall(key, unknown0 = 0) {
      const normalizedUnknown0 = Number.isInteger(unknown0) ? unknown0 : 0;
      const result = withGuildHallKey(key, (address) =>
        call("TravelGH", [address, normalizedUnknown0])
      );
      return result.called === true;
    },
  });
}
