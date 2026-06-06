import { InstanceType } from "../Include/GWCA/Constants/Constants.js";

export const MAP_TEST_MESSAGE = Object.freeze({
  LoadMapContext: 0x10000098,
  StartMapLoad: 0x100000c2,
});

export const MAP_TEST_PHASE = Object.freeze({
  Idle: 0,
  Wait0: 1,
  Wait1: 2,
  Run: 3,
  Wait2: 4,
  Done: 5,
  Stop: 6,
});

const MAP_TEST_TICK_MS = 16;
const MAP_TEST_SETTLE_MS = 100;
const MAP_TEST_DEFAULT_LOADING_TIMEOUT_MS = 15000;

function normalizeUnsigned(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number >>> 0 : fallback;
}

function normalizeInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function createInitialState() {
  return {
    active: false,
    altMapId: 0,
    baselineMapContextAddress: 0,
    count: 1,
    delayMs: 0,
    failureReason: null,
    loadingSince: 0,
    loadingTimeoutMs: MAP_TEST_DEFAULT_LOADING_TIMEOUT_MS,
    mapId: 0,
    maxTries: 1,
    messageId: MAP_TEST_MESSAGE.LoadMapContext,
    number: 2,
    phase: MAP_TEST_PHASE.Idle,
    seen: false,
    status: "idle",
    t0: 0,
    t1: 0,
    t2: 0,
    timeoutMs: 10000,
    tries: 0,
  };
}

function isLoading(snapshot) {
  return snapshot?.instanceType === InstanceType.Loading;
}

