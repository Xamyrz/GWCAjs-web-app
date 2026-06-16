import { GUILD_INTERNAL_CALLS } from "../Evidence/InternalCalls.js";
import { createInternalCallRuntime } from "./InternalCallRuntime.js";

export function createGuildInternals(state) {
  const runtime = createInternalCallRuntime(state, GUILD_INTERNAL_CALLS, {
    defaultMode: "messageFunction",
  });

  function withGuildHallKey(key, callback) {
    const words = Array.isArray(key?.words) ? key.words : null;
    if (!words || words.length < 4 || !words.some(Boolean)) {
      return {
        called: false,
        internalFunction: runtime.getInternalFunction("TravelGH"),
        reason: "A non-empty GHKey is required.",
      };
    }

    const temporaryBuffers = state?.memory?.temporaryBuffers;
    if (!temporaryBuffers) {
      return {
        called: false,
        internalFunction: runtime.getInternalFunction("TravelGH"),
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
    ...runtime,
    leaveGuildHall() {
      return runtime.call("LeaveGH", [1]).called === true;
    },
    travelGuildHall(key, unknown0 = 0) {
      const normalizedUnknown0 = Number.isInteger(unknown0) ? unknown0 : 0;
      const result = withGuildHallKey(key, (address) =>
        runtime.call("TravelGH", [address, normalizedUnknown0])
      );
      return result.called === true;
    },
  });
}
