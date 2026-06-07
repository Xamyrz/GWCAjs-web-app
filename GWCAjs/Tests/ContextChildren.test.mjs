import assert from "node:assert/strict";

import { getAccountContextAddress } from "../Include/GWCA/Context/AccountContext.js";
import { getAgentContextAddress } from "../Include/GWCA/Context/AgentContext.js";
import { getCinematicContextAddress } from "../Include/GWCA/Context/Cinematic.js";
import { getGadgetContextAddress } from "../Include/GWCA/Context/GadgetContext.js";
import {
  GAME_CONTEXT_CHILDREN,
  GAME_CONTEXT_OFFSETS,
  getCharContextAddress,
  getGameContextAddress,
  getGameContextChildAddresses,
  getMapContextAddress,
  getNamedGameContextChildAddress,
  getWorldContextAddress,
} from "../Include/GWCA/Context/GameContext.js";
import { getGuildContextAddress } from "../Include/GWCA/Context/GuildContext.js";
import { getItemContextAddress } from "../Include/GWCA/Context/ItemContext.js";
import { getPartyContextAddress } from "../Include/GWCA/Context/PartyContext.js";
import { getTextParserAddress } from "../Include/GWCA/Context/TextParser.js";
import { getTradeContextAddress } from "../Include/GWCA/Context/TradeContext.js";

const buffer = new ArrayBuffer(0x50000);
const view = new DataView(buffer);

const state = {
  anchors: {},
  hook: {
    memory: { buffer },
  },
  memory: {
    byteLength: buffer.byteLength,
    readType(type, address) {
      if (type === "u32" || type === "ptr") {
        return view.getUint32(address, true);
      }
      throw new Error("Unsupported test read type: " + type);
    },
  },
};

function writeU32(address, value) {
  view.setUint32(address, value >>> 0, true);
}

const rootAddress = 0x10000;
const childAddresses = {
  account: 0x20000,
  agent: 0x21000,
  cinematic: 0x22000,
  character: 0x23000,
  gadget: 0x24000,
  guild: 0x25000,
  item: 0x26000,
  map: 0x27000,
  party: 0x28000,
  textParser: 0x29000,
  trade: 0x2a000,
  world: 0x2b000,
};

for (const [name, child] of Object.entries(GAME_CONTEXT_CHILDREN)) {
  writeU32(rootAddress + child.offset, childAddresses[name]);
}
state.anchors.gameplayContextAddress = rootAddress;

assert.equal(getGameContextAddress(state), rootAddress);
assert.equal(getAccountContextAddress(state), childAddresses.account);
assert.equal(getAgentContextAddress(state), childAddresses.agent);
assert.equal(getCinematicContextAddress(state), childAddresses.cinematic);
assert.equal(getCharContextAddress(state), childAddresses.character);
assert.equal(getGadgetContextAddress(state), childAddresses.gadget);
assert.equal(getGuildContextAddress(state), childAddresses.guild);
assert.equal(getItemContextAddress(state), childAddresses.item);
assert.equal(getMapContextAddress(state), childAddresses.map);
assert.equal(getPartyContextAddress(state), childAddresses.party);
assert.equal(getTextParserAddress(state), childAddresses.textParser);
assert.equal(getTradeContextAddress(state), childAddresses.trade);
assert.equal(getWorldContextAddress(state), childAddresses.world);
assert.equal(getNamedGameContextChildAddress(state, "missing"), 0);

assert.deepEqual(getGameContextChildAddresses(state), {
  account: childAddresses.account,
  agent: childAddresses.agent,
  cinematic: childAddresses.cinematic,
  character: childAddresses.character,
  gadget: childAddresses.gadget,
  gameContextAddress: rootAddress,
  guild: childAddresses.guild,
  item: childAddresses.item,
  map: childAddresses.map,
  party: childAddresses.party,
  textParser: childAddresses.textParser,
  trade: childAddresses.trade,
  world: childAddresses.world,
});

assert.equal(
  GAME_CONTEXT_CHILDREN.guild.verification,
  "live-tested-readonly"
);
assert.equal(GAME_CONTEXT_CHILDREN.world.verification, "validated");

const replacementGuildAddress = 0x2c000;
writeU32(
  rootAddress + GAME_CONTEXT_OFFSETS.guild,
  replacementGuildAddress
);
assert.equal(getGuildContextAddress(state), replacementGuildAddress);

state.anchors.charContextAddress = 0x2d000;
writeU32(rootAddress + GAME_CONTEXT_OFFSETS.character, 0);
assert.equal(getCharContextAddress(state), 0);
writeU32(rootAddress + GAME_CONTEXT_OFFSETS.character, 0x23002);
assert.equal(getCharContextAddress(state), 0);

state.anchors.gameplayContextAddress = 0;
state.anchors.contextSlotAddress = 0;
assert.equal(getCharContextAddress(state), state.anchors.charContextAddress);

const contextSlotAddress = 0x12000;
const secondRootAddress = 0x11000;
state.anchors.contextSlotAddress = contextSlotAddress;
writeU32(contextSlotAddress, rootAddress);
writeU32(rootAddress + GAME_CONTEXT_OFFSETS.character, 0x23000);
assert.equal(getGameContextAddress(state), rootAddress);
assert.equal(getCharContextAddress(state), 0x23000);

writeU32(contextSlotAddress, secondRootAddress);
writeU32(secondRootAddress + GAME_CONTEXT_OFFSETS.character, 0x2e000);
assert.equal(getGameContextAddress(state), secondRootAddress);
assert.equal(getCharContextAddress(state), 0x2e000);

writeU32(contextSlotAddress, 0x11002);
assert.equal(getGameContextAddress(state), 0);
assert.equal(getCharContextAddress(state), state.anchors.charContextAddress);

console.log("GameContext child refresh and validation checks passed");
