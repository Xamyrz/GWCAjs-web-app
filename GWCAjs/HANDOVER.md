# GWCAjs Browser/WASM Handover

Last updated: 2026-06-06

Target game build: `38615`

## Project Goal

Build a browser-side GWCA-compatible API by reading Guild Wars Reforged
WebAssembly linear memory and selectively exporting useful internal WASM
functions.

The current priority is to use a validated GameContext-like root as the entry
point for managers. Player lookup already works without a character-name
bootstrap.

The optional long-term goal is a cheaper static root anchor. It must not block
manager development because the current validated root scan is working.

## Source Of Truth

Use these in this order:

1. Current runtime code under `assets/public/gw-runtime/` and
   `GWCAjs/Source/`.
2. The live-runtime Ghidra program `/38615/Gw.jspi.wasm`.
3. This handover.
4. `GWCAjs/Ghidra-Notes.md`, which is chronological and contains some
   superseded experiments.
5. `leftOff.md`, which is legacy scratch output and may contain old captures.

Do not copy personal character data, account email addresses, UUIDs, or tokens
from memory dumps into documentation.

## Architecture

### Browser hook

Location: `assets/public/gw-hook/`

- `capture.js`: intercepts WASM instantiation and patches selected exports by
  function index.
- `memory.js`: memory access support.
- `scanner.js`: browser-side scanning support.
- `api.js` and `bootstrap.js`: hook initialization and API exposure.
- `diagnostics.js`: initially hidden `Show GW Debug` panel. It can initialize
  GWCAjs, set secondary profession to Warrior, and log action results.
- `inspector.html` / `inspector.js`: interactive inspection tools.
- `probe.html` and `prop-root-probe.html`: live probing pages.

Do not automatically launch the game, Chromium, or a probe. The game download
is slow and live testing should be deliberate.

### Runtime discovery

Location: `assets/public/gw-runtime/`

- `bootstrap.js` and `index.js`: runtime setup.
- `resolver.js`, `signatures.js`, and `version.js`: build and symbol
  resolution infrastructure.
- `modules/map.js`: root discovery, validation, and context promotion.
- `modules/player.js`: low-level player support.
- `modules/world.js`: WorldContext support.

### Public GWCA-style API

Location: `GWCAjs/Source/`

The main implemented areas are:

- `GWCA.js`: top-level initialization and module order.
- `Context.js`: discovers and promotes the GameContext root and owns shared
  context anchors, mirroring the central `base_ptr` ownership in native
  `gwca/Source/GWCA.cpp`.
- `MapMgr.js`: consumes shared context anchors and exposes map-specific state.
  Its older context discovery methods remain as compatibility delegates to
  `GWCAjs.Context`.
- `PlayerMgr.js`: exposes the GWCA-style player API and title operations.
- `PlayerMgrState.js`: owns player address caching, fast-path resolution, and
  player diagnostics.
- `PlayerMgrInternals.js`: owns current-build internal function metadata and
  guarded message calls.
- `MemoryMgr.js`: memory primitives.
- `GamePos.js`: positional type foundation; currently minimal.

Validated array, Player, Title, CharContext, GameContext, and WorldContext
layouts now live under their mirrored `GWCAjs/Include/GWCA/` paths instead of
being duplicated inside `PlayerMgr.js`.

Many other manager files are placeholders or incomplete, including Guild,
Party, Agent, Item, Skillbar, Chat, Quest, Merchant, Trade, Camera, Effect,
Event, FriendList, and Storage managers.

### Desktop reference

Location: `gwca/`

- `gwca/Include/GWCA/`: API declarations, contexts, and structure layouts.
- `gwca/Source/`: desktop implementations and signature logic.

Desktop layouts are hypotheses for WASM, not proof. Confirm every pointer,
offset, container, and callable function against the live WASM build.

## Available Tools

### Ghidra MCP

The loaded Ghidra projects can be queried directly. Available operations
include function decompilation, batch decompilation, and setting comments.
Additional Ghidra operations can be discovered when needed.

Useful current-build comments have already been added at:

- `ram:8000ac03`: `PropGet`
- `ram:8000aeb3`: `PropContextGet`
- `ram:8000d795`: `PropGetReadOnly`
- `ram:80c0498b`: `CharContextInitialize`

