# GWCAjs Ghidra Notes

## Seed anchors in use

The first `GWCAjs.initialize()` pass uses the existing wasm runtime signatures already present in:

- [`assets/public/gw-runtime/signatures.js`](../assets/public/gw-runtime/signatures.js)

Current gameplay seed anchor:

- `modules.gameplay.contextSlotAddress = 5940872`
- hex: `0x005aa688`
- Current WAT xrefs show this slot is read by `func[13536]` and populated by `func[13537]`, whose body allocates a 120-byte UI/help-guide-style context with internal arrays at offsets such as `+0x20`, `+0x54`, and `+0x64`. Do not treat the pointee as the old `GameContext -> WorldContext` base without further validation.

Current derived anchors:

- `modules.gameplay.contextAddress`
- `modules.gameplay.mapContextAddress`
- `modules.gameplay.charContextAddress`

## Comparison with native GWCA

These are wasm-side anchors. They are not expected to match desktop GWCA raw addresses or scan patterns directly.

What should match conceptually:

- root gameplay context ownership
- map context chain
- character context chain

What should not be assumed to match:

- native process offsets
- native hook points
- native calling conventions

## Current status

The initialization code now uses the existing wasm gameplay anchor chain as the first trusted source.

The current JSPI build is imported separately in Ghidra and is the primary
verification target for the live client:

- project path: `/38615/Gw.jspi.wasm`
- executable path: `/home/xamyr/Projects/gw-webapp-gwca/extracted/38615/Gw.jspi.wasm`
- numeric client build: `38615`
- build ID: `103f50bb0ce2d744bfbf88a91afce2328b`

The older symbolized JSPI build is the preferred semantic comparison target,
but it is not the source of truth for live offsets:

- project path: `/older version GW/Gw.jspi.wasm`
- numeric client build: `38549`

The sibling current `/38615/Gw.wasm` program has a different build ID,
`10830b7275570948a0ac9c9ea6700b7a38`. Use it as supporting evidence only.
Browser-runtime signatures and export indexes must be confirmed in the
matching `Gw.jspi.wasm`.

## Verified runtime findings for build 38615

These values were confirmed from the live browser runtime while attached to the current client:

- `contextSlotAddress = 0x005aa688`
- `gameplayContextAddress = 0x00df2df0`
- `mapContextAddress = gameplayContext + 0x20`
- `charContextAddress` is found by player-name scan with:
  - `nameOffset = 0x74`
  - `assumedNameOffset = 0x74`
  - `hitIndex` is not stable enough to pin across sessions
  - `limit >= 12`

This means the previous assumptions for build `103f50bb0ce2d744bfbf88a91afce2328b` were stale in two places:

- `mapContextAddress` was using offset `0x14`
- `charContextAddress` was using a pinned `hitIndex` and `limit = 3`

Next Ghidra pass should:

1. find the real gameplay/world context root for the active build; `0x005aa688` currently looks like a HelpGuide/UI context slot, not the gameplay world root
2. identify xrefs that populate the real world/player arrays in
   `/38615/Gw.jspi.wasm`
3. verify the semantic owner of any candidate `+0x20` pointer before using it as a map-context pointer
4. document the char-context layout around the validated `playerName` hit

Latest live diagnostic after disabling unsafe Player scans showed:

- `charContextAddress = 0`
- `propContextTableAddress = 0`
- `gameplayContextAddress` equal to the value stored at `0x005aa688`
- the first "world" candidate from that address has a 120-byte/UI-style array header (`buffer = 1`, `capacity = 1`, `size = 1`) and must be rejected as the gameplay/world root

Use the explicit Map-side helpers to recover the native char context by character name:

- `GWCAjs.Context.FindNativeCharContextsByPlayerName(name, { limit: 16 })`
- `GWCAjs.Context.PromoteNativeCharContextByPlayerName(name, { limit: 16 })`

Promotion writes the runtime `modules.gameplay.charContextAddress` override and updates the GWCAjs in-memory anchor cache. Do not replace this with an implicit Player scan fallback.

With MapMgr promoting the PropContext/GameContext root during initialize,
`PlayerMgr` no longer performs root discovery. It trusts the promoted anchors:

- `state.anchors.gameplayContextAddress`
- `state.anchors.charContextAddress`
- `state.anchors.worldContextAddress`

From there, player lookup follows the GWCA-style chain directly.

GWCA desktop `PlayerMgr` is simpler than the earlier JS fallbacks:

- `GetPlayerNumber()` -> `GetCharContext()->player_number`
- `GetPlayerArray()` -> `GetWorldContext()->players`
- `GetPlayerByID(0)` -> `players[GetPlayerNumber()]`

Desktop `GetGameContext()` does not discover the character by name. During
`GW::Initialize()`, GWCA pattern-scans the exe for a static global:

- `Scanner::Find("\x50\x6A\x0F\x6A\x00\xFF\x35", "xxxxxxx", +7)`
- `base_ptr = *(uintptr_t*)address`
- `GetGameContext()` resolves `base_ptr -> *(base_ptr) -> base_context[0x6]`

From that root, `GameContext::world` is at `+0x2c` and
`GameContext::character` is at `+0x44`. The WASM anchor currently named
`modules.gameplay.contextAddress` is not this `GameContext`; its pointee matches
a separate `GameplayContext`/UI-style context.

The current browser-side character-name scan is a bootstrap/proof-of-layout
helper only. The proper GWCA-style browser anchor should be either:

