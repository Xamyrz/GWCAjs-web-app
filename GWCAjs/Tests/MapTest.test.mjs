import assert from "node:assert/strict";
import {
  createMapTestController,
  MAP_TEST_MESSAGE,
} from "../Source/MapTest.js";

function createHarness(initialSnapshot) {
  let currentTime = 1000;
  let current = true;
  let nextTimer = 1;
  let snapshot = { ...initialSnapshot };
  const timers = new Map();
  const travelCalls = [];

  const controller = createMapTestController({
    cancel(handle) {
      timers.delete(handle);
    },
    getLanguage: () => 4,
    getRegion: () => 2,
    isCurrent: () => current,
    now: () => currentTime,
    readSnapshot: () => snapshot,
    schedule(callback, delay) {
      const handle = nextTimer;
      nextTimer += 1;
      timers.set(handle, {
        callback,
        dueAt: currentTime + delay,
      });
      return handle;
    },
    sendTravel(...args) {
      travelCalls.push(args);
      return true;
    },
    tickMs: 16,
  });

  function advance(milliseconds) {
    const target = currentTime + milliseconds;
    while (true) {
      const next = [...timers.entries()]
        .filter(([, timer]) => timer.dueAt <= target)
        .sort((left, right) => left[1].dueAt - right[1].dueAt)[0];
      if (!next) {
        break;
      }
      const [handle, timer] = next;
      timers.delete(handle);
      currentTime = timer.dueAt;
      timer.callback();
    }
    currentTime = target;
  }

  return {
    advance,
    controller,
    setCurrent(value) {
      current = value;
    },
    setSnapshot(value) {
      snapshot = { ...snapshot, ...value };
    },
    travelCalls,
  };
}

{
  const harness = createHarness({
    instanceType: 0,
    mapContextAddress: 0x10000,
    mapId: 1,
  });
  assert.equal(harness.controller.start(2, 3, 7, 2, 32, 64), true);
  assert.equal(harness.controller.getStatus(), "wait0");
  assert.deepEqual(harness.travelCalls, [[2, 2, 0, 4]]);

  harness.setSnapshot({ mapId: 2 });
  harness.advance(16);
  assert.equal(harness.controller.getStatus(), "wait0");

  harness.setSnapshot({
    instanceType: 0,
    mapContextAddress: 0x11000,
    mapId: 2,
  });
  harness.advance(16);
  assert.equal(harness.controller.getStatus(), "wait1");

  harness.advance(32);
  assert.equal(harness.controller.getStatus(), "run");
  assert.deepEqual(harness.travelCalls.slice(1), [
    [3, 0, 7, 0],
    [3, 0, 7, 0],
  ]);

  harness.advance(16);
  harness.advance(65);
  assert.equal(harness.controller.getStatus(), "done");
  assert.equal(harness.controller.isActive(), false);
  assert.equal(harness.controller.getCount(), 1);
}

{
  const harness = createHarness({
    instanceType: 0,
    mapContextAddress: 0x20000,
    mapId: 10,
  });
  harness.controller.start(20, 30, 2, 1, 0, 500, undefined, 2);
  harness.setSnapshot({
    mapContextAddress: 0x21000,
    mapId: 20,
  });
  harness.advance(32);
  assert.equal(harness.controller.getStatus(), "run");

  harness.setSnapshot({
    instanceType: 0,
    mapContextAddress: 0x22000,
    mapId: 30,
  });
  harness.advance(16);
  assert.equal(harness.controller.getStatus(), "wait2");
  harness.advance(16);
  harness.advance(112);
  assert.equal(harness.controller.getStatus(), "wait0");
  assert.equal(harness.controller.getCount(), 2);
  assert.deepEqual(harness.travelCalls.at(-1), [20, 2, 0, 4]);
}

{
  const harness = createHarness({
    instanceType: 0,
    mapContextAddress: 0x28000,
    mapId: 10,
  });
  harness.controller.start(20, 30);
  harness.setSnapshot({
    mapContextAddress: 0x29000,
    mapId: 20,
  });
  harness.advance(32);
  assert.equal(harness.controller.getStatus(), "run");
  assert.equal(harness.travelCalls.length, 2);

  harness.setSnapshot({
    instanceType: 0,
    mapContextAddress: 0x2a000,
    mapId: 30,
  });
  harness.advance(16);
  harness.advance(128);
  assert.equal(harness.controller.getStatus(), "stop");
  assert.equal(
    harness.controller.getState().failureReason,
    "max-tries-reached"
  );
}

{
  const harness = createHarness({
    instanceType: 0,
    mapContextAddress: 0x2b000,
    mapId: 10,
  });
  harness.controller.start(20, 30, 2, 1, 0, 100, undefined, 1, 64);
  harness.setSnapshot({
    mapContextAddress: 0x2c000,
    mapId: 20,
  });
  harness.advance(32);
  harness.setSnapshot({ instanceType: 2 });
  harness.advance(208);
  assert.equal(harness.controller.getStatus(), "stop");
  assert.equal(
    harness.controller.getState().failureReason,
    "loading-timeout"
  );
}

{
  const harness = createHarness({
    instanceType: 0,
    mapContextAddress: 0x30000,
    mapId: 40,
  });
  harness.controller.start(
    40,
    50,
    2,
    0,
    0,
    100,
    MAP_TEST_MESSAGE.StartMapLoad
  );
  harness.setSnapshot({ instanceType: 2 });
  harness.advance(16);
  assert.equal(harness.controller.getStatus(), "wait1");
  harness.advance(16);
  assert.equal(harness.controller.getStatus(), "run");
}

{
  const harness = createHarness({
    instanceType: 0,
    mapContextAddress: 0x40000,
    mapId: 60,
  });
  assert.equal(harness.controller.start(0, 70), false);
  assert.equal(harness.controller.getStatus(), "idle");
  assert.equal(harness.controller.refuse(), false);
  assert.equal(harness.controller.getStatus(), "stop");
  assert.equal(
    harness.controller.getState().failureReason,
    "unsafe-opt-in-required"
  );

  assert.equal(harness.controller.start(60, 70), true);
  assert.equal(harness.controller.start(0, 70), false);
  assert.equal(harness.controller.getStatus(), "wait0");

  harness.controller.stop();
  assert.equal(harness.controller.getStatus(), "stop");
  assert.equal(harness.controller.isActive(), false);
}

{
  const harness = createHarness({
    instanceType: 0,
    mapContextAddress: 0x50000,
    mapId: 80,
  });
  harness.controller.start(80, 90);
  harness.setCurrent(false);
  harness.advance(16);
  assert.equal(harness.controller.getStatus(), "stop");
  assert.equal(harness.controller.isActive(), false);
}

console.log("MapTest state-machine checks passed");