Use Ghidra MCP to:

1. Decompile a known function in the old named build.
2. Record constants, packet opcodes, callees, loads, stores, and control flow.
3. Find and verify the corresponding function in the current build.
4. Comment confirmed current-build functions and important global slots.

### Local static tools

- `rg` / `rg --files`: source and symbol searches.
- `wasm-objdump`: inspect imports, exports, function types, and code.
- Node.js: syntax and module-import checks.
- Git: inspect local changes without reverting unrelated work.

### Browser tools

- Browser DevTools console.
- The hidden `Show GW Debug` panel.
- Hook inspector and probe pages.

Live tools should only be used after the game has fully loaded and when a
specific hypothesis is ready to test. Avoid broad repeated scans.

## WASM Files And Ghidra Programs

### Current build

- Build: `38615`
- Live build ID: `103f50bb0ce2d744bfbf88a91afce2328b`
- Ghidra program: `/38615/Gw.jspi.wasm`
- Raw WASM:
  `/home/xamyr/Projects/gw-webapp-gwca/extracted/38615/Gw.jspi.wasm`

This JSPI binary exactly matches the build ID reported by the live browser
runtime. It is authoritative for linear-memory addresses, function indexes,
layouts, and runtime behavior.

The sibling `/38615/Gw.wasm` program has build ID
`10830b7275570948a0ac9c9ea6700b7a38`. It is useful for comparison, but it is
not the live binary and must not be used as the sole proof for a JSPI
signature.

### Older named build

- Build: `38549`
- Ghidra program: `/older version GW/Gw.jspi.wasm`

This JSPI build has substantially better names and is the preferred semantic
map for the live JSPI binary. Its function indexes and addresses are not
authoritative for build 38615.

Use the two JSPI programs as the primary comparison pair:

1. Find the named function in `/older version GW/Gw.jspi.wasm`.
2. Record its constants, control flow, callees, and neighboring functions.
3. Match that body independently in `/38615/Gw.jspi.wasm`.
4. Take all final indexes and addresses from the current JSPI program.

There is no universal function-index delta between builds. A small cluster may
share a delta, but each target must be independently matched and verified.

## Current Root Model

The practical root is a live object that behaves as both the browser
PropContext and the GWCA GameContext. Its address changes between page loads.

Observed roots include:

- Session A: `13737776`
- Session B: `14632488`

The address is not the anchor. The following relationships are the anchor:

```text
root + 0x0c -> EventContext
EventContext + 0x18 -> root

root + 0x14 -> MapContext
root + 0x2c -> WorldContext
root + 0x44 -> CharContext

CharContext + 0x2ac == WorldContext + 0x67c
WorldContext + 0x80c is a sane player array
controlled agent matches the selected player entry
```

Central `Context` initialization now prefers the PropContext-root search,
promotes the first strongly validated candidate, and falls back to the older
direct GameContext scan only when necessary. This happens before manager
initialization, as native GWCA discovers `base_ptr` in `GWCA::Initialize()`.

Implementation:

- `assets/public/gw-runtime/modules/map.js`
- `GWCAjs/Source/Context.js`

### Desktop-style base pointer

Desktop GWCA uses:

```text
base_ptr -> *base_ptr -> base_context[6] -> GameContext
```

No equivalent stable browser global has been proven. The investigated active
PropContext slot, including `DAT_ram_0028b200`, repeatedly produced the same
invalid value and must not be treated as the root.

Continue searching for a static anchor only as an optimization. The validated
object root is sufficient for context navigation.

## Context Navigation

Desktop `GameContext` suggests these offsets:

```text
+0x28 AccountContext
+0x2c WorldContext
+0x30 CinematicContext
+0x38 GadgetContext
+0x3c GuildContext
+0x40 ItemContext
+0x44 CharContext
+0x4c PartyContext
```

World and Char are currently validated. Treat the remaining offsets as
candidates until their contents pass manager-specific invariants in WASM.

A root gives access to stateful context objects. It does not directly locate
or authorize every executable function. Calling functions is a separate
problem involving current-build function identification, exporting, ABI
verification, pointer ownership, and any required game-thread semantics.

## MapMgr State

The native `MapMgr.h` API names are represented in `GWCAjs.Map`.