- the WASM equivalent of desktop `base_ptr`, if we can identify the static
  linear-memory slot or global accessor, or
- a validated no-name live-memory scan for a context table whose slot `6` points
  to a `GameContext` satisfying `+0x44 -> CharContext`,
  `+0x2c -> WorldContext`, `world + 0x67c == char + 0x2ac`, and
  `world + 0x80c` is a sane player array.

Base-context discovery lives on the central Context/runtime layer, not a
manager:

The older `GWCAjs.Map` discovery and promotion names remain compatibility
delegates, but new probes should use `GWCAjs.Context`.

- `GWCAjs.Context.FindBaseContextCandidates({ gameContextAddress })` uses a known
  GameContext to locate `baseContextTable = referenceToGame - 0x18`. Searching
  for slots pointing at that table (`basePtrAddress`) is opt-in with
  `findBasePtrSlots: true`; do not enable it during the first live probe.
- `GWCAjs.Context.FindBaseContextCandidates()` performs a bounded no-name table
  scan around the current gameplay-context anchor and validates slot `6` as the
  GWCA-style GameContext.
- `GWCAjs.Context.PromoteBaseContextCandidate(candidate)` writes resolver entries
  for `modules.gameplay.basePtrAddress`, `contextAddress`, `charContextAddress`,
  `mapContextAddress`, and `worldContextAddress`.

Useful live sequence after the current name-bootstrap has found GameContext:

```js
const fast = GWCAjs.Context.FindBaseContextCandidates({
  gameContextAddress: GWCAjs.Player.DescribeFastPlayerPath().gameplayContextAddress,
  referenceLimit: 256,
});
fast.candidates;
GWCAjs.Context.PromoteBaseContextCandidate(fast.candidates[0]);
GWCAjs.Context.GetContextAddresses();
```

If this returns multiple table candidates, compare their `table` details before
promotion:

```js
fast.candidates.map((c) => ({
  table: c.baseContextTableAddress,
  score: c.score,
  tableScore: c.table.score,
  distance: c.table.tableDistanceFromGame,
  nearGame: c.table.insideGameNeighborhood,
  pointerCount: c.table.likelyPointerCount,
  reasons: c.table.reasons,
}));
```

A table very close to the GameContext, e.g. `game + 0xa8`, may be an internal
self/reference field rather than the desktop-style base-context table. Prefer a
candidate with a nonzero `basePtrSlotAddress`; without that, promotion only
persists direct addresses for the current run.

Then, only after the context-table candidate is known, search for base-ptr slots
with a small limit. By default this scans only the static-data range
`0x100000..0x300000`, not the whole heap:

```js
const withBasePtr = GWCAjs.Context.FindBaseContextCandidates({
  gameContextAddress: GWCAjs.Player.DescribeFastPlayerPath().gameplayContextAddress,
  findBasePtrSlots: true,
  referenceLimit: 256,
  basePtrReferenceLimit: 32,
});
withBasePtr.candidates;
```

Interpreting current live candidates:

- A table at `gameContext + 0xa8` with self/odd-tagged pointers is likely an
  internal object, not the desktop-style base-context table.
- A far table with only `slot6GameContext` is a possible reference owner, but
  still not `base_ptr` unless a static slot points to that table.
- Prefer candidates where `basePtrSlotAddress !== 0`; those can be promoted as a
  reload-stable `modules.gameplay.basePtrAddress`.

If `basePtrSlotAddress` stays zero, test references to one table at a time:

```js
GWCAjs.Map.FindBasePtrSlotsForTable(tableAddress, {
  ranges: [
    { start: 0x100000, end: 0x300000 },
    { start: 0x300000, end: 0x1000000 },
  ],
  limit: 32,
});
```

Prefer testing the far table before the `game + 0xa8` table. If no slots point
to either table in static/low dynamic ranges, the WASM build may not preserve
desktop GWCA's `base_ptr -> base_context[6]` shape.

Current base-ptr status: searches for slots pointing to the table candidates
returned zero candidates in the tested ranges. Treat `basePtrAddress` as not
found until a candidate has `basePtrSlotAddress !== 0`.

WASM PropContext root lead:

- `PropContextGet()` returns `DAT_ram_0028b200`.
- `PropContextSet(ctx)` writes `DAT_ram_0028b200 = ctx`.
- `PropGet(prop)` reads `*(DAT_ram_0028b200 + prop * 4)` and asserts if the
  active prop context is null.
- `PropGetReadOnly(prop)` falls back to `&DAT_ram_0028b204` when the active
  prop context is null.
- `PropRegisterCreateFunc(prop, fn)` writes `DAT_ram_0028b2d0 + prop * 4`.
- `PropRegisterDestroyFunc(prop, fn)` writes `DAT_ram_0028b270 + prop * 4`.
- `Event::CreateContext()` allocates a 100-byte PropContext, makes it active,
  reads `PropGet(3)` as the Event::Context, and stores the owning prop context
  at `eventContext + 0x18`.
- `CharContextInitialize()` registers prop `0x0b`; its create callback calls
  `CharCliContextCreate()`, which allocates `0x854` bytes. This matches the
  WorldContext-sized root used by player lookup (`+0x67c`, `+0x80c`).

This gives a basePtr-like WASM root shape:

```js
propContext[3] -> Event::Context
eventContext + 0x18 -> propContext
propContext[0x0b] -> WorldContext
```

Reload evidence from two browser sessions showed the concrete address moves,
but the shape repeats:

