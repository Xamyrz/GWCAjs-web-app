import { createModule } from "./stdafx.js";

export const RenderModule = createModule("RenderMgr", async function initModule() {
  return {
    browserManaged: true,
    ready: true,
  };
});
