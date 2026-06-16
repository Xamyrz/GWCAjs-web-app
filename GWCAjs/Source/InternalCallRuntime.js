const LEGACY_PROP_CONTEXT_SLOT_ADDRESS = 0x28b680;
const STATE_CORES = new WeakMap();

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function getRawExports(state) {
  try {
    return state?.hook?.getRawExports?.() || null;
  } catch (error) {
    return null;
  }
}

function getPatchStatus(state) {
  try {
    return (
      state?.hook?.getPatchStatus?.() ||
      state?.hook?.getBuildInfo?.()?.patchStatus ||
      null
    );
  } catch (error) {
    return null;
  }
}

function getGameplayContextAddress(state) {
  const anchored = state?.anchors?.gameplayContextAddress || 0;
  if (anchored) {
    return anchored >>> 0;
  }
  return (
    state?.scanner?.tryResolveAddress?.("modules.gameplay.contextAddress") || 0
  ) >>> 0;
}

function getPropContextSlotAddress(state) {
  return (
    state?.signatures?.modules?.player?.propContextTableSlotAddress ||
    LEGACY_PROP_CONTEXT_SLOT_ADDRESS
  ) >>> 0;
}

function parseWasmParameters(signature) {
  const match = /^\s*\(([^)]*)\)\s*->/.exec(signature || "");
  if (!match || !match[1].trim()) {
    return [];
  }
  return match[1].split(",").map((value) => value.trim());
}

function validateArguments(definition, args) {
  if (!Array.isArray(args)) {
    return "Internal call arguments must be an array.";
  }
  const parameters = parseWasmParameters(definition.rawWasmSignature);
  if (parameters.length !== args.length) {
    return (
      "Expected " +
      parameters.length +
      " arguments for " +
      definition.rawWasmSignature +
      ", got " +
      args.length +
      "."
    );
  }
  for (let index = 0; index < parameters.length; index += 1) {
    const type = parameters[index];
    const value = args[index];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return "Argument " + index + " must be a finite " + type + " value.";
    }
    if (
      (type === "i32" || type === "i64") &&
      !Number.isInteger(value)
    ) {
      return "Argument " + index + " must be an integer " + type + " value.";
    }
  }
  return null;
}

function createCore(state) {
  let propContextDepth = 0;
  let previousPropContext = 0;

  function withPropContext(callback) {
    const hook = state?.hook;
    if (
      typeof hook?.readU32 !== "function" ||
      typeof hook?.writeU32 !== "function"
    ) {
      throw new Error("PropContext memory access is unavailable.");
    }
    const contextAddress = getGameplayContextAddress(state);
    if (!contextAddress) {
      throw new Error("A validated PropContext root is unavailable.");
    }
    const slotAddress = getPropContextSlotAddress(state);
    if (!slotAddress) {
      throw new Error("The build has no PropContext slot address.");
    }

    if (propContextDepth === 0) {
      previousPropContext = hook.readU32(slotAddress) || 0;
      hook.writeU32(slotAddress, contextAddress);
    }
    propContextDepth += 1;
    try {
      return callback();
    } finally {
      propContextDepth -= 1;
      if (propContextDepth === 0) {
        hook.writeU32(slotAddress, previousPropContext);
        previousPropContext = 0;
      }
    }
  }

  return Object.freeze({
    getPatchStatus: () => getPatchStatus(state),
    withPropContext,
  });
}

function getCore(state) {
  if (!state || typeof state !== "object") {
    throw new TypeError("Internal-call runtime requires a state object.");
  }
  let core = STATE_CORES.get(state);
  if (!core) {
    core = createCore(state);
    STATE_CORES.set(state, core);
  }
  return core;
}

export function createInternalCallRuntime(state, definitions, options = {}) {
  const core = getCore(state);
  const actionNames = options.actionNames || Object.keys(definitions);
  const actionNotes = options.actionNotes || {};
  const defaultMode = options.defaultMode || "directFunction";

  function isCallable(definition) {
    if (!definition?.exportName || definition.disabled) {
      return false;
    }
    const patchStatus = core.getPatchStatus();
    if (patchStatus?.actionPatchesEnabled !== true) {
      return false;
    }
    const exportsObject = getRawExports(state);
    return !!(
      exportsObject &&
      typeof exportsObject[definition.exportName] === "function"
    );
  }

  function describeDefinition(definition) {
    if (!definition) {
      return null;
    }
    const callable = isCallable(definition);
    return {
      ...definition,
      callable,
      exportAvailable: callable,
    };
  }

  function getInternalFunction(name) {
    return describeDefinition(definitions[name]);
  }

  function getInternalFunctions() {
    return Object.fromEntries(
      Object.entries(definitions).map(([name, definition]) => [
        name,
        describeDefinition(definition),
      ])
    );
  }

  function getActionStatus(name) {
    const internalFunction = getInternalFunction(name);
    const targetName = internalFunction?.calls;
    const targetFunction = targetName
      ? getInternalFunction(targetName)
      : internalFunction;
    const available = targetFunction?.callable === true;
    const patchStatus = core.getPatchStatus();
    let reason =
      actionNotes[name] ||
      internalFunction?.reason ||
      targetFunction?.reason ||
      "Internal function export is unavailable.";
    if (!patchStatus) {
      reason = "Callable patches are disabled: patch status is unavailable.";
    } else if (patchStatus.actionPatchesEnabled !== true) {
      reason =
        "Callable patches are disabled: " +
        (patchStatus.reason || "manifest did not enable action patches") +
        ".";
    } else if (available) {
      reason =
        targetName && internalFunction?.disabled
          ? actionNotes[name] || "Using the verified lower-level call target."
          : "Verified callable export is available.";
    }
    return {
      available,
      directAvailable: internalFunction?.callable === true,
      internalFunction,
      messageAvailable: targetName ? targetFunction?.callable === true : false,
      messageFunction: targetName ? targetFunction : null,
      mode: available
        ? targetFunction?.mode ||
          (targetName ? "messageFunction" : defaultMode)
        : "unavailable",
      patchStatus,
      reason,
      targetFunction,
      targetName: targetName || name,
      verification:
        targetFunction?.verification || internalFunction?.verification || null,
    };
  }

  function call(name, args = []) {
    const definition = definitions[name];
    const internalFunction = describeDefinition(definition);
    if (!definition) {
      return {
        called: false,
        internalFunction: null,
        reason: "Unknown internal function.",
      };
    }
    if (definition.disabled) {
      return {
        called: false,
        internalFunction,
        reason: definition.reason || "Internal function is disabled.",
      };
    }
    if (!isCallable(definition) || typeof state?.hook?.callExport !== "function") {
      return {
        called: false,
        internalFunction,
        reason: getActionStatus(name).reason,
      };
    }
    const argumentError = validateArguments(definition, args);
    if (argumentError) {
      return {
        called: false,
        internalFunction,
        reason: argumentError,
      };
    }
    try {
      const invoke = () =>
        state.hook.callExport(definition.exportName, ...args);
      return {
        called: true,
        internalFunction,
        result: definition.requiresPropContext
          ? core.withPropContext(invoke)
          : invoke(),
      };
    } catch (error) {
      return {
        called: false,
        error: errorText(error),
        internalFunction,
        reason: "Internal function call failed.",
      };
    }
  }

  return Object.freeze({
    call,
    callMessage(name, args) {
      return call(name, args).called === true;
    },
    getActionStatus,
    getActionStatuses() {
      return Object.fromEntries(
        actionNames.map((name) => [name, getActionStatus(name)])
      );
    },
    getInternalFunction,
    getInternalFunctions,
    withPropContext: core.withPropContext,
  });
}
