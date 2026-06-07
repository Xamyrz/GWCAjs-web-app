import {
  isValidPointer,
  isValidRange,
  readValue,
} from "../Utilities/Memory.js";

export const LIST_HEADER_SIZE = 0x0c;
export const LIST_LINK_SIZE = 0x08;

function readLink(state, address) {
  if (!isValidRange(state, address, LIST_LINK_SIZE, 4)) {
    return null;
  }
  const previousLinkAddress = readValue(state, "u32", address);
  const nextNodeRaw = readValue(state, "u32", address + 4);
  if (
    !Number.isInteger(previousLinkAddress) ||
    !Number.isInteger(nextNodeRaw)
  ) {
    return null;
  }
  return {
    address: address >>> 0,
    nextNodeAddress: (nextNodeRaw & ~1) >>> 0,
    nextNodeRaw: nextNodeRaw >>> 0,
    previousLinkAddress: previousLinkAddress >>> 0,
    taggedEnd: (nextNodeRaw & 1) !== 0,
  };
}

export function readList(state, address, options = {}) {
  if (
    !address ||
    !isValidRange(
      state,
      address,
      LIST_HEADER_SIZE,
      options.headerAlignment ?? 4
    )
  ) {
    return null;
  }

  const offset = readValue(state, "u32", address);
  const maxOffset =
    Number.isInteger(options.maxOffset) && options.maxOffset >= 0
      ? options.maxOffset
      : 0x10000;
  if (
    !Number.isInteger(offset) ||
    offset > maxOffset ||
    offset % (options.offsetAlignment ?? 4) !== 0 ||
    (Number.isInteger(options.expectedOffset) &&
      offset !== options.expectedOffset)
  ) {
    return null;
  }

  const sentinelAddress = (address + 4) >>> 0;
  const sentinel = readLink(state, sentinelAddress);
  if (!sentinel) {
    return null;
  }

  const maxNodes =
    Number.isInteger(options.maxNodes) && options.maxNodes >= 0
      ? options.maxNodes
      : 4096;
  const requireBackLinks = options.requireBackLinks !== false;
  const nodePointerOptions = {
    alignment: options.nodeAlignment ?? 4,
    length: options.nodeSize ?? 1,
    minAddress: options.minNodeAddress,
  };
  const linkAddresses = [];
  const nodeAddresses = [];
  const visitedLinks = new Set([sentinelAddress]);
  let currentLink = sentinel;

  while (true) {
    if (currentLink.taggedEnd || currentLink.nextNodeRaw === 0) {
      if (
        requireBackLinks &&
        sentinel.previousLinkAddress !== 0 &&
        sentinel.previousLinkAddress !== currentLink.address
      ) {
        return null;
      }
      return {
        address: address >>> 0,
        circular: false,
        count: nodeAddresses.length,
        linkAddresses,
        nodeAddresses,
        offset: offset >>> 0,
        sentinelAddress,
        tailLinkAddress: currentLink.address,
        terminatedBy: currentLink.taggedEnd ? "tagged-end" : "null",
      };
    }

    const nextLinkValue = currentLink.nextNodeAddress + offset;
    if (
      !Number.isSafeInteger(nextLinkValue) ||
      nextLinkValue > 0xffffffff
    ) {
      return null;
    }
    const nextLinkAddress = nextLinkValue >>> 0;
    if (nextLinkAddress === sentinelAddress) {
      if (
        requireBackLinks &&
        sentinel.previousLinkAddress !== currentLink.address
      ) {
        return null;
      }
      return {
        address: address >>> 0,
        circular: true,
        count: nodeAddresses.length,
        linkAddresses,
        nodeAddresses,
        offset: offset >>> 0,
        sentinelAddress,
        tailLinkAddress: currentLink.address,
        terminatedBy: "sentinel",
      };
    }

    if (
      nodeAddresses.length >= maxNodes ||
      visitedLinks.has(nextLinkAddress) ||
      !isValidPointer(
        state,
        currentLink.nextNodeAddress,
        nodePointerOptions
      ) ||
      !isValidPointer(state, nextLinkAddress, {
        alignment: 4,
        length: LIST_LINK_SIZE,
        minAddress: options.minNodeAddress,
      })
    ) {
      return null;
    }

    const nextLink = readLink(state, nextLinkAddress);
    if (
      !nextLink ||
      (requireBackLinks &&
        nextLink.previousLinkAddress !== currentLink.address)
    ) {
      return null;
    }

    nodeAddresses.push(currentLink.nextNodeAddress);
    linkAddresses.push(nextLinkAddress);
    visitedLinks.add(nextLinkAddress);
    currentLink = nextLink;
  }
}
