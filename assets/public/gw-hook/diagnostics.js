(function installGWDiagnostics(global) {
  if (global.__GWDiagnostics__) {
    return;
  }

  const start = Date.now();
  const maxEntries = 200;

  const diagnostics = {
    actions: [],
    console: [],
    events: [],
    fetches: [],
    startedAt: start,
    windowErrors: [],
  };

  function push(collection, entry) {
    collection.push(entry);
    if (collection.length > maxEntries) {
      collection.splice(0, collection.length - maxEntries);
    }
  }

  function normalizeError(value) {
    if (value instanceof Error) {
      return {
        message: value.message,
        name: value.name,
        stack: value.stack || null,
      };
    }
    if (typeof value === "string") {
      return { message: value, name: "Error", stack: null };
    }
    if (value && typeof value === "object") {
      return {
        message: String(value.message || value.reason || value),
        name: String(value.name || "Error"),
        stack: typeof value.stack === "string" ? value.stack : null,
      };
    }
    return {
      message: String(value),
      name: "Error",
      stack: null,
    };
  }

  function safeClone(value) {
    if (typeof value === "string") {
      return value;
    }
    if (value instanceof Error) {
      return normalizeError(value);
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return String(value);
    }
  }

  function record(kind, payload) {
    push(diagnostics.events, {
      kind,
      payload,
      t: Date.now() - start,
    });
  }

  function formatInline(value) {
    const cloned = safeClone(value);
    const text =
      typeof cloned === "string"
        ? cloned
        : JSON.stringify(cloned, null, 2);
    return text.length > 900 ? text.slice(0, 897) + "..." : text;
  }

  function readDialogDetails() {
    const node = global.document?.getElementById("dialog-details-area");
    return node ? node.value : null;
  }

  function readLoadingText() {
    const node = global.document?.getElementById("loading-text");
    return node ? node.textContent : null;
  }

  function describeGW() {
    if (!global.GW) {
      return null;
    }

    try {
      return {
        build:
          typeof global.GW.version?.describe === "function"
            ? global.GW.version.describe()
            : null,
        map:
          global.GW.map && typeof global.GW.map.describe === "function"
            ? global.GW.map.describe({ resolve: false })
            : null,
      };
    } catch (error) {
      return {
        error: normalizeError(error),
      };
    }
  }

  function installConsoleHook(level) {
    if (!global.console || typeof global.console[level] !== "function") {
      return;
    }
    const original = global.console[level];
    global.console[level] = function wrappedConsole() {
      push(diagnostics.console, {
        args: Array.from(arguments).map(safeClone),
        level,
        t: Date.now() - start,
      });
      return original.apply(this, arguments);
    };
  }

  function installFetchHook() {
    if (typeof global.fetch !== "function") {
      return;
    }
    const originalFetch = global.fetch.bind(global);
    global.fetch = function wrappedFetch(input, init) {
      const startedAt = Date.now();
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input instanceof Request
              ? input.url
              : String(input);
      return originalFetch(input, init)
        .then(function onResponse(response) {
          push(diagnostics.fetches, {
            durationMs: Date.now() - startedAt,
            ok: response.ok,
            status: response.status,
            t: startedAt - start,
            url,
          });
          return response;
        })
        .catch(function onError(error) {
          push(diagnostics.fetches, {
            durationMs: Date.now() - startedAt,
            error: normalizeError(error),
            ok: false,
            status: 0,
            t: startedAt - start,
            url,
          });
          throw error;
        });
    };
  }

  function instrumentRequest(kind, request, extra) {
    if (!request || typeof request.addEventListener !== "function") {
      return request;
    }
    request.addEventListener("success", function onSuccess() {
      record(kind + "-success", extra || {});
    });
    request.addEventListener("error", function onError(event) {
      record(kind + "-error", {
        ...(extra || {}),
        error: normalizeError(event.target?.error || event),
      });
    });
    return request;
  }

  function installIndexedDbHook() {
    const idb = global.indexedDB;
    if (!idb || typeof idb.open !== "function") {
      record("idb-unavailable", {});
      return;
    }

    const originalOpen = idb.open.bind(idb);
    idb.open = function wrappedOpen(name, version) {
      record("idb-open-start", { name, version: version ?? null });
      const request = originalOpen(name, version);
      if (request && typeof request.addEventListener === "function") {
        request.addEventListener("upgradeneeded", function onUpgrade() {
          record("idb-open-upgradeneeded", { name, version: version ?? null });
        });
        request.addEventListener("blocked", function onBlocked() {
          record("idb-open-blocked", { name, version: version ?? null });
        });
      }
      return instrumentRequest("idb-open", request, {
        name,
        version: version ?? null,
      });
    };

    const databaseProto = global.IDBDatabase?.prototype;
    if (databaseProto && typeof databaseProto.transaction === "function") {
      const originalTransaction = databaseProto.transaction;
      databaseProto.transaction = function wrappedTransaction() {
        const storeNames = arguments[0];
        const mode = arguments[1] || "readonly";
        record("idb-transaction-start", {
          mode,
          storeNames: Array.isArray(storeNames) ? storeNames.slice() : [storeNames],
        });
        const tx = originalTransaction.apply(this, arguments);
        if (tx && typeof tx.addEventListener === "function") {
          tx.addEventListener("complete", function onComplete() {
            record("idb-transaction-complete", {
              mode,
              storeNames: Array.isArray(storeNames)
                ? storeNames.slice()
                : [storeNames],
            });
          });
          tx.addEventListener("abort", function onAbort(event) {
            record("idb-transaction-abort", {
              mode,
              storeNames: Array.isArray(storeNames)
                ? storeNames.slice()
                : [storeNames],
              error: normalizeError(event.target?.error || event),
            });
          });
          tx.addEventListener("error", function onError(event) {
            record("idb-transaction-error", {
              mode,
              storeNames: Array.isArray(storeNames)
                ? storeNames.slice()
                : [storeNames],
              error: normalizeError(event.target?.error || event),
            });
          });
        }
        return tx;
      };
    }

    const objectStoreProto = global.IDBObjectStore?.prototype;
    if (objectStoreProto) {
      for (const methodName of ["getAllKeys", "get", "put", "delete"]) {
        if (typeof objectStoreProto[methodName] !== "function") {
          continue;
        }
        const originalMethod = objectStoreProto[methodName];
        objectStoreProto[methodName] = function wrappedObjectStoreMethod() {
          const key = arguments[0];
          record("idb-request-start", {
            key: typeof key === "undefined" ? null : safeClone(key),
            method: methodName,
            storeName: this.name,
          });
          const request = originalMethod.apply(this, arguments);
          return instrumentRequest("idb-request", request, {
            key: typeof key === "undefined" ? null : safeClone(key),
            method: methodName,
            storeName: this.name,
          });
        };
      }
    }
  }

  function installDomObservers() {
    const observer = new MutationObserver(function onMutation() {
      record("ui-state", {
        dialogDetails: readDialogDetails(),
        loadingText: readLoadingText(),
      });
    });

    function watch() {
      const loadingText = global.document?.getElementById("loading-text");
      const dialogDetails = global.document?.getElementById("dialog-details-area");
      if (loadingText) {
        observer.observe(loadingText, {
          characterData: true,
          childList: true,
          subtree: true,
        });
      }
      if (dialogDetails) {
        observer.observe(dialogDetails, {
          attributes: true,
          characterData: true,
          childList: true,
          subtree: true,
        });
      }
      record("ui-state", {
        dialogDetails: readDialogDetails(),
        loadingText: readLoadingText(),
      });
    }

    if (global.document?.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", watch, { once: true });
    } else {
      watch();
    }
  }

  function installHookWatcher() {
    let attached = false;

    function tryAttach() {
      if (attached || !global.GWHook) {
        return;
      }
      attached = true;
      record("gw-hook-detected", {});
      global.GWHook.on("wasm-captured", function onCaptured() {
        record("gw-hook-captured", {
          buildInfo: global.GWHook.getBuildInfo(),
        });
      });
      global.GWHook.on("runtime-initialized", function onReady() {
        record("gw-hook-ready", {
          buildInfo: global.GWHook.getBuildInfo(),
        });
      });
    }

    const interval = global.setInterval(function pollHook() {
      tryAttach();
      if (attached) {
        global.clearInterval(interval);
      }
    }, 50);
    tryAttach();
  }

  function installOverlay() {
    const controlsId = "gw-debug-overlay-controls";
    const overlayId = "gw-debug-overlay";
    const outputId = "gw-debug-overlay-output";
    const toggleId = "gw-debug-overlay-toggle";
    const styleId = "gw-debug-overlay-style";

    function ensureStyle() {
      if (global.document.getElementById(styleId)) {
        return;
      }
      const style = global.document.createElement("style");
      style.id = styleId;
      style.textContent = `
        #${overlayId} {
          position: fixed;
          right: 12px;
          bottom: 12px;
          z-index: 2147483647;
          width: min(420px, calc(100vw - 24px));
          max-height: min(48vh, 420px);
          box-sizing: border-box;
          padding: 10px 12px;
          overflow: auto;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(0, 0, 0, 0.82);
          color: #d7f7d7;
          font: 12px/1.4 monospace;
          box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(6px);
        }

        #${overlayId}[data-collapsed="true"] {
          display: none;
        }

        #${controlsId} {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 8px;
        }

        #${controlsId} button {
          padding: 5px 7px;
          border: 1px solid rgba(215, 247, 215, 0.38);
          background: rgba(30, 72, 30, 0.72);
          color: #d7f7d7;
          font: 12px/1 monospace;
          cursor: pointer;
        }

        #${controlsId} button:disabled {
          cursor: wait;
          opacity: 0.62;
        }

        #${outputId} {
          margin: 0;
          white-space: pre-wrap;
        }

        #${toggleId} {
          position: fixed;
          right: 12px;
          bottom: 12px;
          z-index: 2147483647;
          padding: 8px 10px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(0, 0, 0, 0.82);
          color: #d7f7d7;
          font: 12px/1 monospace;
          cursor: pointer;
        }

        #${overlayId}[data-collapsed="false"] + #${toggleId} {
          bottom: calc(min(48vh, 420px) + 20px);
        }
      `;
      global.document.head.appendChild(style);
    }

    function createNode(tagName, id) {
      const node = global.document.createElement(tagName);
      node.id = id;
      return node;
    }

    function renderSoon() {
      try {
        render();
      } catch (error) {
        // The interval render path will surface overlay errors.
      }
    }

    async function runDebugAction(name, action) {
      const startedAt = Date.now();
      push(diagnostics.actions, {
        name,
        status: "pending",
        t: startedAt - start,
      });
      record("debug-action-start", { name });
      renderSoon();

      try {
        const result = await action();
        push(diagnostics.actions, {
          durationMs: Date.now() - startedAt,
          name,
          result: safeClone(result),
          status: "ok",
          t: Date.now() - start,
        });
        record("debug-action-ok", {
          durationMs: Date.now() - startedAt,
          name,
          result: safeClone(result),
        });
      } catch (error) {
        const normalized = normalizeError(error);
        push(diagnostics.actions, {
          durationMs: Date.now() - startedAt,
          error: normalized,
          name,
          status: "error",
          t: Date.now() - start,
        });
        record("debug-action-error", {
          durationMs: Date.now() - startedAt,
          error: normalized,
          name,
        });
      }
      renderSoon();
    }

    function createActionButton(label, action) {
      const button = global.document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", async function onClick() {
        button.disabled = true;
        try {
          await runDebugAction(label, action);
        } finally {
          button.disabled = false;
        }
      });
      return button;
    }

    function formatUrl(url) {
      if (typeof url !== "string" || !url) {
        return "-";
      }
      const short = url.replace(global.location.origin, "");
      return short.length > 96 ? short.slice(0, 93) + "..." : short;
    }

    function readContextPeek() {
      if (!global.GWHook || typeof global.GWHook.readU32 !== "function") {
        return null;
      }

      if (!global.GWHook.memory) {
        return {
          charContext: null,
          gameplayContext: null,
          gameplayContextSlot: 5940872,
          mapContext: null,
          status: "memory-unavailable",
        };
      }

      function tryReadU32(address) {
        try {
          return global.GWHook.readU32(address);
        } catch (error) {
          return null;
        }
      }

      const gameplayContextSlot = 5940872;
      const gameplayContext = tryReadU32(gameplayContextSlot);
      return {
        charContext: gameplayContext ? tryReadU32(gameplayContext + 0x44) : null,
        gameplayContext,
        gameplayContextSlot,
        mapContext: gameplayContext ? tryReadU32(gameplayContext + 0x14) : null,
        status: gameplayContext === null ? "read-pending" : "ok",
      };
    }

    function render() {
      const overlay = global.document.getElementById(overlayId);
      if (!overlay) {
        return;
      }

      try {
        const dump =
          global.__GWDiagnostics__ && typeof global.__GWDiagnostics__.dump === "function"
            ? global.__GWDiagnostics__.dump()
            : null;
        const recentFetches = dump ? dump.fetches.slice(-3) : [];
        const recentEvents = dump ? dump.events.slice(-5) : [];
        const recentActions = dump ? dump.actions.slice(-4) : [];
        const buildInfo = dump && dump.hook ? dump.hook.buildInfo : null;
        const context = readContextPeek();
        const lines = [
          "GW Debug",
          "stage: " + (dump ? dump.loadingText || "-" : "-"),
          "runtime: " + (buildInfo && buildInfo.runtimeInitialized ? "ready" : "loading"),
          "flags: imageDb=" + (global.__GW_DISABLE_IMAGE_DB__ ? "off" : "on")
            + " jspi=" + (global.__GW_DISABLE_JSPI__ ? "off" : "on"),
          "build: " + (buildInfo ? buildInfo.wasmBuildId || buildInfo.buildId || "-" : "-"),
          "captures: " + (buildInfo ? buildInfo.captureCount : 0)
            + " fetches: " + (dump ? dump.fetches.length : 0)
            + " errors: " + (dump ? dump.windowErrors.length : 0),
        ];

        if (context) {
          const gameplayText =
            typeof context.gameplayContext === "number" && context.gameplayContext > 0
              ? "0x" + context.gameplayContext.toString(16)
              : String(context.gameplayContext ?? "-");
          const charText =
            typeof context.charContext === "number" && context.charContext > 0
              ? "0x" + context.charContext.toString(16)
              : String(context.charContext ?? "-");
          const mapText =
            typeof context.mapContext === "number" && context.mapContext > 0
              ? "0x" + context.mapContext.toString(16)
              : String(context.mapContext ?? "-");
          lines.push(
            "ctx: slot=0x" + context.gameplayContextSlot.toString(16)
              + " gameplay=" + gameplayText
              + " char=" + charText
              + " map=" + mapText
              + " (" + context.status + ")"
          );
        }

        if (recentFetches.length > 0) {
          lines.push("");
          lines.push("fetches:");
          for (const fetchEntry of recentFetches) {
            lines.push(
              "  " + (fetchEntry.ok ? fetchEntry.status : "ERR")
                + " " + formatUrl(fetchEntry.url)
            );
          }
        }

        if (recentEvents.length > 0) {
          lines.push("");
          lines.push("events:");
          for (const eventEntry of recentEvents) {
            lines.push("  " + eventEntry.kind);
          }
        }

        if (recentActions.length > 0) {
          lines.push("");
          lines.push("actions:");
          for (const actionEntry of recentActions) {
            const duration =
              typeof actionEntry.durationMs === "number"
                ? " " + actionEntry.durationMs + "ms"
                : "";
            const payload =
              actionEntry.status === "error"
                ? actionEntry.error
                : actionEntry.result;
            lines.push("  " + actionEntry.name + ": " + actionEntry.status + duration);
            if (typeof payload !== "undefined") {
              lines.push("    " + formatInline(payload).replace(/\n/g, "\n    "));
            }
          }
        }

        const output = global.document.getElementById(outputId);
        if (output) {
          output.textContent = lines.join("\n");
        } else {
          overlay.textContent = lines.join("\n");
        }
      } catch (error) {
        const output = global.document.getElementById(outputId) || overlay;
        output.textContent = [
          "GW Debug",
          "overlay error: " + String(error && error.message ? error.message : error),
        ].join("\n");
      }
    }

    function mount() {
      if (!global.document?.body || global.document.getElementById(overlayId)) {
        return;
      }

      ensureStyle();
      const overlay = createNode("div", overlayId);
      const controls = createNode("div", controlsId);
      const output = createNode("pre", outputId);
      const toggle = createNode("button", toggleId);
      overlay.setAttribute("data-collapsed", "true");

      controls.appendChild(createActionButton("Initialize GWCAjs", function initializeGWCAjs() {
        if (!global.GWCAjs || typeof global.GWCAjs.initialize !== "function") {
          throw new Error("GWCAjs.initialize is not available");
        }
        return global.GWCAjs.initialize();
      }));
      controls.appendChild(createActionButton(
        "Set Secondary Warrior",
        function setSecondaryWarrior() {
          const changeSecondProfession = global.GWCAjs?.Player?.ChangeSecondProfession;
          if (typeof changeSecondProfession !== "function") {
            throw new Error("GWCAjs.Player.ChangeSecondProfession is not available");
          }
          return changeSecondProfession(1);
        }
      ));

      overlay.appendChild(controls);
      overlay.appendChild(output);

      toggle.type = "button";
      toggle.textContent = "Show GW Debug";
      toggle.addEventListener("click", function onToggle() {
        const collapsed = overlay.getAttribute("data-collapsed") === "true";
        overlay.setAttribute("data-collapsed", collapsed ? "false" : "true");
        toggle.textContent = collapsed ? "Hide GW Debug" : "Show GW Debug";
      });

      global.document.body.appendChild(overlay);
      global.document.body.appendChild(toggle);
      render();
      global.setInterval(render, 500);
    }

    if (global.document?.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", mount, { once: true });
    } else {
      mount();
    }
  }

  installConsoleHook("error");
  installConsoleHook("warn");
  installFetchHook();
  installIndexedDbHook();
  installDomObservers();
  installHookWatcher();
  installOverlay();

  global.addEventListener("error", function onError(event) {
    push(diagnostics.windowErrors, {
      error: normalizeError(event.error || event.message),
      filename: event.filename || null,
      lineno: event.lineno || null,
      colno: event.colno || null,
      t: Date.now() - start,
    });
  });

  global.addEventListener("unhandledrejection", function onRejection(event) {
    push(diagnostics.windowErrors, {
      error: normalizeError(event.reason),
      filename: null,
      lineno: null,
      colno: null,
      t: Date.now() - start,
      type: "unhandledrejection",
    });
  });

  if (global.WebAssembly?.compileStreaming) {
    const originalCompileStreaming =
      global.WebAssembly.compileStreaming.bind(global.WebAssembly);
    global.WebAssembly.compileStreaming = function wrappedCompileStreaming(
      source
    ) {
      record("wasm-compile-streaming", {
        url: source && typeof source.url === "string" ? source.url : null,
      });
      return originalCompileStreaming(source);
    };
  }

  global.__GWDiagnostics__ = {
    dump() {
      return {
        actions: diagnostics.actions.slice(),
        console: diagnostics.console.slice(),
        dialogDetails: readDialogDetails(),
        events: diagnostics.events.slice(),
        fetches: diagnostics.fetches.slice(),
        gw: describeGW(),
        hook: global.GWHook
          ? {
              buildInfo:
                typeof global.GWHook.getBuildInfo === "function"
                  ? global.GWHook.getBuildInfo()
                  : null,
              state:
                typeof global.GWHook.getCaptureState === "function"
                  ? global.GWHook.getCaptureState()
                  : null,
            }
          : null,
        loadingText: readLoadingText(),
        resourceUrls: global.performance
          ? global.performance
              .getEntriesByType("resource")
              .map(function mapEntry(entry) {
                return entry.name;
              })
          : [],
        startedAt: start,
        uptimeMs: Date.now() - start,
        windowErrors: diagnostics.windowErrors.slice(),
      };
    },
    record,
  };

  record("diagnostics-installed", {
    href: global.location ? global.location.href : null,
    userAgent: global.navigator ? global.navigator.userAgent : null,
  });
})(globalThis);
