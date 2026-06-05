import { createModule } from "./stdafx.js";

export const UIModule = createModule("UIMgr", async function initModule(state) {
  const snapshot =
    typeof state.hook?.getCaptureState === "function"
      ? state.hook.getCaptureState()
      : null;

  state.ui = Object.freeze({
    runtimeInitialized: !!snapshot?.runtimeInitialized,
  });

  return {
    runtimeInitialized: state.ui.runtimeInitialized,
  };
});
