function compact(values) {
  return values.filter(
    (value, index) =>
      typeof value === "string" &&
      value.trim() &&
      values.indexOf(value) === index
  );
}

export function createVersionApi(hook) {
  function getBuildInfo() {
    return typeof hook.getBuildInfo === "function" ? hook.getBuildInfo() : null;
  }

  function getBuildId() {
    const buildInfo = getBuildInfo();
    return buildInfo ? buildInfo.wasmBuildId || buildInfo.buildId : null;
  }

  function getLookupKeys() {
    const buildInfo = getBuildInfo();
    if (!buildInfo) {
      return [];
    }
    return compact([
      buildInfo.wasmBuildId,
      buildInfo.buildId,
      buildInfo.debugFile ? "debug:" + buildInfo.debugFile : null,
      buildInfo.loader ? "loader:" + buildInfo.loader : null,
    ]);
  }

  function describe() {
    const buildInfo = getBuildInfo();
    if (!buildInfo) {
      return null;
    }
    return {
      buildId: buildInfo.wasmBuildId || buildInfo.buildId,
      capturedAt: buildInfo.capturedAt,
      debugFile: buildInfo.debugFile,
      exportCount: buildInfo.exportCount,
      importCount: buildInfo.importCount,
      loader: buildInfo.loader,
      memoryPageCount: buildInfo.memoryPageCount,
      runtimeInitialized: buildInfo.runtimeInitialized,
      tableLength: buildInfo.tableLength,
      wasmBuildId: buildInfo.wasmBuildId,
    };
  }

  return Object.freeze({
    describe,
    getBuildId,
    getBuildInfo,
    getLookupKeys,
    async waitForCaptured() {
      await hook.captured;
      return getBuildInfo();
    },
    async waitForReady() {
      await hook.ready;
      return getBuildInfo();
    },
  });
}
