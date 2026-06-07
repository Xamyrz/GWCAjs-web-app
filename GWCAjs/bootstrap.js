import * as GWCA from "/GWCAjs/Source/GWCA.js";

function install(global = globalThis) {
  if (global.GWCAjs) {
    return global.GWCAjs;
  }

  const api = Object.freeze({
    get Context() {
      return GWCA.getContextManager();
    },
    get context() {
      return GWCA.getContextManager();
    },
    get Map() {
      return GWCA.getMapManager();
    },
    get map() {
      return GWCA.getMapManager();
    },
    get Guild() {
      return GWCA.getGuildManager();
    },
    get guild() {
      return GWCA.getGuildManager();
    },
    get Party() {
      return GWCA.getPartyManager();
    },
    get party() {
      return GWCA.getPartyManager();
    },
    get Player() {
      return GWCA.getPlayerManager();
    },
    get player() {
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
