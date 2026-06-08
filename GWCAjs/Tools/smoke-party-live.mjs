#!/usr/bin/env node

const DEFAULTS = {
  debugPort: 9223,
  fresh: false,
  url: "http://127.0.0.1:8000/",
  initialize: false,
  toggleTick: false,
  timeoutMs: 10_000,
};

function parseArguments(argv) {
  const options = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (argument === "--initialize") {
      options.initialize = true;
      continue;
    }
    if (argument === "--fresh") {
      options.fresh = true;
      options.initialize = true;
      continue;
    }
    if (argument === "--toggle-tick") {
      options.toggleTick = true;
      continue;
    }
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}`);
    }
    const key = argument.slice(2);
    if (
      !(key in options) ||
      key === "initialize" ||
      key === "fresh" ||
      key === "toggleTick"
    ) {
      throw new Error(`Unknown option: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}`);
    }
    options[key] =
      key.endsWith("Ms") || key === "debugPort" ? Number(value) : value;
    index += 1;
  }
  for (const key of ["debugPort", "timeoutMs"]) {
    if (!Number.isFinite(options[key]) || options[key] < 0) {
      throw new Error(`--${key} must be a non-negative number`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node GWCAjs/Tools/smoke-party-live.mjs [options]

Requires an already-running Chromium instance opened on:
  http://127.0.0.1:8000/

Options:
  --debugPort PORT       Remote debugging port (default: 9223)
  --url URL              Page URL prefix to attach to
  --initialize           Run GWCAjs.initialize() before the smoke reads
  --fresh                Run GWCAjs.terminate(), then initialize before reads
  --toggle-tick          Call Party.SetTickToggle() and report before/after
  --timeoutMs MS         CDP evaluation timeout (default: 10000)

The smoke output is intentionally sanitized: it reports PartyMgr structure,
counts, flags, action availability, and entity IDs, but omits player,
character, hero, pet, and leader names.`);
}

async function openSocket(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return socket;
}