Implemented read-only paths include:

- CharContext map, district, language, observation, and instance-type fields.
- WorldContext unlocked maps, mission-map icons, and foe counters.
- AgentContext instance time.
- GameContext cinematic state.
- MapContext pathing-map array.
- Current-build AreaInfo table.
- Optional MapTypeInstanceInfo table when build signatures provide its
  address.
- District-to-region and district-to-language conversions.

Desktop-derived secondary offsets are guarded by pointer, array, and range
validation but still require an in-game test on build `38615`.

Live testing on build `38615` confirmed the core read-only state in both an
outpost and an explorable area. A map transition replaced the MapContext
pointer while the GameContext root remained stable. Shared context accessors
now re-read GameContext child pointers on demand instead of trusting the
initial child-address snapshot. Post-fix live testing confirmed that
`GetContextAddresses().mapContextAddress` follows the new child pointer and
`GetPathingMap()` remains valid in both the outpost and explorable area.

The live JSPI build `103f50bb0ce2d744bfbf88a91afce2328b` has statically
verified read-only anchors for:

- server region at `0x5a4628`
- AreaInfo table at `0x1cbe60`, count `883`, stride `0x7c`

These anchors are wired only into matching build signatures and were live
readback-tested in both an outpost and an explorable area:

- outpost `mapId = 644`: `currentMapInfo.type = 13`, `region = 19`
- explorable `mapId = 548`: `currentMapInfo.type = 2`, `region = 19`
- `GetRegion()` returned server territory `2` from `regionIdAddress = 0x5a4628`

`GetFoesKilled()` and `GetFoesToKill()` read the same Prop `0x0b` fields used
by the current JSPI hard-mode UI (`+0x84c` killed, `+0x850` active/remaining).
The hard-mode UI hides its progress widget when the active count is `0`, so
normal-mode explorable instances can legitimately report `0/0` even when the
AreaInfo entry is vanquishable.

The following actions are represented but unavailable until their current
build targets and ABI are verified:

- `QueryAltitude`
- `Travel`
- `SkipCinematic`
- `EnterChallenge`
- `CancelEnterChallenge`

Use `GWCAjs.Map.GetActionStatuses()` to inspect their current status.

## PlayerMgr State

`PlayerMgr.js` now trusts MapMgr's promoted anchors and uses the real
WorldContext player chain.

Removed or avoided:

- Character-name bootstrap.
- Player-owned root scans.
- Old PropContext fallback paths.
- Runtime `GW.player` passthroughs.
- Expensive scans in ordinary getters.

The desktop PlayerMgr API names are currently represented 17/17, although not
every action has the same level of live verification.

Useful diagnostics:

```js
await GWCAjs.initialize();
GWCAjs.Map.GetContextAddresses();
GWCAjs.Context.GetContextAddresses();
GWCAjs.Player.GetPlayerAddress();
GWCAjs.Player.DescribeFastPlayerPath();
GWCAjs.Player.GetActionStatuses();
```

`GetActionStatus()` reports the callable lower-level implementation used by
the public API. This differs from raw internal metadata for disabled
high-level wrappers.

## Calling Internal Functions

The preferred pattern is:

1. Identify a safe lower-level message function.
2. Verify its current-build index and raw WASM signature.
3. Patch it into the export list in `assets/public/gw-hook/capture.js`.
4. Wrap it with argument validation and useful status metadata.
5. Test through the debug panel before exposing it as stable.

High-level `CharCli*` functions can enter unsuitable asyncify/prologue paths or
assert on browser PropContext state. Public APIs therefore route to verified
lower-level `CharMsgSend*` functions where possible.

Current build 38615 patched exports:

| Purpose | Current index | Current address | Opcode |
| --- | ---: | --- | ---: |
| Adjust guild faction | 6893 | `ram:802bfe73` | `0x35` |
| Set secondary profession | 6903 | `ram:802c01bf` | `0x41` |
| Set active title | 6924 | `ram:802c0f5b` | `0x58` |
| Remove active title | 6925 | `ram:802c0f9e` | `0x59` |

`GWCAjs.Player.ChangeSecondProfession(1)` has been verified in game by the
project owner.

### Example: kick guild guest

Current Ghidra target:

