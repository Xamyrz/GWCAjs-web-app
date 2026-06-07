import { isValidRange } from "./Memory.js";

const textEncoder = new TextEncoder();

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function createTemporaryBufferPool(state, options = {}) {
  const alignment = positiveInteger(options.alignment, 8);
  const maxIdleBuffers = positiveInteger(options.maxIdleBuffers, 8);
  const maxRetainedBytes = positiveInteger(
    options.maxRetainedBytes,
    256 * 1024
  );
  const entries = [];
  let allocations = 0;
  let disposed = false;
  let frees = 0;
  let reuses = 0;

  const memory = state?.memory;
  if (
    !memory ||
    typeof memory.malloc !== "function" ||
    typeof memory.free !== "function"
  ) {
    throw new Error("Temporary buffers require shared malloc/free helpers");
  }

  function normalizeSize(size) {
    if (!Number.isInteger(size) || size <= 0) {
      throw new RangeError("Temporary buffer size must be a positive integer");
    }
    return Math.ceil(size / alignment) * alignment;
  }

  function removeEntry(entry) {
    const index = entries.indexOf(entry);
    if (index >= 0) {
      entries.splice(index, 1);
    }
  }

  function freeEntry(entry) {
    removeEntry(entry);
    memory.free(entry.address);
    frees += 1;
  }

  function clearRange(address, length) {
    if (length <= 0) {
      return;
    }
    if (typeof state?.hook?.writeBytes !== "function") {
      throw new Error("writeBytes is required to clear temporary buffers");
    }
    state.hook.writeBytes(address, new Uint8Array(length));
  }

  function idleEntries() {
    return entries.filter((entry) => !entry.inUse);
  }

  function releaseEntry(entry) {
    if (!entry.inUse) {
      return false;
    }
    entry.inUse = false;

    const idle = idleEntries();
    const retainedBytes = idle.reduce(
      (total, candidate) => total + candidate.capacity,
      0
    );
    if (
      disposed ||
      entry.disposeOnRelease ||
      idle.length > maxIdleBuffers ||
      retainedBytes > maxRetainedBytes
    ) {
      freeEntry(entry);
    }
    return true;
  }

  function createLease(entry, requestedSize) {
    let released = false;
    return Object.freeze({
      address: entry.address,
      capacity: entry.capacity,
      clear(length = requestedSize) {
        if (released) {
          throw new Error("Temporary buffer lease has been released");
        }
        if (
          !Number.isInteger(length) ||
          length < 0 ||
          length > entry.capacity
        ) {
          throw new RangeError("Invalid temporary buffer clear length");
        }
        clearRange(entry.address, length);
        return entry.address;
      },
      get released() {
        return released;
      },
      release() {
        if (released) {
          return false;
        }
        released = true;
        return releaseEntry(entry);
      },
      requestedSize,
    });
  }

  function acquire(size, acquireOptions = {}) {
    if (disposed) {
      throw new Error("Temporary buffer pool has been disposed");
    }

    const requestedSize = size;
    const capacity = normalizeSize(size);
    let entry = entries
      .filter((candidate) => !candidate.inUse && candidate.capacity >= capacity)
      .sort((left, right) => left.capacity - right.capacity)[0];

    if (entry) {
      reuses += 1;
      entry.inUse = true;
    } else {
      const address = memory.malloc(capacity) >>> 0;
      if (
        !address ||
        !isValidRange(state, address, capacity, alignment)
      ) {
        if (address) {
          memory.free(address);
        }
        throw new RangeError("malloc returned an invalid temporary buffer");
      }
      entry = {
        address,
        capacity,
        disposeOnRelease: false,
        inUse: true,
      };
      entries.push(entry);
      allocations += 1;
    }

    try {
      if (acquireOptions.clear !== false) {
        clearRange(entry.address, requestedSize);
      }
    } catch (error) {
      releaseEntry(entry);
      throw error;
    }
    return createLease(entry, requestedSize);
  }

  function withBuffer(size, callback, acquireOptions = {}) {
    if (typeof callback !== "function") {
      throw new TypeError("Temporary buffer callback must be a function");
    }
    const lease = acquire(size, acquireOptions);
    let result;
    try {
      result = callback(lease);
    } catch (error) {
      lease.release();
      throw error;
    }
    if (result && typeof result.then === "function") {
      return Promise.resolve(result).finally(() => lease.release());
    }
    lease.release();
    return result;
  }

  function withUtf8(text, callback) {
    if (typeof callback !== "function") {
      throw new TypeError("Temporary UTF-8 callback must be a function");
    }
    const value = String(text ?? "");
    const byteLength = textEncoder.encode(value + "\0").length;
    return withBuffer(byteLength, (lease) => {
      if (typeof state?.hook?.writeUtf8 !== "function") {
        throw new Error("writeUtf8 is required for temporary UTF-8 buffers");
      }
      state.hook.writeUtf8(lease.address, value, byteLength);
      return callback(lease.address, byteLength, lease);
    });
  }

  function withUtf16(text, callback) {
    if (typeof callback !== "function") {
      throw new TypeError("Temporary UTF-16 callback must be a function");
    }
    const value = String(text ?? "");
    const unitLength = value.length + 1;
    return withBuffer(unitLength * 2, (lease) => {
      if (typeof state?.hook?.writeUtf16 !== "function") {
        throw new Error("writeUtf16 is required for temporary UTF-16 buffers");
      }
      state.hook.writeUtf16(lease.address, value, unitLength);
      return callback(lease.address, unitLength, lease);
    });
  }

  function dispose() {
    if (disposed) {
      return 0;
    }
    disposed = true;
    let disposedCount = 0;
    for (const entry of [...entries]) {
      if (entry.inUse) {
        entry.disposeOnRelease = true;
      } else {
        freeEntry(entry);
        disposedCount += 1;
      }
    }
    return disposedCount;
  }

  function describe() {
    const idle = idleEntries();
    return {
      activeCount: entries.length - idle.length,
      allocations,
      disposed,
      frees,
      idleCount: idle.length,
      retainedBytes: idle.reduce(
        (total, entry) => total + entry.capacity,
        0
      ),
      reuses,
    };
  }

  return Object.freeze({
    acquire,
    describe,
    dispose,
    withBuffer,
    withUtf8,
    withUtf16,
  });
}
