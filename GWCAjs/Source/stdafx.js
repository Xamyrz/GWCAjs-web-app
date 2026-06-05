export function asHex(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return "0x" + (value >>> 0).toString(16);
}

export function getGlobal(global = globalThis) {
  return global;
}

export function getHook(global = globalThis) {
  const hook = global.GWHook;
  if (!hook) {
    throw new Error("GWHook is not installed");
  }
  return hook;
}

export function getRuntime(global = globalThis) {
  return global.GW || null;
}

export function createModule(name, initModule) {
  return Object.freeze({
    initModule,
    name,
  });
}
