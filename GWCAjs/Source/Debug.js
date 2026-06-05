const DEBUG_STORAGE_KEY = "gwcajs.debug";

export function isDebugEnabled(global = globalThis) {
  try {
    const value = global.localStorage?.getItem(DEBUG_STORAGE_KEY);
    return value === "1" || value === "true";
  } catch (error) {
    return false;
  }
}

export function debugLog() {
  if (!isDebugEnabled(globalThis) || !globalThis.console?.debug) {
    return;
  }
  globalThis.console.debug("[GWCAjs]", ...arguments);
}
