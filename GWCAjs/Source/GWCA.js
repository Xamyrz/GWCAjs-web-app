import { debugLog } from "./Debug.js";
import { ContextModule } from "./Context.js";
import { GameThreadModule } from "./GameThreadMgr.js";
import { GuildModule } from "./GuildMgr.js";
import { disableHooks as disableHookBase, enableHooks as enableHookBase, HookBaseModule } from "./Hooker.js";
import { MapModule } from "./MapMgr.js";
import { MemoryModule } from "./MemoryMgr.js";
import { PlayerModule } from "./PlayerMgr.js";
import { RenderModule } from "./RenderMgr.js";
import { ScannerModule } from "./Scanner.js";
import { asHex, getHook } from "./stdafx.js";
import { UIModule } from "./UIMgr.js";

const modules = [
  MemoryModule,
  ScannerModule,
  ContextModule,
  HookBaseModule,
  GameThreadModule,
  RenderModule,
  UIModule,
  MapModule,
  GuildModule,
  PlayerModule,
];

function createState() {
  return {
    anchors: {},
    build: null,
    buildId: null,
    context: null,
    error: null,
    hook: null,
    hooksEnabled: false,
    guild: null,
    initialized: false,
    initializing: null,
    lookupKeys: [],
    map: null,
    memory: null,
    modules: {},
    player: null,
    scanner: null,
    signatures: null,
    ui: null,
  };
}

export const state = createState();

function clearState(options = {}) {
  const { preserveInitializing = false } = options;
  const pending = state.initializing;
  try {
    state.memory?.temporaryBuffers?.dispose?.();
  } catch (error) {
    debugLog("temporary buffer disposal failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const next = createState();
  for (const key of Object.keys(next)) {
    state[key] = next[key];
  }
  if (preserveInitializing) {
    state.initializing = pending;
  }
}

function describeModuleResults() {
  return Object.fromEntries(
    Object.entries(state.modules).map(([name, value]) => [
      name,
      {
        initialized: !!value?.initialized,
        result: value?.result ?? null,
      },
    ])
  );
}

function describeCapture() {
  if (!state.hook || typeof state.hook.getCaptureState !== "function") {
    return null;
  }
  const capture = state.hook.getCaptureState();
  return {
    hasInstance: !!state.hook.instance,
    hasMemory: !!state.hook.memory,
    runtimeInitialized: !!capture?.runtimeInitialized,
  };
}

function buildResult(reused = false) {
  return {
    anchors: {
      baseContextTableAddress: asHex(
        state.anchors.baseContextTableAddress || 0
      ),
      basePtrAddress: asHex(state.anchors.basePtrAddress || 0),
      charContextAddress: asHex(state.anchors.charContextAddress || 0),
      contextSlotAddress: asHex(state.anchors.contextSlotAddress || 0),
      gameplayContextAddress: asHex(state.anchors.gameplayContextAddress || 0),
      mapContextAddress: asHex(state.anchors.mapContextAddress || 0),
      worldContextAddress: asHex(state.anchors.worldContextAddress || 0),
    },
    build: state.build,
    buildId: state.buildId,
    capture: describeCapture(),
    context: state.context?.api?.Describe
      ? state.context.api.Describe()
      : null,
    hooksEnabled: state.hooksEnabled,
    guild: state.guild?.api?.Describe ? state.guild.api.Describe() : null,
    initialized: state.initialized,
    map: state.map?.api?.Describe ? state.map.api.Describe() : null,
    modules: describeModuleResults(),
    player: state.player || null,
    reused,
  };
}

export async function initialize(global = globalThis) {
  if (state.initialized) {
    return buildResult(true);
  }
  if (state.initializing) {
    return state.initializing;
  }

  state.initializing = (async () => {
    clearState({ preserveInitializing: true });
    try {
      const hook = getHook(global);
      state.hook = hook;

      await hook.captured;
      await hook.ready;

      for (const module of modules) {
        debugLog("initializing module", module.name);
        const result = await module.initModule(state, global);
        state.modules[module.name] = {
          initialized: true,
          result: result ?? null,
        };
      }

      enableHookBase(state);
      state.initialized = true;
      state.error = null;
      return buildResult(false);
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      state.initializing = null;
    }
  })();

  return state.initializing;
}

export function enableHooks() {
  enableHookBase(state);
  return state.hooksEnabled;
}

export function disableHooks() {
  disableHookBase(state);
  return state.hooksEnabled;
}

export function terminate() {
  disableHookBase(state);
  clearState();
}

export function isInitialized() {
  return state.initialized;
}

export function getState() {
  return {
    anchors: { ...state.anchors },
    build: state.build,
    buildId: state.buildId,
    capture: describeCapture(),
    error: state.error,
    hooksEnabled: state.hooksEnabled,
    initialized: state.initialized,
    lookupKeys: state.lookupKeys.slice(),
    modules: describeModuleResults(),
  };
}

export function describe() {
  return buildResult(false);
}

export function getMapManager() {
  return state.map?.api || null;
}

export function getGuildManager() {
  return state.guild?.api || null;
}

export function getContextManager() {
  return state.context?.api || null;
}

export function getPlayerManager() {
  return state.player?.api || null;
}