export function createMapTestController(options) {
  const global = options.global || globalThis;
  const now =
    typeof options.now === "function"
      ? options.now
      : () => global.performance?.now?.() ?? Date.now();
  const readSnapshot = options.readSnapshot;
  const sendTravel = options.sendTravel;
  const isCurrent =
    typeof options.isCurrent === "function" ? options.isCurrent : () => true;
  const schedule =
    options.schedule ||
    ((callback, delay) => global.setTimeout(callback, delay));
  const cancel =
    options.cancel || ((handle) => global.clearTimeout(handle));
  const tickMs = normalizeUnsigned(options.tickMs, MAP_TEST_TICK_MS);

  const state = createInitialState();
  let timer = null;
  let previousSnapshot = null;

  function setPhase(phase, status) {
    state.phase = phase;
    state.status = status;
  }

  function cancelTick() {
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
  }

  function scheduleTick() {
    cancelTick();
    if (!state.active) {
      return;
    }
    timer = schedule(tick, tickMs);
  }

  function getSnapshot() {
    const snapshot = readSnapshot?.() || {};
    return {
      instanceType: normalizeInteger(
        snapshot.instanceType,
        InstanceType.Loading
      ),
      mapContextAddress: normalizeUnsigned(snapshot.mapContextAddress, 0),
      mapId: normalizeUnsigned(snapshot.mapId, 0),
    };
  }

  function sendAnchorTravel() {
    return sendTravel?.(
      state.mapId,
      normalizeInteger(options.getRegion?.(), 0),
      0,
      normalizeInteger(options.getLanguage?.(), 0)
    );
  }

  function step0() {
    state.tries += 1;
    state.t0 = 0;
    state.t1 = 0;
    state.t2 = 0;
    state.loadingSince = 0;
    state.seen = false;
    previousSnapshot = getSnapshot();
    state.baselineMapContextAddress =
      previousSnapshot.mapContextAddress || 0;
    if (sendAnchorTravel() === false) {
      state.active = false;
      state.failureReason = "anchor-travel-failed";
      setPhase(MAP_TEST_PHASE.Stop, "stop");
      return;
    }
    setPhase(MAP_TEST_PHASE.Wait0, "wait0");
  }

  function step1(currentTime) {
    for (let index = 0; index < state.count; index += 1) {
      if (sendTravel?.(state.altMapId, 0, state.number, 0) === false) {
        state.active = false;
        state.failureReason = "alternate-travel-failed";
        setPhase(MAP_TEST_PHASE.Stop, "stop");
        return;
      }
    }
    state.t1 = currentTime;
    state.t2 = 0;
    state.loadingSince = 0;
    state.seen = false;
    setPhase(MAP_TEST_PHASE.Run, "run");
  }

  function sawLoadMapContext(snapshot) {
    if (snapshot.mapId !== state.mapId || !snapshot.mapContextAddress) {
      return false;
    }
    return snapshot.mapContextAddress !== state.baselineMapContextAddress;
  }

  function sawStartMapLoad(snapshot) {
    if (snapshot.mapId !== state.mapId) {
      return false;
    }
    return (
      sawLoadMapContext(snapshot) ||
      previousSnapshot?.mapId !== state.mapId ||
      (isLoading(snapshot) && !isLoading(previousSnapshot))
    );
  }

  function sawConfiguredAnchor(snapshot) {
    if (state.messageId === MAP_TEST_MESSAGE.LoadMapContext) {
      return sawLoadMapContext(snapshot);
    }
    if (state.messageId === MAP_TEST_MESSAGE.StartMapLoad) {
      return sawStartMapLoad(snapshot);
    }
    return false;
  }

  function runPhase(currentTime, snapshot) {
    switch (state.phase) {
      case MAP_TEST_PHASE.Wait0:
        if (sawConfiguredAnchor(snapshot)) {
          state.t0 = currentTime;
          setPhase(MAP_TEST_PHASE.Wait1, "wait1");
        }
        break;
      case MAP_TEST_PHASE.Wait1:
        if (currentTime - state.t0 >= state.delayMs) {
          step1(currentTime);
        }
        break;
      case MAP_TEST_PHASE.Run:
        if (snapshot.mapId === state.mapId && !isLoading(snapshot)) {
          state.seen = true;
        }
        if (snapshot.mapId !== state.mapId && !isLoading(snapshot)) {
          state.t2 = 0;
          setPhase(MAP_TEST_PHASE.Wait2, "wait2");
          break;
        }
        if (currentTime - state.t1 <= state.timeoutMs) {
          break;
        }
        if (
          state.seen &&
          snapshot.mapId === state.mapId &&
          !isLoading(snapshot)
        ) {
          state.active = false;
          setPhase(MAP_TEST_PHASE.Done, "done");
          break;
        }
        state.t2 = 0;
        setPhase(MAP_TEST_PHASE.Wait2, "wait2");
        break;
      case MAP_TEST_PHASE.Wait2:
        if (isLoading(snapshot)) {
          if (!state.loadingSince) {
            state.loadingSince = currentTime;
          } else if (
            currentTime - state.loadingSince >= state.loadingTimeoutMs
          ) {
            state.active = false;
            state.failureReason = "loading-timeout";
            setPhase(MAP_TEST_PHASE.Stop, "stop");
          }
          break;
        }
        state.loadingSince = 0;
        if (!state.t2) {
          state.t2 = currentTime;
          break;
        }
        if (currentTime - state.t2 >= MAP_TEST_SETTLE_MS) {
          if (state.maxTries && state.tries >= state.maxTries) {
            state.active = false;
            state.failureReason = "max-tries-reached";
            setPhase(MAP_TEST_PHASE.Stop, "stop");
            break;
          }
          step0();
        }
        break;
      default:
        break;
    }
  }

  function tick() {
    timer = null;
    if (!state.active) {
      return;
    }
    if (!isCurrent()) {
      state.active = false;
      setPhase(MAP_TEST_PHASE.Stop, "stop");
      return;
    }

    const snapshot = getSnapshot();
    runPhase(now(), snapshot);
    previousSnapshot = snapshot;
    scheduleTick();
  }

  return Object.freeze({
    getCount() {
      return state.tries;
    },
    getState() {
      return { ...state };
    },
    getStatus() {
      return state.status;
    },
    isActive() {
      return state.active;
    },
    refuse(reason = "unsafe-opt-in-required") {
      cancelTick();
      Object.assign(state, createInitialState(), {
        failureReason: reason,
        phase: MAP_TEST_PHASE.Stop,
        status: "stop",
      });
      return false;
    },
    start(
      mapId,
      altMapId,
      number = 2,
      count = 1,
      delayMs = 0,
      timeoutMs = 10000,
      messageId = MAP_TEST_MESSAGE.LoadMapContext,
      maxTries = 1,
      loadingTimeoutMs = MAP_TEST_DEFAULT_LOADING_TIMEOUT_MS
    ) {
      const normalizedMapId = normalizeUnsigned(mapId, 0);
      const normalizedAltMapId = normalizeUnsigned(altMapId, 0);
      if (!normalizedMapId || !normalizedAltMapId) {
        return false;
      }

      cancelTick();
      Object.assign(state, createInitialState(), {
        active: true,
        altMapId: normalizedAltMapId,
        count: normalizeUnsigned(count, 1),
        delayMs: normalizeUnsigned(delayMs, 0),
        loadingTimeoutMs: normalizeUnsigned(
          loadingTimeoutMs,
          MAP_TEST_DEFAULT_LOADING_TIMEOUT_MS
        ),
        mapId: normalizedMapId,
        maxTries: normalizeUnsigned(maxTries, 1),
        messageId: normalizeUnsigned(
          messageId,
          MAP_TEST_MESSAGE.LoadMapContext
        ),
        number: normalizeInteger(number, 2),
        timeoutMs: normalizeUnsigned(timeoutMs, 10000),
      });
      step0();
      scheduleTick();
      return true;
    },
    stop() {
      cancelTick();
      state.active = false;
      state.failureReason = "stopped";
      setPhase(MAP_TEST_PHASE.Stop, "stop");
    },
    tick,
  });
}
