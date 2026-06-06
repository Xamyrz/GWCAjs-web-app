export function readValue(state, type, address) {
  if (!state?.memory || !address) {
    return null;
  }
  try {
    return state.memory.readType(type, address);
  } catch (error) {
    return null;
  }
}

export function getMemoryLimit(state) {
  return Math.max(
    state?.memory?.byteLength || 0,
    state?.hook?.memory?.buffer?.byteLength || 0
  );
}

export function isValidPointer(state, value) {
  const limit = getMemoryLimit(state);
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0x10000 &&
    value < limit
  );
}

export function readUtf16(state, address, maxUnits = 64) {
  const hook = state?.hook;
  if (!hook || typeof hook.readU16 !== "function" || !address) {
    return "";
  }

  const chars = [];
  const limit = Math.max(0, maxUnits | 0);
  for (let index = 0; index < limit; index += 1) {
    let codeUnit = 0;
    try {
      codeUnit = hook.readU16(address + index * 2);
    } catch (error) {
      return "";
    }
    if (!codeUnit) {
      break;
    }
    chars.push(codeUnit);
  }
  return chars.length > 0 ? String.fromCharCode(...chars) : "";
}

export function writeUtf16(state, address, text, maxUnits) {
  const hook = state?.hook;
  if (!hook || typeof hook.writeU16 !== "function" || !address) {
    return false;
  }

  const value = String(text ?? "");
  const limit = Math.max(0, maxUnits | 0);
  try {
    for (let index = 0; index < limit; index += 1) {
      const codeUnit = index < value.length ? value.charCodeAt(index) : 0;
      hook.writeU16(address + index * 2, codeUnit);
    }
    return true;
  } catch (error) {
    return false;
  }
}