- session A: `propContextAddress == gameContextAddress == 13737776`
- session B: `propContextAddress == gameContextAddress == 14632488`
- both sessions had `read32(root + 0x0c) -> eventContext`
- both sessions had `read32(eventContext + 0x18) == root`
- both sessions had `read32(root + 0x2c) -> WorldContext`
- both sessions had `read32(root + 0x44) -> CharContext`
- both sessions validated the WorldContext player number, player array, and
  controlled-agent chain

Important negative result: the active prop-context slot at `DAT_ram_0028b200`
returned the same invalid value (`1852793632`) in both reloads. Treat it as a
native/WASM-internal active context slot, not as the browser-side live root for
GWCAjs promotion.

Future-update root recovery recipe:

1. In Ghidra, re-find the PropContext primitives in the new `Gw.wasm`:
   `PropGet`, `PropContextGet`, `PropContextSet`, `PropGetReadOnly`,
   `PropRegisterCreateFunc`, and `PropRegisterDestroyFunc`.
2. Confirm `PropGet(prop)` still indexes `activePropContext + prop * 4`.
3. Confirm `Event::CreateContext()` still stores the owning prop context in the
   EventContext. For build `38615`, this was `eventContext + 0x18`.
4. Confirm the CharContext/WorldContext prop registration. For build `38615`,
   prop `0x0b` created the `0x854`-byte WorldContext-like object used by player
   lookup.
5. Runtime scan for candidate roots by finding objects where:
   `read32(root + 0x0c)` is an EventContext,
   `read32(eventContext + 0x18) == root`,
   `read32(root + 0x2c)` validates as WorldContext, and
   `read32(root + 0x44)` validates as CharContext.
6. Promote the candidate as the GWCA-style GameContext only if
   `char + 0x2ac == world + 0x67c`, `world + 0x80c` is a sane player array, and
   the controlled-agent path matches the player entry.

This is the current replacement for desktop GWCA's
`base_ptr -> *(base_ptr) -> base_context[6]`. In browser WASM, we have not found
a reload-stable static slot for that chain; the stable thing is the root
signature.

Runtime probe:

```js
GWCAjs.Context.FindPropContextRootCandidates({
  findGameContext: true,
  limit: 8,
});
```

Central `Context` initialization attempts this PropContext-root scan first
with `limit: 1`, then promotes the candidate directly as the GWCA-style
GameContext if `propContextAddress` validates as a GameContext. The older direct
GameContext scan remains as fallback if this root shape stops matching after a
future update.

No-name direct GameContext scan:

```js
const roots = GWCAjs.Context.FindGameContextRootCandidates({
  anchorRadius: 0x800000,
  limit: 8,
  maxRejected: 64,
  maxScanSlots: 4000000,
});
roots.candidates;
GWCAjs.Context.PromoteGameContextRootCandidate(roots.candidates[0]);
GWCAjs.Player.GetPlayerAddress();
```

This scans candidate GameContext addresses directly and validates
`+0x44 -> CharContext`, `+0x2c -> WorldContext`,
`char + 0x2ac == world + 0x67c`, and the player-array/controlled-agent chain.
It does not use character name.

Central `Context` initialization attempts this no-name scan:

- start from the existing gameplay-context anchor as a search neighborhood only
- scan/promote one validated GameContext root
- update GWCAjs anchors for `gameplayContextAddress`, `charContextAddress`,
  `worldContextAddress`, and `mapContextAddress`
- fall back to the old signature anchors if no root candidate validates

To investigate whether there is a reload-stable WASM root pointer even without
desktop `base_ptr`, inspect references to the validated root addresses:

```js
const root = GWCAjs.Context.FindGameContextRootCandidates({ limit: 1 }).candidates[0];
GWCAjs.Context.FindGameContextRootReferences(root, {
  ranges: [
    { name: "staticData", start: 0x100000, end: 0x300000 },
    { name: "lowDynamic", start: 0x300000, end: 0x1000000 },
  ],
  limitPerTarget: 32,
});
```

A static slot pointing directly at `gameContext`/`charContext`/`worldContext`
would not be desktop `base_ptr`, but could still be a better WASM anchor than a
full direct scan.

Reference results now include `owner` and `external` classification. Use
`externalOnly: true` to hide fields inside the already-known root objects:

```js
GWCAjs.Context.FindGameContextRootReferences(root, {
  externalOnly: true,
  ranges: [
    { name: "staticData", start: 0x100000, end: 0x300000 },
    { name: "lowDynamic", start: 0x300000, end: 0x1000000 },
  ],
});
```

`wasm-objdump` around the current `GmContext.cpp` assertion constant (`1078109`) showed a const-table accessor shape, not the main `GameContext` root. Do not infer the root from that function index.

Use the MapMgr root finders for GWCA-style root recovery. PlayerMgr no longer
exports `FindGameContextCandidates`, `PromoteGameContextAddress`, or
`PromoteGameContextFromCurrentCharContext`; those diagnostic/promote paths moved
to MapMgr so PlayerMgr can stay focused on GWCA-style player/title access from
the promoted `WorldContext`.

## Player action function pass

The first export-patching attempt targeted the `CharCli*` wrapper functions and was disabled after `SetActiveTitle()` hit the Emscripten prop-context assertion. The current safer targets are the lower-level `CharMsgSend*` functions called by those wrappers.

The symbolized older JSPI build (`38549`) gives names, but function indexes
must come from the current `38615` JSPI binary. The first live action test used
older-build indexes and called the wrong current functions.

