import * as GWCA from "/GWCAjs/Source/GWCA.js";

function install(global = globalThis) {
  if (global.GWCAjs) {
    return global.GWCAjs;
  }

  const api = Object.freeze({
    get Map() {
      return GWCA.getMapManager();
    },
    get Player() {
      return GWCA.getPlayerManager();
    },
    describe: GWCA.describe,
    disableHooks: GWCA.disableHooks,
    enableHooks: GWCA.enableHooks,
    getState: GWCA.getState,
    initialize: GWCA.initialize,
    isInitialized: GWCA.isInitialized,
    terminate: GWCA.terminate,
  });

  global.GWCAjs = api;
  return api;
}

install(globalThis);
