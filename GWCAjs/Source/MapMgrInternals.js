import { MAP_INTERNAL_CALLS } from "../Evidence/InternalCalls.js";
import { createInternalCallRuntime } from "./InternalCallRuntime.js";

const MAP_ID_COUNT = 0x36d;

export function createMapInternals(state) {
  const runtime = createInternalCallRuntime(state, MAP_INTERNAL_CALLS);

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

        const callResult = runtime.call("QueryAltitude", [
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
        internalFunction: runtime.getInternalFunction("QueryAltitude"),
        ok: false,
        reason: "QueryAltitude call failed.",
        terrainNormal: null,
      };
    }
  }

  return Object.freeze({
    ...runtime,
    queryAltitude,
    selectChallengeMission(identifier = MAP_ID_COUNT) {
      return runtime.call("EnterChallenge", [identifier]).called === true;
    },
  });
}