```text
ram:80b0ba56
GuildClient::MsgSendRequestKickGuest(wchar_t const*, unsigned int)
current unnamed function: unnamed_function_7894
```

The decompile builds packet opcode `0xbe`, stores the second argument, copies
a UTF-16 string with a maximum length near `0x100`, and sends a payload near
`0x208` bytes.

The GameContext root is not required to call this message function. A complete
wrapper still needs:

- A proven current function index and signature.
- A patched export.
- Safe writable temporary WASM memory.
- UTF-16 encoding and termination.
- Correct meaning and range for the second argument.
- In-game verification of thread and lifecycle assumptions.

## Guild Work

The likely manager entry is:

```text
GameContext + 0x3c -> GuildContext
```

Desktop references:

- `gwca/Include/GWCA/Context/GuildContext.h`
- `gwca/Include/GWCA/GameEntities/Guild.h`
- corresponding implementations under `gwca/Source/`

Useful desktop GuildContext candidates:

```text
+0x034 player name
+0x060 player guild index
+0x064 guild hall key
+0x078 announcement
+0x278 announcement author
+0x2a0 player guild rank
+0x2a8 town alliances
+0x2cc guild history
+0x2f8 guild array
+0x358 guild roster
```

Useful desktop structure sizes:

```text
Guild          0xac
GuildPlayer    0x174
GuildHistory   0x208
CapeDesign     0x1c
TownAlliance   0x78
```

Start GuildMgr read-only. Validate arrays, string pointers, guild keys, ranks,
and cross-references before adding actions.

## Repeatable Workflow For A New Game Build

1. Preserve the old and current WASM files. Import the new build into a
   separate Ghidra program.
2. Record the build number and a hash of the raw WASM.
3. Re-identify root primitives by semantic body and call shape, not addresses:
   `PropGet`, `PropContextGet`, `PropGetReadOnly`, registration functions, and
   context initialization.
4. Run the root candidate search once and verify all structural invariants.
5. Confirm WorldContext and CharContext first, then validate each additional
   context independently.
6. For callable functions, decompile the old named function and match it in
   the new build using packet opcode, constants, callees, field stores, and
   neighboring functions.
7. Verify the new raw signature and function index from the current WASM.
8. Update `capture.js` exports and manager metadata only after verification.
9. Run static syntax/import checks.
10. Use the debug panel for one controlled live test and record the result.

Never carry forward an address or function index solely because a nearby
function moved by a predictable amount.

## Static Verification

Useful checks:

```bash
node --check GWCAjs/Source/PlayerMgr.js
node --check GWCAjs/Source/MapMgr.js
node --check assets/public/gw-runtime/modules/map.js
node --check assets/public/gw-hook/diagnostics.js
node -e "import('./GWCAjs/Source/PlayerMgr.js').then(() => console.log('import ok'))"
```

These checks do not replace an in-game test for memory layouts or calls.

## Known Risks And Debt

- Initialization still begins with existing browser gameplay seed anchors
  before promoting the real root. Removing that dependency may be worthwhile.
- The root scan is much cheaper than the old broad scan but is still an
  initialization scan, not a static pointer dereference.
- Some later sections of `Ghidra-Notes.md` describe removed PlayerMgr fallback
  paths. Treat them as research history.
- Function exports are build-specific and can silently target the wrong body
  after an update if indexes are copied without semantic verification.
- Raw pointers can become stale during map loads, character changes, or memory
  growth. Managers should revalidate their context before consequential use.
- UTF-16 arguments and packet buffers need a shared temporary-allocation
  strategy before adding many string-taking calls.
- Read APIs and write/action APIs should remain separate. A readable context
  does not prove that a related function is safe to invoke.

## Recommended Next Steps

1. Implement a read-only `GuildMgr` from `root + 0x3c`, with strict context and
   array validation.
2. Add shared validated context accessors for Account, Gadget, Guild, Item,
   Char, and Party rather than duplicating pointer logic in each manager.
3. Reuse the new `Include/GWCA` array, memory, entity, and context readers in
   the next manager instead of duplicating pointer validation.
4. Add a safe shared UTF-16 temporary buffer API for message functions.
5. Keep investigating a static root anchor in Ghidra, but retain the validated
   root scan as the default fallback.