Resolved by matching the symbolized `38549` JSPI packet-builder bodies against
`extracted/38615/Gw.jspi.wasm` and cross-checking current wrapper call sites in
`wasm-objdump -d`:

- `CharMsgSendOrderGuildAdjustFaction(unsigned int, ECharFaction, unsigned int)`
  - old symbolized index: `6895`
  - current `38615` JSPI address: `ram:802bfe73`
  - current `38615` function index: `6893`
  - packet: opcode `0x35`, size `0x10`, fields `opcode, always0, allegiance, amount`
- `CharMsgSendOrderSetProfessionSecondary(unsigned long, ECharProfession)`
  - old symbolized index: `6905`
  - current `38615` JSPI address: `ram:802c01bf`
  - current `38615` function index: `6903`
  - packet: opcode `0x41`, size `0x0c`, fields `opcode, agentId, profession`
- `CharMsgSendSetTitle(unsigned int)`
  - old symbolized index: `6926`
  - current `38615` JSPI address: `ram:802c0f5b`
  - current `38615` function index: `6924`
  - packet: opcode `0x58`, size `0x08`, fields `opcode, titleId`
- `CharMsgSendSetTitleNone()`
  - old symbolized index: `6927`
  - current `38615` JSPI address: `ram:802c0f9e`
  - current `38615` function index: `6925`
  - packet: opcode `0x59`, size `0x04`, fields `opcode`

Observed index shift:

- This `CharMsgSend*` cluster is shifted by `-2` from old symbolized build `38549` to current build `38615`.
- Do not assume all functions are shifted by `-2`.
- Nearby wrappers show different deltas:
  - `CharCliPlayerSetTitle`: old `9261`, current `9252` (`-9`)
  - `CharCliPlayerSetTitleNone`: old `9262`, current `9253` (`-9`)
  - `CharCliProfSetSecondary`: old `9272`, current `9265` (`-7`)
  - `CharCliPlayerOrderGuildAdjustFaction`: old `9228`, current `9222` (`-6`)

So use `38549` for names and body shape, then derive current indexes from `38615` by body matching, opcode/call-shape matching, and wrapper call-site cross-checks.

After first live test, `GWCAjs.Player.SetActiveTitle("Drunkard")` did not crash the client but caused a connectivity drop. That test used stale `38549` indexes; in current `38615`, `func[6926]` is not `CharMsgSendSetTitle`. After correcting to `func[6924]`, `SetActiveTitle` worked.

These four action exports are now patched unconditionally by `assets/public/gw-hook/capture.js`, and PlayerMgr action methods call them directly.

`ChangeSecondProfession()` does not need a full `Player` struct lookup. Ghidra shows the native UI path calls `CharCliAgentGetControlled()`, which does:

- `MissionCliGetPlayerId()` -> `PropGet(0x11) + 0x2ac` -> current player number
- `CharCliPlayerGetAgent(playerId)` -> `PropGet(0x0b) + 0x80c` -> player array buffer
- `agent_id` -> `playerArray.buffer + playerId * 0x50 + 0x00`

Relevant current-build function indexes from the current JSPI disassembly:

- `CharCliPlayerGetAgent(unsigned int)`: old `func[8926]`, current `func[8924]`
- `CharCliAgentGetControlled()`: old `func[8927]`, current `func[8925]`
- `MissionCliGetPlayerId()`: old `func[9512]`, current `func[9510]`

This is now the preferred fast path for current-player actions. It avoids the slower post-map-change player discovery path for profession changes and does not depend on a guessed `gameContext -> worldContext` field.

PlayerMgr also keeps the last known current `Player` slot address. Once `GetPlayer()` or `GetPlayerAddress()` has resolved the current player, later action calls can read:

- `cachedPlayerAddress + 0x00` -> current `agent_id`

The cached current-player slot has no TTL; it is invalidated only by failed pointer/agent-id sanity checks. This supports the observed behavior that the player slot address can remain stable while its `agent_id` changes across maps.

For hot action calls, `ChangeSecondProfession()` uses a fast-only agent-id lookup:

1. cached current `Player` slot at `+0x00`
2. direct `WorldContext.players[char.player_number].agent_id`
3. direct `WorldContext.playerControlledChar.agent_id`
4. return `false`

Player action diagnostics:

- `GWCAjs.Player.GetInternalFunction("ChangeSecondProfession")` reports the
  disabled high-level `CharCli*` wrapper export.
- `GWCAjs.Player.GetInternalFunction("SendOrderSetProfessionSecondary")`
  reports the lower-level message function that the public API actually calls.
- `GWCAjs.Player.GetActionStatus("ChangeSecondProfession")` is the preferred
  public availability check; it reports `available: true` when either the direct
  wrapper or lower-level message path is callable.

Do not run broad scan fallbacks from hot or read APIs. A live-client crash was observed when `GetPlayerAddress()` fell through to `GW.player.getPlayer({ scan: true })` with no return value. `resolveContextChain()` now only validates MapMgr-promoted anchors.

After a crash was observed following `GetPlayerAddress()`, current-player address reads were changed back to fast-only:

- `GetPlayerAddress(0)` uses the prop-table current-player path first, then direct `gameContext -> worldContext -> playerArray` offsets, and returns `0` if both fail.
- `GetPlayer(0)` uses the same fast-only address path.
- Explicit slower discovery must go through `DiscoverPlayer()` / `DiscoverAgent()` and should not be hidden inside hot/read APIs.

