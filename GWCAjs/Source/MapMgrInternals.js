const INTERNAL_FUNCTIONS = Object.freeze({
  QueryAltitude: Object.freeze({
    callable: false,
    functionName:
      "MapQueryAltitude(MapPoint const&, float, float*, Coord3f*)",
    reason:
      "Current-build function index and temporary WASM argument storage are not verified.",
  }),
  Travel: Object.freeze({
    callable: false,
    functionName:
      "PartyClient::MsgSendTravelMission(EMission, ETerritory, unsigned int, ELanguage, int)",
    message: Object.freeze({
      opcode: 0xb1,
      size: 0x18,
    }),
    reason:
      "Opcode and old-build body are known, but the current-build function index is not verified.",
  }),
  SkipCinematic: Object.freeze({
    callable: false,
    functionName: "Cinematic::MsgSendAbortRequest()",
    message: Object.freeze({
      opcode: 0x63,
      size: 0x04,
    }),
    reason:
      "Opcode and old-build body are known, but the current-build function index is not verified.",
  }),
  EnterChallenge: Object.freeze({
    callable: false,
    reason:
      "The browser runtime does not yet expose the native kSendEnterMission UI-message path.",
  }),
  CancelEnterChallenge: Object.freeze({
    callable: false,
    reason:
      "No verified current-build message function or UI-message path is exported.",
  }),
});

export function createMapInternals() {
  function getActionStatus(name) {
    const internalFunction = INTERNAL_FUNCTIONS[name] || null;
    return {
      available: internalFunction?.callable === true,
      internalFunction,
      mode: internalFunction?.callable ? "directFunction" : "unavailable",
      reason:
        internalFunction?.reason ||
        "No internal map function metadata is available.",
    };
  }

  return Object.freeze({
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
      return INTERNAL_FUNCTIONS[name] || null;
    },
    getInternalFunctions() {
      return { ...INTERNAL_FUNCTIONS };
    },
  });
}