function createSession(socket) {
  let id = 0;
  const pending = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) {
      return;
    }
    const { resolve, reject, timeoutId } = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(timeoutId);
    if (message.error) {
      reject(new Error(JSON.stringify(message.error)));
      return;
    }
    resolve(message.result);
  });

  function send(method, params = {}, timeoutMs = DEFAULTS.timeoutMs) {
    return new Promise((resolve, reject) => {
      id += 1;
      const timeoutId = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out after ${timeoutMs}ms during ${method}`));
      }, timeoutMs);
      pending.set(id, { reject, resolve, timeoutId });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  return { send };
}

async function getPageTarget(options) {
  const response = await fetch(
    `http://127.0.0.1:${options.debugPort}/json/list`
  );
  if (!response.ok) {
    throw new Error(
      `Failed to query Chromium targets: ${response.status} ${response.statusText}`
    );
  }
  const targets = await response.json();
  const page = targets.find(
    (target) =>
      target.type === "page" &&
      typeof target.url === "string" &&
      target.url.startsWith(options.url)
  );
  if (!page) {
    throw new Error(`Page target not found for ${options.url}`);
  }
  return page;
}

function createSmokeExpression(options) {
  return `(${async function partySmoke(runOptions) {
    function sanitizeArray(array, mapper) {
      return {
        address: array?.address || 0,
        capacity: array?.capacity || 0,
        size: array?.size || 0,
        entries: Array.isArray(array?.entries) ? array.entries.map(mapper) : [],
      };
    }

    function summarizePartyInfo(party) {
      if (!party) {
        return null;
      }
      return {
        address: party.address || 0,
        partyId: party.partyId || 0,
        partySize: party.partySize || 0,
        players: sanitizeArray(party.players, (entry) =>
          entry
            ? {
                calledTargetId: entry.calledTargetId || 0,
                connected: !!entry.connected,
                index: entry.index || 0,
                loginNumber: entry.loginNumber || 0,
                state: entry.state || 0,
                ticked: !!entry.ticked,
              }
            : null
        ),
        heroes: sanitizeArray(party.heroes, (entry) =>
          entry
            ? {
                agentId: entry.agentId || 0,
                heroId: entry.heroId || 0,
                index: entry.index || 0,
                level: entry.level || 0,
                ownerPlayerId: entry.ownerPlayerId || 0,
                primary: entry.primary || 0,
                secondary: entry.secondary || 0,
              }
            : null
        ),
        henchmen: sanitizeArray(party.henchmen, (entry) =>
          entry
            ? {
                agentId: entry.agentId || 0,
                index: entry.index || 0,
                level: entry.level || 0,
                profession: entry.profession || 0,
              }
            : null
        ),
        others: sanitizeArray(party.others, (entry) =>
          entry
            ? {
                index: entry.index || 0,
                value: entry.value || 0,
              }
            : null
        ),
      };
    }

    function summarizeRequests(list) {
      return {
        address: list?.address || 0,
        count: list?.count || 0,
        expectedCount: list?.expectedCount || 0,
        entries: Array.isArray(list?.entries)
          ? list.entries.map((entry) =>
              entry
                ? {
                    index: entry.index || 0,
                    leaderPlayerNumber: entry.leaderPlayerNumber || 0,
                    partyId: entry.partyId || 0,
                    partySize: entry.partySize || 0,
                  }
                : null
            )
          : [],
      };
    }

    function summarizePartySearch(search) {
      return {
        address: search?.address || 0,
        capacity: search?.capacity || 0,
        size: search?.size || 0,
        entries: Array.isArray(search?.entries)
          ? search.entries.map((entry) =>
              entry
                ? {
                    district: entry.district || 0,
                    hardMode: !!entry.hardMode,
                    heroCount: entry.heroCount || 0,
                    index: entry.index || 0,
                    language: entry.language || 0,
                    level: entry.level || 0,
                    partySearchId: entry.partySearchId || 0,
                    partySearchType: entry.partySearchType || 0,
                    partySize: entry.partySize || 0,
                    primary: entry.primary || 0,
                    secondary: entry.secondary || 0,
                    timestamp: entry.timestamp || 0,
                  }
                : null
            )
          : [],
      };
    }

    function summarizeActionStatuses(statuses) {
      return Object.fromEntries(
        Object.entries(statuses || {}).map(([name, status]) => [
          name,
          {
            available: !!status?.available,
            mode: status?.mode || "unavailable",
            exportName: status?.internalFunction?.exportName || null,
          },
        ])
      );
    }

    function capture(name, callback) {
      try {
        return { ok: true, value: callback() };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          name,
        };
      }
    }

    function summarizeInitializeResult(result) {
      if (!result) {
        return null;
      }
      return {
        anchors: result.anchors || null,
        buildId: result.buildId || result.build?.wasmBuildId || null,
        contextAddresses: result.context?.addresses || null,
        initialized: !!result.initialized,
        reused: !!result.reused,
      };
    }

    if (!window.GWCAjs) {
      throw new Error("window.GWCAjs is unavailable");
    }
    if (runOptions.fresh && typeof window.GWCAjs.terminate === "function") {
      window.GWCAjs.terminate();
    }
    const initializeResult = runOptions.initialize
      ? await window.GWCAjs.initialize()
      : null;
    const party = window.GWCAjs.Party;
    if (!party) {
      throw new Error("GWCAjs.Party is unavailable");
    }

    const context = party.GetPartyContext();
    const description = party.Describe();
    const playerParty = party.GetPartyInfo();
    const tickToggle = runOptions.toggleTick
      ? await (async () => {
          const before = party.GetIsPlayerTicked();
          const result = party.SetTickToggle();
          await new Promise((resolve) => setTimeout(resolve, 500));
          return {
            after: party.GetIsPlayerTicked(),
            before,
            result,
          };
        })()
      : null;
    return {
      actionStatuses: capture("GetActionStatuses", () =>
        summarizeActionStatuses(party.GetActionStatuses())
      ),
      context: capture("GetPartyContext", () => ({
        address: context?.address || 0,
        flag: context?.flag || 0,
        isDefeated: !!context?.isDefeated,
        isHardMode: !!context?.isHardMode,
        isLeader: !!context?.isLeader,
        partySearch: summarizePartySearch(context?.partySearch),
        playerParty: summarizePartyInfo(context?.playerParty),
        playerPartyPointer: context?.playerPartyPointer || 0,
        requests: summarizeRequests(context?.requests),
        requestsCount: context?.requestsCount || 0,
        searchClientId: context?.searchClientId || 0,
        sending: summarizeRequests(context?.sending),
        sendingCount: context?.sendingCount || 0,
        valid: !!context?.valid,
      })),
      describe: capture("Describe", () => ({
        context: {
          address: description?.context?.address || 0,
          reason: description?.context?.reason || null,
          valid: !!description?.context?.valid,
        },
        verification: description?.verification || null,
      })),
      initialize: summarizeInitializeResult(initializeResult),
      counts: capture("counts", () => ({
        henchmen: party.GetPartyHenchmanCount(),
        heroes: party.GetPartyHeroCount(),
        partySize: party.GetPartySize(),
        players: party.GetPartyPlayerCount(),
      })),
      flags: capture("flags", () => ({
        hardMode: party.GetIsPartyInHardMode(),
        hardModeUnlocked: party.GetIsHardModeUnlocked(),
        leader: party.GetIsLeader(),
        loaded: party.GetIsPartyLoaded(),
        defeated: party.GetIsPartyDefeated(),
        playerTicked: party.GetIsPlayerTicked(),
        partyTicked: party.GetIsPartyTicked(),
      })),
      tickToggle,
      hero: capture("hero", () => {
        const heroAgentId = party.GetHeroAgentID(1);
        const heroInfo = party.GetHeroInfoByIndex(1);
        const attributes = heroAgentId ? party.GetAgentAttributes(heroAgentId) : null;
        return {
          agentId: heroAgentId,
          agentHeroId: heroAgentId ? party.GetAgentHeroID(heroAgentId) : 0,
          info: heroInfo
            ? {
                agentId: heroInfo.agentId || 0,
                heroFileId: heroInfo.heroFileId || 0,
                heroId: heroInfo.heroId || 0,
                level: heroInfo.level || 0,
                modelFileId: heroInfo.modelFileId || 0,
                primary: heroInfo.primary || 0,
                secondary: heroInfo.secondary || 0,
              }
            : null,
          activeAttributeIds: attributes?.activeAttributeIds || [],
        };
      }),
      pet: capture("pet", () => {
        const petInfo = party.GetPetInfo();
        return petInfo
          ? {
              agentId: petInfo.agentId || 0,
              behavior: petInfo.behavior || 0,
              lockedTargetId: petInfo.lockedTargetId || 0,
              modelFileId1: petInfo.modelFileId1 || 0,
              modelFileId2: petInfo.modelFileId2 || 0,
              nameAddress: petInfo.nameAddress || 0,
              nameEncoding: petInfo.nameEncoding || null,
              ownerAgentId: petInfo.ownerAgentId || 0,
            }
          : null;
      }),
      playerParty: capture("GetPartyInfo", () =>
        summarizePartyInfo(playerParty)
      ),
    };
  }})(${JSON.stringify({
    fresh: options.fresh,
    initialize: options.initialize,
    toggleTick: options.toggleTick,
  })})`;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const page = await getPageTarget(options);
  const socket = await openSocket(page.webSocketDebuggerUrl);
  const { send } = createSession(socket);

  try {
    await send("Runtime.enable", {}, options.timeoutMs);
    const result = await send(
      "Runtime.evaluate",
      {
        awaitPromise: true,
        expression: createSmokeExpression(options),
        returnByValue: true,
      },
      options.timeoutMs
    );
    if (result.exceptionDetails) {
      const details = result.exceptionDetails;
      throw new Error(
        details.exception?.description ||
          details.text ||
          "Party smoke evaluation failed"
      );
    }
    console.log(JSON.stringify(result.result?.value ?? null, null, 2));
  } finally {
    socket.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
