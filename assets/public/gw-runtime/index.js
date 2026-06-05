import { createMapModule } from "./modules/map.js";
import { createPlayerModule } from "./modules/player.js";
import { createWorldModule } from "./modules/world.js";
import { CHARACTER_NAME_STORAGE_KEY, createResolver } from "./resolver.js";
import {
  DEFAULT_BUILD_ID,
  findBuildSignatures,
  listRegisteredBuilds,
} from "./signatures.js";
import { createVersionApi } from "./version.js";

export function createGWRuntime(global) {
  if (global.GW) {
    return global.GW;
  }
  if (!global.GWHook) {
    throw new Error("GWHook must be installed before GW runtime");
  }

  const hook = global.GWHook;
  const version = createVersionApi(hook);
  const runtime = {
    captured: null,
    hook,
    map: null,
    player: null,
    world: null,
    ready: null,
    resolver: null,
    signatures: null,
    version,
  };

  const resolver = createResolver(runtime, { version });
  runtime.resolver = resolver;
  runtime.map = createMapModule(runtime);
  runtime.player = createPlayerModule(runtime);
  runtime.world = createWorldModule(runtime);
  runtime.signatures = Object.freeze({
    clearCharacterName() {
      try {
        global.localStorage?.removeItem(CHARACTER_NAME_STORAGE_KEY);
      } catch (error) {
        return false;
      }
      return true;
    },
    defaultBuildId: DEFAULT_BUILD_ID,
    find(buildId, aliases) {
      return findBuildSignatures(buildId, aliases);
    },
    getCharacterName() {
      try {
        return global.localStorage?.getItem(CHARACTER_NAME_STORAGE_KEY) ?? null;
      } catch (error) {
        return null;
      }
    },
    listRegisteredBuilds,
    mergeBuild: resolver.mergeBuild,
    registerBuild: resolver.registerBuild,
    setCharacterName(name) {
      if (typeof name !== "string" || !name.trim()) {
        throw new Error("Character name must be a non-empty string");
      }
      global.localStorage?.setItem(CHARACTER_NAME_STORAGE_KEY, name.trim());
      return name.trim();
    },
  });
  runtime.captured = hook.captured.then(() => runtime);
  runtime.ready = hook.ready.then(() => runtime);

  runtime.describe = function describe(options = {}) {
    return {
      build: version.describe(),
      map: runtime.map.describe(options),
      player: runtime.player.describe(options),
      world: runtime.world.describe(options),
      registeredBuilds: listRegisteredBuilds(),
    };
  };

  return Object.freeze(runtime);
}

export function installGWRuntime(global = globalThis) {
  const runtime = createGWRuntime(global);
  global.GW = runtime;
  return runtime;
}
