const INTERNAL_FUNCTIONS = Object.freeze({
  QueryAltitude: Object.freeze({
    callable: false,
    exportName: "__gwca_map_query_altitude",
    functionName:
      "MapQueryAltitude(MapPoint const&, float, float*, Coord3f*)",
    functionIndex: 5557,
    reason:
      "Experimental: patched into the runtime exports; uses temporary WASM argument and output storage.",
    requiresPropContext: true,
    rawWasmSignature: "(i32, f32, i32, i32) -> i32",
    signature: "int(MapPoint*, radius, float*, Coord3f*)",
  }),
  Travel: Object.freeze({
    callable: false,
    exportName: "__gwca_msg_send_travel_mission",
    functionName:
      "PartyClient::MsgSendTravelMission(EMission, ETerritory, unsigned int, ELanguage, int)",
    functionIndex: 10632,
    message: Object.freeze({
      opcode: 0xb1,
      size: 0x18,
      fields: Object.freeze([
        "opcode",
        "mapId",
        "region",
        "districtNumber",
        "language",
        "unknown0",
      ]),
    }),
    reason:
      "Experimental: lower-level message sender patched into the runtime exports.",
    rawWasmSignature: "(i32, i32, i32, i32, i32) -> nil",
    signature: "void(mapId, region, districtNumber, language, unknown0)",
  }),
  SkipCinematic: Object.freeze({
    callable: false,
    exportName: "__gwca_msg_send_abort_cinematic",
    functionName: "Cinematic::MsgSendAbortRequest()",
    functionIndex: 7768,
    message: Object.freeze({
      opcode: 0x63,
      size: 0x04,
      fields: Object.freeze(["opcode"]),
    }),
    reason:
      "Experimental: lower-level message sender patched into the runtime exports.",
    rawWasmSignature: "() -> nil",
    signature: "void()",
  }),
  EnterChallenge: Object.freeze({
    callable: false,
    exportName: "__gwca_party_select_challenge_mission",
    functionName: "PartyCliSelectMission(int)",
    functionIndex: 10577,
    reason:
      "Experimental: current JSPI wrapper for selecting the challenge mission path.",
    requiresPropContext: true,
    rawWasmSignature: "(i32) -> nil",
    signature: "void(identifier)",
  }),
  CancelEnterChallenge: Object.freeze({
    callable: false,
    exportName: "__gwca_party_cancel_enter_challenge",
    functionName: "PartyCliRedirectCancel()",
    functionIndex: 10574,
    reason:
      "Experimental: current JSPI party redirect cancel wrapper.",
    requiresPropContext: true,
    rawWasmSignature: "() -> nil",
    signature: "void()",
  }),
});

const MAP_ID_COUNT = 0x36d;
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

export function createMapInternals(state) {
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
      mode: internalFunction?.callable ? "directFunction" : "unavailable",
      reason:
        internalFunction?.reason ||
        "No internal map function metadata is available.",
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

  function queryAltitude(point, radius = 0, options = {}) {
    const includeTerrainNormal = options.includeTerrainNormal !== false;
    try {
      const temporaryBuffers = state?.memory?.temporaryBuffers;
      if (!temporaryBuffers) {
        throw new Error("Temporary buffer pool is not available");
      }
      const bufferSize = includeTerrainNormal ? 36 : 20;
      return temporaryBuffers.withBuffer(bufferSize, (lease) => {
        const pointAddress = lease.address;
        const altitudeAddress = pointAddress + 16;
        const normalAddress = includeTerrainNormal ? pointAddress + 20 : 0;

        state.hook.writeF32(pointAddress, point.x);
        state.hook.writeF32(pointAddress + 4, point.y);
        state.hook.writeF32(pointAddress + 8, point.z || 0);
        if (normalAddress) {
          state.hook.writeF32(normalAddress + 8, -1);
        }

        const callResult = call("QueryAltitude", [
          pointAddress,
          Number(radius) || 0,
          altitudeAddress,
          normalAddress,
        ]);
        if (!callResult.called) {
          return {
            ...callResult,
            altitude: 0,
            ok: false,
            terrainNormal: null,
          };
        }

        const altitude = state.hook.readF32(altitudeAddress);
        return {
          ...callResult,
          altitude,
          ok: callResult.result !== 0,
          terrainNormal: normalAddress
            ? {
                x: state.hook.readF32(normalAddress),
                y: state.hook.readF32(normalAddress + 4),
                z: state.hook.readF32(normalAddress + 8),
              }
            : null,
        };
      });
    } catch (error) {
      return {
        altitude: 0,
        called: false,
        error: error instanceof Error ? error.message : String(error),
        internalFunction: getInternalFunction("QueryAltitude"),
        ok: false,
        reason: "QueryAltitude call failed.",
        terrainNormal: null,
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
    getInternalFunction(name) {
      return getInternalFunction(name);
    },
    getInternalFunctions() {
      return Object.fromEntries(
        Object.entries(INTERNAL_FUNCTIONS).map(([name, value]) => [
          name,
          cloneFunctionInfo(state, value),
        ])
      );
    },
    queryAltitude,
    selectChallengeMission(identifier = MAP_ID_COUNT) {
      return call("EnterChallenge", [identifier]).called === true;
    },
  });
}