The fast current-player address first mirrors `CharCliAgentGetControlled()` via the active prop context:

- prop context table slot: `0x28b680`
- static default context address used by some non-`PropGet` callers: `0x28b684`
- player prop id: `0x0b`
- mission prop id: `0x11`
- mission player number offset: `0x2ac`
- player array layout: buffer `+0x80c`, capacity `+0x810`, size `+0x814`, param `+0x818`, stride `0x50`

Current `func[222]` / `PropGet(EProp)` reads the active context pointer from linear-memory address `0x28b680` and asserts if it is null. It does not use `0x28b684` as a replacement table. However, current `func[232]` / `PropGetReadOnly(EProp)` and nearby callers use `PropContextGet() || 0x28b684`, where `0x28b684` is the default prop table address itself, not another pointer slot.

JS prop reads now prefer the active slot table when present, then fall back to the default table address. A prop handle of `0` is still treated as missing, and arrays must pass buffer/capacity/memory validation before use.

`CharCliPlayerGetAgent(playerId)` validates/grows against the player array capacity before reading `buffer + playerId * 0x50`. The JS fast path therefore treats capacity as the usable slot bound and only requires a plausible `agent_id` at the computed slot. This avoids rejecting live arrays whose `size` is temporarily `0` or behind the current player number while capacity is already populated.

As a fallback, it validates candidate world-context pointers across 4-byte-aligned offsets from `gameContext + 0x00` through `+0x7c`, then accepts `playerArray.buffer + playerNumber * stride` when `player + 0x00` contains a plausible `agent_id`; it does not validate the full `Player` struct. Use `GWCAjs.Player.DescribeFastPlayerPath()` to inspect both the prop-table path and the fixed-offset world-context path without scans.

## MapMgr Action Research

Old named build `38549` confirms:

- `PartyClient::MsgSendTravelMission(...)` builds packet opcode `0xb1` with
  size `0x18`.
- `Cinematic::MsgSendAbortRequest()` builds packet opcode `0x63` with size
  `0x04`.
- `MapQueryAltitude(MapPoint const&, float, float*, Coord3f*)` uses Prop `5`
  and requires writable temporary arguments and output storage.

Broad current-build similarity searches timed out in Ghidra MCP on
2026-06-06. Do not patch exports from guessed index deltas.

QueryAltitude was later verified against the current JSPI WAT and Ghidra:

- current function index: `5557`
- current address: `ram:80256d05`
- old named function:
  `MapQueryAltitude(MapPoint const&, float, float*, Coord3f*)`
- raw signature: `(i32, f32, i32, i32) -> i32`
- uses `PropGet(5)`, path engine pointer `+0x78`, path props `+0x74`,
  props `+0x7c`, and terrain pointer `+0x84`
- `GWCAjs.Map.QueryAltitude()` allocates temporary WASM storage for
  `{x,y,z}`, altitude output, and optional `Coord3f` terrain-normal output
- Naked JS export calls trap in `PropGet(5)` with
  `ASSERTION FAILED: s_propContext` because current `PropGet` reads slot
  `0x28b680`. `GWCAjs` wraps only `QueryAltitude` by temporarily writing the
  resolved gameplay context / prop table address into `0x28b680` and restoring
  the previous value after the synchronous call.

EnterChallenge and CancelEnterChallenge were verified in the current party
client wrapper cluster:

- `EnterChallenge`: current `func[10577]` at `ram:803888df`
  (`PartyCliSelectMission(int)`), raw signature `(i32) -> nil`
- `func[10577]` calls the party-table select-mission routine with hard-coded
  mission `0x373` and the caller-provided identifier; GWCAjs passes
  `MapID::Count` (`0x36d`) by default, matching native GWCA
- `CancelEnterChallenge`: current `func[10574]` at `ram:8038889d`
  (`PartyCliRedirectCancel()`), raw signature `() -> nil`
- both wrappers begin with `PropGet(0x13)` and therefore require the active
  PropContext slot `0x28b680`; GWCAjs installs the validated root for each
  synchronous export call and restores the previous slot afterward

Current `func[6860]` is `CharMsgSendChallengeAbort(unsigned int)`, packet
opcode `0x11`, size `0x08`; it is not the MapMgr CancelEnterChallenge path.

Agent position fast path:

- Old named `AgentGetPosition(unsigned long)` at `ram:802bd0dd` takes
  `(out MapPoint*, agentId)` and reads `PropGet(2)`.
- The old body validates `agentId < *(AgentContext + 0x154)`, reads the agent
  pointer from `*(AgentContext + 0x14c) + agentId * 4`, and calls
  `IAgent::CAgent::GetPointAtTime(out, agent, *(AgentContext + 0x1ac))`.
- `IAgent::CAgent::GetPointAtTime(unsigned int) const` at old
  `ram:802b7c98` shows the underlying stable offsets:
  - stopped movement time: `Agent + 0x48`
  - movement start time: `Agent + 0x58`
  - current point: `Agent + 0x78/0x7c/0x80`
  - stopped point: `Agent + 0x88/0x8c/0x90`
  - velocity: `Agent + 0xb0/0xb4`
  - bounds: `AgentContext + 0x1b0/0x1b4/0x1b8/0x1bc`
- GWCAjs uses this direct memory path for `GWCAjs.Player.GetPosition()` rather
  than exporting the accessor, which avoids the slow AgentLiving scan and keeps
  current player position available for `Map.QueryAltitude`.

Travel was later verified against the current JSPI WAT:

