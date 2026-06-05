import { createModule } from "./stdafx.js";

export const GameThreadModule = createModule(
  "GameThreadMgr",
  async function initModule() {
    return {
      browserManaged: true,
      ready: true,
    };
  }
);
