import { createModule } from "./stdafx.js";

export function enableHooks(state) {
  state.hooksEnabled = true;
  return true;
}

export function disableHooks(state) {
  state.hooksEnabled = false;
  return true;
}

export const HookBaseModule = createModule("Hooker", async function initModule(
  state
) {
  state.hooksEnabled = false;
  return {
    browserManaged: true,
    hooksEnabled: state.hooksEnabled,
  };
});