- current function index: `10632`
- old named function: `PartyClient::MsgSendTravelMission(EMission,
  ETerritory, unsigned int, ELanguage, int)`
- raw signature: `(i32, i32, i32, i32, i32) -> nil`
- packet opcode: `0xb1`
- packet size sent through `MsgConnSendStruct`: `0x18`
- field order:
  - `+0x00`: opcode `0xb1`
  - `+0x04`: map id / mission
  - `+0x08`: territory / server region
  - `+0x0c`: district number
  - `+0x10`: `language & 0xff`
  - `+0x14`: final int flag, currently passed as `0` by GWCAjs

The current body is `func[10632]` and calls current `func[10328]`
(`NetGameClientGetMsgConn`) then `func[5937]` (`MsgConnSendStruct`). It is now
patched as `__gwca_msg_send_travel_mission`; live in-game travel behavior was
verified on 2026-06-06.

SkipCinematic was later verified against the current JSPI WAT:

- current function index: `7768`
- old named function: `Cinematic::MsgSendAbortRequest()`
- raw signature: `() -> nil`
- packet opcode: `0x63`
- packet size sent through `MsgConnSendStruct`: `0x04`
- packet field order:
  - `+0x00`: opcode `0x63`

The current body is `func[7768]` and calls current `func[10328]`
(`NetGameClientGetMsgConn`) then `func[5937]` (`MsgConnSendStruct`). It is now
patched as `__gwca_msg_send_abort_cinematic`; live in-cinematic behavior was
verified on 2026-06-06.

## MapMgr Read-Only Data Anchors

Live JSPI build `38615`
(`103f50bb0ce2d744bfbf88a91afce2328b`):

- `ConstGetMissionClientData(EMission)` is current `func[17482]`.
- Its body bounds-checks against `883`, multiplies the map ID by `0x7c`, and
  adds table base `0x1cbe60`.
- `NetGameClientGetCurrTerritory()` is current `func[10164]`.
- It reads the signed territory value at linear-memory address `0x5a4628`.
- Current `func[10165]` is the neighboring setter; its `-3` guard and store to
  `0x5a4628` confirm the getter's semantics.

The corresponding named functions in `/older version GW/Gw.jspi.wasm` were
used to recover semantics. The final constants and indexes were independently
verified from `extracted/38615/Gw.jspi.wasm` and
`/38615/Gw.jspi.wasm`.

Static samples from the current AreaInfo table:

- map `548`: campaign `4`, region `19`, type `2` (`ExplorableZone`)
- map `644`: campaign `4`, region `19`, type `13` (`City`)

Current JSPI MapTypeInstanceInfo table:

- base `0x160b84`
- count `31`
- stride `0x0c`
- row shape: `request_instance_map_type:u32`, `is_outpost:u32`,
  `map_region_type:u32`
- native `GetMapTypeInstanceInfo()` returns the first row matching the requested
  region type and the native outpost rule
- live-tested rows:
  - `ExplorableZone` (`2`) at `0x160c3c`, request type `1`, outpost `false`
  - `City` (`13`) at `0x160bd8`, request type `0`, outpost `true`
  - `MissionArea` (`14`) at `0x160c48`, request type `1`, outpost `false`
  - `Dungeon` (`18`) at `0x160c54`, request type `1`, outpost `false`

Desktop GWCA `GetInstanceInfoPtr()` returns the address of a static
`InstanceInfo*` slot found by the native scanner pattern, while JSPI
`MissionCliGetInstance/Map/Type/World` reads mission-client fields through
`PropGet(0x11)`. Named/current WAT comparison found no current JSPI function
that materializes the native five-field struct or pointer slot.

GWCAjs therefore exposes a stable compatibility allocation with the same ABI:
a four-byte pointer slot followed by the 20-byte struct. It refreshes
`instance_type` from mission Prop `0x11` and `current_map_info` from the
verified AreaInfo table on each call. The unverified terrain pointers and
count remain zero. `modules.map.instanceInfoPtrAddress` can replace this
allocation if a future build exposes a real slot. Live browser readback passed
on 2026-06-07: the slot and pointee were valid, instance type was `0` in an
outpost, and `current_map_info` exactly matched `GetCurrentMapInfo().address`.

A live scan for pointer-slot candidates whose pointee matched
`{ instance_type, current_map_info }` returned no hits in the normal JSPI
data/global ranges. A later struct-shape scan found `0x5a230c`, but current WAT
`func[7247]` writes
`0x5a2310 = MissionCliGetObserveMapType()` and
`0x5a2314 = ConstGetMissionClientData(observeMapId)`, while `func[7256]`
treats `0x5a2318` as `f64`. This makes it a JSPI map-info cache, not the
desktop `InstanceInfo` layout.

`GetMissionMapContext()` and `GetWorldMapContext()` are callback-owned UI frame
contexts in native GWCA. The browser build can recover them without patching a
callback:

- current `func[6520]` (`ram:802ae89e`) confirms the active frame pointer array
  global at `0x5a0aac` and count at `0x5a0ab4`
- frame callbacks use the array header at frame `+0xa8`; callback entries are
  `0x0c` bytes, with the indirect table index at `+0x00` and callback context
  slot at `+0x04`
- frame ID is at frame `+0xbc`
- old named `MapWindowFrameProc` is `func[16047]`; its independently matched
  current body is `func[16088]` (`ram:805aa1c4`), indirect table slot `4000`
- mission-map create message `9` allocates `0x48`; destroy message `0xb` frees
  it; the embedded frame ID is at context `+0x14`
