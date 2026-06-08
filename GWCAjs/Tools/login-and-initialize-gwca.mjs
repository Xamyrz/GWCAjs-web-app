#!/usr/bin/env node

const DEFAULTS = {
  debugPort: 9223,
  url: "http://127.0.0.1:8000/",
  loginTimeoutMs: 60_000,
  firstEnterDelayMs: 2_000,
  secondEnterDelayMs: 3_000,
  initializeDelayMs: 5_000,
  initialize: true,
  reload: false,
  reloadOnly: false,
  reloadTimeoutMs: 60_000,
  skipLoginClick: false,
};

function parseArguments(argv) {
  const options = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (argument === "--no-initialize") {
      options.initialize = false;
      continue;
    }
    if (argument === "--reload") {
      options.reload = true;
      continue;
    }
    if (argument === "--reload-only") {
      options.reload = true;
      options.reloadOnly = true;
      continue;
    }
    if (argument === "--skip-login-click") {
      options.skipLoginClick = true;
      continue;
    }
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}`);
    }
    const key = argument.slice(2);
    if (
      !(key in options) ||
      key === "initialize" ||
      key === "reload" ||
      key === "reloadOnly" ||
      key === "skipLoginClick"
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
  for (const key of [
    "debugPort",
    "loginTimeoutMs",
    "firstEnterDelayMs",
    "secondEnterDelayMs",
    "initializeDelayMs",
    "reloadTimeoutMs",
  ]) {
    if (!Number.isFinite(options[key]) || options[key] < 0) {
      throw new Error(`--${key} must be a non-negative number`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node GWCAjs/Tools/login-and-initialize-gwca.mjs [options]

Requires an already-running Chromium instance opened on:
  http://127.0.0.1:8000/

Recommended launch command:
  chromium --no-sandbox --remote-debugging-port=9223 http://127.0.0.1:8000/

Options:
  --debugPort PORT             Remote debugging port (default: 9223)
  --url URL                    Page URL prefix to attach to
  --loginTimeoutMs MS          Wait limit for the Log In button
  --firstEnterDelayMs MS       Delay before the first Enter press
  --secondEnterDelayMs MS      Delay between Enter presses
  --initializeDelayMs MS       Delay before GWCAjs.initialize()
  --reload                     Reload the attached tab before login/init
  --reload-only                Reload the attached tab and exit
  --reloadTimeoutMs MS         Wait limit for the reload load event
  --skip-login-click           Skip Log In button lookup; only send Enter keys
  --no-initialize              Stop after login and Enter presses

The script uses window.__GWInputBridge plus real Chromium CDP key events.
It is validated on non-headless Chromium. Headless Chromium can reach the
login screen but currently fails GWCAjs.initialize() with a missing gameplay
anchor.`);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
  const eventWaiters = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) {
      const waiters = eventWaiters.get(message.method);
      if (waiters?.length) {
        const waiter = waiters.shift();
        if (!waiters.length) {
          eventWaiters.delete(message.method);
        }
        clearTimeout(waiter.timeoutId);
        waiter.resolve(message.params || {});
      }
      return;
    }
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      reject(new Error(JSON.stringify(message.error)));
      return;
    }
    resolve(message.result);
  });

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      id += 1;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  function waitForEvent(method, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const waiters = eventWaiters.get(method) || [];
        const index = waiters.findIndex((waiter) => waiter.reject === reject);
        if (index >= 0) {
          waiters.splice(index, 1);
        }
        if (!waiters.length) {
          eventWaiters.delete(method);
        }
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for ${method}`));
      }, timeoutMs);
      const waiters = eventWaiters.get(method) || [];
      waiters.push({ reject, resolve, timeoutId });
      eventWaiters.set(method, waiters);
    });
  }

  return { send, waitForEvent };
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

async function waitForLoginButton(send, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await send("Runtime.evaluate", {
      expression: "window.__GWInputBridge && window.__GWInputBridge.clickLogin()",
      returnByValue: true,
    });
    const value = result.result?.value;
    if (value && value.clicked) {
      return value;
    }
    await sleep(250);
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for the Log In button`);
}

async function pressEnter(send) {
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
}

async function reloadPage(send, waitForEvent, timeoutMs) {
  await send("Page.enable");
  const loaded = waitForEvent("Page.loadEventFired", timeoutMs);
  await send("Page.reload", { ignoreCache: true });
  await loaded;
}

function summarizeInitializeResult(result) {
  if (!result || typeof result !== "object") {
    return result ?? null;
  }
  return {
    anchors: result.anchors || null,
    buildId: result.buildId || result.build?.wasmBuildId || null,
    contextAddresses: result.context?.addresses || null,
    initialized: !!result.initialized,
    reused: !!result.reused,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const page = await getPageTarget(options);
  const socket = await openSocket(page.webSocketDebuggerUrl);
  const { send, waitForEvent } = createSession(socket);

  try {
    await send("Runtime.enable");

    if (options.reload) {
      await reloadPage(send, waitForEvent, options.reloadTimeoutMs);
      console.log(JSON.stringify({ reload: true }, null, 2));
      if (options.reloadOnly) {
        return;
      }
    }

    const initialState = await send("Runtime.evaluate", {
      expression: "window.__GWInputBridge.state()",
      returnByValue: true,
    });
    console.log(
      JSON.stringify(
        {
          state: initialState.result?.value ?? null,
        },
        null,
        2
      )
    );

    if (options.skipLoginClick) {
      console.log(JSON.stringify({ login: { skipped: true } }, null, 2));
    } else {
      const clickResult = await waitForLoginButton(send, options.loginTimeoutMs);
      console.log(JSON.stringify({ login: clickResult }, null, 2));
    }

    await sleep(options.firstEnterDelayMs);
    await send("Runtime.evaluate", {
      expression: "window.__GWInputBridge.focusPreferredTarget()",
      returnByValue: true,
    });
    await pressEnter(send);

    await sleep(options.secondEnterDelayMs);
    await send("Runtime.evaluate", {
      expression: "window.__GWInputBridge.focusPreferredTarget()",
      returnByValue: true,
    });
    await pressEnter(send);

    if (options.initialize) {
      await sleep(options.initializeDelayMs);
      const initializeResult = await send("Runtime.evaluate", {
        expression: "window.GWCAjs.initialize()",
        awaitPromise: true,
        returnByValue: true,
      });
      if (initializeResult.exceptionDetails) {
        const details = initializeResult.exceptionDetails;
        throw new Error(
          details.exception?.description ||
            details.text ||
            "GWCAjs.initialize() failed"
        );
      }
      console.log(
        JSON.stringify(
          {
            initialize: summarizeInitializeResult(
              initializeResult.result?.value
            ),
          },
          null,
          2
        )
      );
    }
  } finally {
    socket.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