- old named `MapFullScreenFrameProc` is `func[16134]`; its matched current
  wrapper is `func[16175]` (`ram:805b3b70`), indirect table slot `4143`, with
  current implementation `func[16176]`
- world-map create allocates `0x224`; destroy frees it; the embedded frame ID
  is at context `+0x00`

The implementation scans only active frames and revalidates the callback and
frame ID on every call. It intentionally does not cache the callback context
slot because the destroyed object can leave a stale pointer behind. Static
matching is complete, and live open/close readback passed on 2026-06-07.

## MapTest State Machine

The native MapTest helper is a travel-race state machine rather than a
current-build internal function:

- `step0` increments `tries`, travels to the anchor map using the current
  region/language, and enters `wait0`
- the configured anchor load message enters `wait1`
- after `delay_ms`, `step1` sends `count` travel packets to the alternate map
  with region `0`, configured district number, and language `0`, then enters
  `run`
- if the anchor remains loaded through `timeout_ms`, the test finishes `done`
- if another map wins, or the anchor was not observed at timeout, the machine
  waits for loading to finish, settles for 100 ms, and retries from `step0`

GWCAjs implements these same phases in `GWCAjs/Source/MapTest.js`. Since the
browser UI manager does not yet expose native callback registration,
`kLoadMapContext` is detected by an anchor-map MapContext pointer replacement;
`kStartMapLoad` also accepts the loading transition and then falls back to the
same context-replacement signal. The polling controller uses a 16 ms
cancellable timer and preserves native status strings and retry-count
semantics.

The native defaults (`count = 3`, unlimited retries) proved unsafe as browser
defaults in a live test on 2026-06-07: repeated conflicting travel requests
could leave the client on the loading/map-change screen. GWCAjs therefore uses
one packet and one attempt by default, plus a 15-second loading watchdog.
`maxTries = 0` remains available when the native unbounded stress behavior is
specifically required. The diagnostic state records `failureReason` as
`max-tries-reached`, `loading-timeout`, or a travel-call failure.

A second live test confirmed that even one conflicting request can leave the
browser client at a 100% loading screen after the JavaScript controller has
already stopped. `MapTestStart` now refuses execution with
`unsafe-opt-in-required`; only the explicitly named `MapTestStartUnsafe`
method sends the travel race.

Live browser readback confirmed the same values after reload:

- `GetServerRegionPtr()` -> `0x5a4628`
- `GetRegion()` -> server territory `2`
- outpost current map `644` returned the AreaInfo entry at `0x1df690`
- explorable current map `548` returned the AreaInfo entry at `0x1dc810`

## Whole-Program JSPI Symbol Mapping

On 2026-06-07 a repeatable whole-program correlator was added at:

```text
GWCAjs/Tools/map-jspi-symbols.mjs
```

It compares the old named and current authoritative JSPI binaries using
signatures, normalized instruction bodies, direct-call normalization,
large-address normalization, instruction shape, function-order anchors, and
mutual opcode similarity.

Current build `38615` results:

- old imports/functions considered: `17739`
- exact/high-confidence one-to-one mappings: `17302`
- review-only one-to-one candidates: `433`
- old functions with no same-signature current candidate: `4`
- duplicate auto-applied target indexes: `0`

The four no-candidate old functions are:

```text
func[6634]  IFeatureFlag::FeatureFlagLocalOverridesSave()
func[7717]  IAgentView::SoundArrowZip(float, Coord3f const&,
                                      Coord3f const&, int)
func[8672]  AvRender(float,
                     TArray<HGrModel_tag*, TArrayCopyBits<HGrModel_tag*>>*,
                     unsigned int*, unsigned int*)
func[13325] IUi::Game::CameraAdvance(float, Coord3f*, Coord3f*, float*)
```

They should be treated as removed or ABI-reworked until independently found.

The mapper creates:

```text
GWCAjs/SymbolMapping/38615/function-map.json
GWCAjs/SymbolMapping/38615/function-map.csv
GWCAjs/SymbolMapping/38615/Gw.jspi.named.wasm
```

The named WASM appends a synthesized name section to the unmodified current
binary. It contains only accepted function names, plus compatible old
module/global/data-segment name subsections. Code addresses are unchanged.
Annotations stored only in the old Ghidra project, such as comments,
bookmarks, extra labels, and manual renames, require a separate metadata
transfer pass.

Known-index validation passed for all previously proven GWCAjs calls:

```text
func[5557]  MapQueryAltitude(MapPoint const&, float, float*, Coord3f*)
func[6893]  CharMsgSendOrderGuildAdjustFaction(...)
func[6903]  CharMsgSendOrderSetProfessionSecondary(...)
func[6924]  CharMsgSendSetTitle(unsigned int)
func[6925]  CharMsgSendSetTitleNone()
func[7768]  Cinematic::MsgSendAbortRequest()
func[10574] PartyCliRedirectCancel()
func[10577] PartyCliSelectMission(int)
func[10632] PartyClient::MsgSendTravelMission(...)
```

Additional Guild hall action validation:

```text
func[10631] PartyClient::MsgSendTravelGuildHall(Guid const&, int)
func[10633] PartyClient::MsgSendTravelMissionLogin(int)
```

`IUi::GameFrameProc` registers `0x10000180` (`kGuildHall`) and `0x10000182`
(`kLeaveGuildHall`). Both route through
`IUi::MapSelect(unsigned int, IUi::CMission const&, int)`: mode `0` reaches
`PartyClient::MsgSendTravelGuildHall`, while mode `2` reaches
`PartyClient::MsgSendTravelMissionLogin`.

PartyContext build `38615` baseline:

```text
PartyClient::ContextCreate() allocates 0xd0 bytes
GameContext + 0x4c -> PartyContext*
PartyContext + 0x14 -> flag
PartyContext + 0x40 -> Array<PartyInfo*>
PartyContext + 0x54 -> player_party
PartyContext + 0x9c -> CSearchTable
PartyContext + 0xc0 -> Array<PartySearch*>
```

`PartyCliHardModeGet()` reads `flag >> 4 & 1`, and `PartyCliIsLeader()` reads
`flag >> 7 & 1`. `PartyClient::CPartyTable::HardModeSet(int)` updates the same
flag bit and sends `PartyClient::MsgSendHardModeSet(int)`.

```text
func[10629] PartyClient::MsgSendHardModeSet(int)
packet opcode 0x9b, size 0x08
export patch __gwca_msg_send_hard_mode_set

func[10630] PartyClient::MsgSendSignal(int)
packet opcode 0xaf, size 0x08
export patch __gwca_msg_send_signal

func[10616] PartyClient::MsgSendLeave()
packet opcode 0xa2, size 0x04

func[16298] IUi::Game::Party::CPartyButtonFrame::OnClick(int)
export patch __gwca_party_button_on_click
leave mode: synthetic 0x38-byte context with *(context + 0x34) = 1
```

Live testing showed that directly exporting and invoking
`PartyClient::MsgSendLeave()` returned normally but did not leave a
three-member party. The in-game Leave button instead calls `PartyCliLeave()`
and then `CharCliHeroDeactivate(0x28)`. GWCA's desktop implementation reaches
that complete sequence through `CPartyButtonFrame::OnClick`, so the JSPI
implementation now exports that callback and temporarily installs the
validated Prop context around it.

Live result: the replacement party-window callback successfully left the
party.

Party WorldContext readers use the build-38615 native layouts:

```text
WorldContext + 0x0ac -> Array<PartyAttribute>, stride 0x43c
WorldContext + 0x594 -> Array<CharHeroData>, stride 0x9c
WorldContext + 0x6ac -> Array<PetInfo>, stride 0x1c
```

More precisely, current build `38615` embeds `CharClient::CPetMgr` at
`WorldContext + 0x6ac`. Its first four fields are the array header, and
`CPetMgr::EnumAll` copies seven `u32` fields per `0x1c`-byte entry:

```text
+0x00 agent id
+0x04 owner agent id
+0x08 allocated wchar_t name pointer
+0x0c model file id 1
+0x10 model file id 2
+0x14 AI mode
+0x18 priority/locked target id
```

Live output validated the numeric fields. The name buffer can contain an
encoded Guild Wars string and still needs a general text-parser decoder.

`CHeroMgr::GetData(EHero)` validates `0x9c`-byte records. Build `38615`
`CharHeroData` starts with hero ID, active agent ID, level, professions,
hero/model file IDs, and stores the 20-unit name buffer at `+0x74`.

`CAttribMgr::AttribEnum(agentId, cursor)` reads active attribute IDs from the
array header at `PartyAttribute + 0x424`. The backing record contains 51
`0x14`-byte slots from `+0x04`; inactive slots are stale storage and must not
be presented as current attributes.

Live validation with Ogden Stonehealer confirmed hero ID `27`, professions
Monk/Mesmer (`3/5`), and active attributes `1,2,3,13,14,15,16` with levels
`0,0,6,12,0,2,11`. These values matched the in-game panel. The standard
hero's inline `CharHeroData` name was empty, so standard hero and pet display
names both require the asynchronous game text decoder rather than direct
UTF-16 interpretation.

The implemented decoder path is:

```text
func[5864] TextResolveIssue(wchar_t const*, callback, void*)
func[9107] CharCliAgentGetCodedName(unsigned long)
```

`TextResolveIssue` validates the encoded string, resolves `EProp 6`, and calls
`IText::CDecodeTable::New`. Browser JS cannot be inserted directly into an
`anyfunc` table, so the hook instantiates a minimal auxiliary WASM module with
an imported JS callback and places its exported `(i32, i32) -> void` function
in the game table for the lifetime of each decode.

`wasm-validate` passes for the synthesized binary. It was imported as
`/38615-symbol-map/Gw.jspi.named.wasm`.

The generic `merge_program_documentation` endpoint was not suitable for these
programs. Its all-code-unit dry run exceeded 30 minutes and temporarily
blocked Function-tree Swing updates. The target remained untouched because
the operation was a dry run. Saving, closing, and reopening both JSPI
programs cleared the stale `In progress` Function-tree nodes.

The targeted application tools are:

```text
GWCAjs/Tools/apply-jspi-symbols-ghidra.mjs
GWCAjs/Tools/annotate-jspi-review-candidates.mjs
```

Final current-program state:

- `17044` default-named functions renamed
- `42` accepted functions were already named
- `3` existing non-default names preserved
- `__stack_pointer`, `__stack_end`, and `__stack_base` applied
- all `433` ambiguous candidates have explicit review plate comments
- review candidates remain unrenamed
- all `11167` old-program bookmarks are analyzer-generated Address Table
  bookmarks; there are no user bookmarks to transfer
- analysis is complete and idle with `17993` functions

Both application tools are idempotent. Final dry runs reported `planned: 0`.
