# GWCAjs Browser/WASM Handover

Last updated: 2026-06-07

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

### Shared memory foundation

The hook and GWCAjs memory layers now provide:

- automatic typed-view refresh after `WebAssembly.Memory.grow()`
- checked ranges and optional alignment
- signed/unsigned 8-, 16-, and 32-bit values, floats, pointers, and pointer
  slots
- bounded UTF-8 and UTF-16 reads/writes
- checked `malloc`/`free` plus scoped sync/async allocation helpers
- scoped UTF-8 and UTF-16 callback helpers

Deterministic coverage is in `GWCAjs/Tests/Memory.test.mjs`. It checks invalid
ranges and pointers, string capacity failures, cleanup after successful and
failed callbacks, invalid allocator results, and memory growth.

The memory helpers passed a live build `38615` smoke test on 2026-06-07:

```text
GWHook.isValidRange(0x10000, 4) -> true
GWHook.isValidPointer(0x10000) -> true
GWHook.withAllocation(...write/read 12345...) -> 12345
```

The shared container layer now includes:

- strict `Array<T>` header validation with `size <= capacity`
- capacity-bound slot lookup for live arrays whose size temporarily lags
- optional explicit null-buffer empty arrays
- checked pointer-array decoding with nullable slots
- bounded `TList<T>` traversal using the stored embedded-link offset
- circular sentinel, tagged-end, cycle, traversal-limit, and back-link checks

Deterministic coverage is in `GWCAjs/Tests/Containers.test.mjs`. Reusable
temporary buffers are provided by
`Include/GWCA/Utilities/TemporaryBuffer.js`. The pool:

- reuses best-fit idle allocations
- clears requested bytes before each checkout
- gives concurrent and nested calls exclusive leases
- releases synchronous and asynchronous callbacks in `finally`
- bounds retained idle buffers and bytes
- frees idle buffers at `GWCAjs.terminate()`
- safely frees active leases when they return after termination
- provides reusable UTF-8 and UTF-16 callback helpers

`MapMgr.QueryAltitude()` is the first consumer. It now uses one packed
temporary block instead of three independent allocations. Deterministic
coverage in `GWCAjs/Tests/TemporaryBuffer.test.mjs` verifies reuse, clearing,
concurrent checkout, exceptions, async cleanup, UTF strings, termination
disposal, and altitude argument/result layout.

The migrated path passed a controlled live build `38615` regression on
2026-06-07. At the current player position it returned:

```text
result=1
ok=true
altitude=-3460.92578125
terrainNormal=(0.0519233271, 0.0207693316, -0.9969278574)
```

Callback-heavy code must not retain lease addresses after release.

### Shared GameContext navigation

`Include/GWCA/Context/GameContext.js` now owns named descriptors and
on-demand accessors for:

```text
+0x08 AgentContext
+0x14 MapContext
+0x18 TextParser
+0x28 AccountContext
+0x2c WorldContext
+0x30 CinematicContext
+0x38 GadgetContext
+0x3c GuildContext
+0x40 ItemContext
+0x44 CharContext
+0x4c PartyContext
+0x58 TradeContext
```

Every call re-reads the child slot from the current root. Char/Map/World
anchors are fallback discovery hints only when no valid root is available; an
invalid child under a valid root does not fall back to a stale anchor.

Agent, Map, World, Cinematic, and Char are labeled `validated`. Account,
TextParser, Gadget, Item, Party, and Trade are labeled `pointer-only` until
manager-specific invariants prove their layouts. Guild is labeled
`live-tested-readonly` after build `38615` outpost validation. The public
Context API reports all addresses and these verification levels.

Deterministic coverage in `GWCAjs/Tests/ContextChildren.test.mjs` verifies
child replacement, root-slot replacement, invalid pointers, stale-anchor
rejection, and fallback behavior when the root is unavailable.

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
- MapTypeInstanceInfo table at `0x160b84`, count `31`, stride `0x0c`

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

`GetMapTypeInstanceInfo()` is wired to the current JSPI static table and has
been live-tested in both an explorable and an outpost. Verified rows include:

- `ExplorableZone` (`2`) -> request instance map type `1`, `isOutpost = false`
- `City` (`13`) -> request instance map type `0`, `isOutpost = true`
- `MissionArea` (`14`) -> request instance map type `1`, `isOutpost = false`
- `Dungeon` (`18`) -> request instance map type `1`, `isOutpost = false`

The desktop `GetInstanceInfoPtr()` pointer slot is not present in the browser
build. Native GWCA returns the address of a static `InstanceInfo*` slot, not the
`InstanceInfo` struct itself. The current JSPI mission getters instead read
individual fields through mission Prop `0x11`; named/current WAT comparison
found no function that materializes the native five-field struct.

`GWCAjs.Map.GetInstanceInfoPtr()` now preserves the native pointer-to-pointer
contract with a stable 24-byte WASM allocation: a four-byte pointer slot
followed by the 20-byte `InstanceInfo` layout. Each call refreshes
`instance_type` from the verified mission-client map type and
`current_map_info` from the current-build AreaInfo table. JSPI has no verified
equivalent for either terrain pointer or `terrain_count`, so those fields are
zero. A future build can override the compatibility allocation with
`modules.map.instanceInfoPtrAddress`; the older
`modules.map.instanceInfoAddress` key remains a compatibility fallback.

A live scan for pointer-slot candidates whose pointee matched
`{ instance_type, current_map_info }` returned no hits in the normal JSPI
data/global ranges. A later struct-shape scan found `0x5a230c`, but WAT shows
this is a JSPI map-info cache:
`0x5a2310 = MissionCliGetObserveMapType()` and
`0x5a2314 = ConstGetMissionClientData(observeMapId)`. The following qword at
`0x5a2318` is treated as `f64`, so this is not the desktop `InstanceInfo`
layout. Deterministic coverage is in `GWCAjs/Tests/InstanceInfo.test.mjs`;
live pointer readback passed on 2026-06-07. The returned slot contained the
expected struct pointer, reported outpost instance type `0`, and its
`current_map_info` exactly matched `GetCurrentMapInfo().address`. The
unavailable terrain count remained zero as intended.

`GetMissionMapContext()` and `GetWorldMapContext()` now recover the same
callback-owned contexts without installing browser-side hooks. Build `38615`
keeps active frame pointers in the array at `0x5a0aac`, with its count at
`0x5a0ab4`. Each frame has a callback array at `+0xa8` and frame ID at `+0xbc`;
callback entries are `0x0c` bytes and their `+0x04` field is the context slot
used as `message->wParam`.

The current callback identities are:

- mission map: current `func[16088]`, indirect table slot `4000`, context size
  `0x48`, embedded frame ID at `+0x14`
- world map: current `func[16175]`/`func[16176]`, indirect table slot `4143`,
  context size `0x224`, embedded frame ID at `+0x00`

`GWCAjs/Include/GWCA/Context/MapUIContext.js` scans only the bounded active
frame array, matches the exact callback slot, validates the context allocation
range and embedded frame ID, then decodes the native layouts. It does not cache
the pointer, because both callbacks free their object on frame destruction and
do not reliably clear the callback slot. This was statically verified against
the current and named JSPI binaries, then live-tested successfully for both map
windows on 2026-06-07.

The MapTest travel-race state machine is implemented in
`GWCAjs/Source/MapTest.js`. It preserves the native phases, status strings,
packet burst arguments, timeout behavior, 100 ms settle period, and retry
counter. `MapTestGetState()` is also exposed for browser diagnostics.

The browser runtime does not currently expose native UI-message callback
registration. MapTest therefore maps `kLoadMapContext` (`0x10000098`) to the
anchor map arriving with a replaced live MapContext pointer. For
`kStartMapLoad` (`0x100000c2`), it additionally accepts the earlier loading
transition, while retaining the native fallback to the load-context signal.
The controller polls on a cancellable 16 ms timer and stops itself if GWCAjs is
terminated or reinitialized. Deterministic tests are in
`GWCAjs/Tests/MapTest.test.mjs`.

The initial live browser test on 2026-06-07 used the native defaults of three
alternate packets and unlimited retries. It could remain on the loading/map
change screen because the alternate map kept winning and the native `wait2`
phase has no loading deadline. Browser defaults are now deliberately safer:
`count = 1`, `maxTries = 1`, and `loadingTimeoutMs = 15000`. Failures stop the
controller and appear in `MapTestGetState().failureReason`.

Even one conflicting alternate travel request reproduced the stuck 100%
loading screen. `MapTestStart(...)` therefore fails closed with
`failureReason = "unsafe-opt-in-required"` and sends no travel packets. The
actual race is exposed only as:

```text
MapTestStartUnsafe(mapId, altMapId, number, count, delayMs, timeoutMs,
                   messageId, maxTries, loadingTimeoutMs)
```

Passing `maxTries = 0` restores native-style unlimited retries. This method can
strand the client and should only be used when a page/game restart is
acceptable.

Use `GWCAjs.Map.GetActionStatuses()` to inspect patched action export status.

`QueryAltitude` now has a verified current JSPI target:

- export patch: `__gwca_map_query_altitude`
- current function index: `5557`
- current address: `ram:80256d05`
- old named function:
  `MapQueryAltitude(MapPoint const&, float, float*, Coord3f*)`
- raw signature: `(i32, f32, i32, i32) -> i32`

`GWCAjs.Map.QueryAltitude({ x, y, z }, radius)` allocates temporary WASM
storage for the input point, altitude output, and terrain-normal output, then
returns an object with `result`, `ok`, `altitude`, and `terrainNormal`. Passing
an output object as the third argument keeps a more native-like shape:
`QueryAltitude(pos, radius, out)` returns the integer result and fills `out`.
When called from JS, this export needs an active PropContext. `GWCAjs` now
temporarily writes the resolved gameplay context pointer into the current-build
PropContext slot `0x28b680` for this call and restores the previous slot value
afterward. Without that wrapper the export traps with
`ASSERTION FAILED: s_propContext`.

`GWCAjs.Player.GetPosition()` now has a fast direct path and should be used
instead of raw `GW.player`. It resolves the current player through the direct
player array, reads the current agent id, then reads the engine agent pointer
from `PropGet(2)` or from the `gameplayContext + 0x08` AgentContext child
using the old named `AgentGetPosition` layout:

- agent prop id: `0x02`
- agent pointer array: `AgentContext + 0x14c`
- agent count: `AgentContext + 0x154`
- instance timer: `AgentContext + 0x1ac`
- world bounds: `AgentContext + 0x1b0/0x1b4/0x1b8/0x1bc`
- agent current point: `Agent + 0x78/0x7c/0x80`
- movement timing/velocity: `Agent + 0x58`, `Agent + 0xb0/0xb4`
- stopped point: `Agent + 0x88/0x8c/0x90`

The slow `FindAgentLivingCandidates*` scan helpers remain for diagnostics only.
They are intentionally stricter now to avoid false-positive struct matches.

`EnterChallenge` and `CancelEnterChallenge` now have verified current JSPI
party-client wrapper targets:

- `EnterChallenge` export patch: `__gwca_party_select_challenge_mission`
- `EnterChallenge` current function index: `10577`
- `EnterChallenge` old named function: `PartyCliSelectMission(int)`
- `EnterChallenge` raw signature: `(i32) -> nil`
- `GWCAjs.Map.EnterChallenge()` passes `MapID::Count` (`0x36d`) by default,
  matching native GWCA's `kSendEnterMission` payload
- the wrapper calls `PropGet(0x13)`, so GWCAjs temporarily installs the
  validated PropContext root in slot `0x28b680` around the export call
- `CancelEnterChallenge` export patch:
  `__gwca_party_cancel_enter_challenge`
- `CancelEnterChallenge` current function index: `10574`
- `CancelEnterChallenge` old named function: `PartyCliRedirectCancel()`
- `CancelEnterChallenge` raw signature: `() -> nil`
- the cancel wrapper uses the same temporary PropContext handling

Current `func[6860]` is `CharMsgSendChallengeAbort(unsigned int)` with packet
opcode `0x11`, size `0x08`. Do not confuse it with MapMgr
`CancelEnterChallenge`, which cancels party redirect/mission entry.

`Travel` now has a verified current JSPI lower-level message target and has
been live-tested in-game:

- export patch: `__gwca_msg_send_travel_mission`
- current function index: `10632`
- old named function: `PartyClient::MsgSendTravelMission(EMission,
  ETerritory, unsigned int, ELanguage, int)`
- packet opcode: `0xb1`
- packet size: `0x18`
- fields: `mapId`, `region`, `districtNumber`, `language & 0xff`, final
  unknown flag currently passed as `0`

`GWCAjs.Map.Travel(mapId, region, districtNumber, language)` calls the patched
export when present. It requires a full page/client reload after
`assets/public/gw-hook/capture.js` changes so the WASM export patch is applied
during instantiation.

`SkipCinematic` now has a verified current JSPI lower-level message target:

- export patch: `__gwca_msg_send_abort_cinematic`
- current function index: `7768`
- old named function: `Cinematic::MsgSendAbortRequest()`
- packet opcode: `0x63`
- packet size: `0x04`

`GWCAjs.Map.SkipCinematic()` calls the patched export when present. The current
target and packet layout are statically verified from current JSPI WAT and were
live-tested in a cinematic on 2026-06-06.

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

The manager entry is statically confirmed for build `38615`:

```text
GameContext + 0x3c -> GuildContext
```

Current JSPI evidence:

- `GuildClient::ContextCreate()` allocates `0x3bc`.
- `GuildCliGetGuildId()` reads `+0x60`.
- `GuildCliGetGuildGuid()` returns `+0x64`.
- `GuildCliGetMotd()` and `GuildCliGetMotdAuthor()` use `+0x78` and `+0x278`.
- `GuildCliGetClientRank()` reads `+0x2a0`.
- `GuildCliGetGuildName/Tag()` use the pointer array at `+0x2f8`.
- `GuildCliGetMember()` uses the roster table at `+0x358`.
- `GuildCliGetMemberCount()` sums `+0x378/+0x37c/+0x380`.

Confirmed GuildContext fields:

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

Current JSPI structure sizes:

```text
Guild          0xb0
GuildPlayer    0x12c
GuildHistory   0x90
CapeDesign     0x1c
TownAlliance   0x78
```

The legacy desktop headers still describe `Guild` as `0xac`, `GuildPlayer` as
`0x174`, and `GuildHistoryEvent` as `0x208`; do not use those sizes for the
current JSPI pointer arrays. The current constructors/Add paths allocate the
sizes above.

The read-only implementation now lives in:

- `Include/GWCA/Context/GuildContext.js`
- `Include/GWCA/GameEntities/Guild.js`
- `Source/GuildMgr.js`

It validates the full context range, bounded array headers, entity pointers,
guild slot/index agreement, player-guild cross-references, guild ranks, and
roster status counts. `GWCAjs.Guild` exposes the native read surface plus
roster/history/town-alliance diagnostics. Hall travel and leave remain
explicitly unavailable until their UI message paths are verified.

Live build `38615` probing found a populated guild entry with `faction = 4`
(`Lg Hd Tv Q Plus` / `LGHD`), so the guild faction plausibility bound is
`0..4`; do not reduce it to the old desktop Kurzick/Luxon-only assumption.

The read-only GuildContext path was live-validated in an outpost and a guild
hall on 2026-06-07. In the outpost, `GWCAjs.Guild.Describe()` returned
`context.valid = true` with:

- player guild index `1`, rank `4`, and a non-empty GHKey matching the guild
  entry key
- guild array size `2`, with populated slot `1`
- roster size `3`, two non-null members, and status counts `[0, 1, 1]`
- two guild-history entries
- eighteen town-alliance entries

The history text field can contain Guild Wars control-code prefixes. The
current Guild-specific normalizer strips the observed control markers from
history entries, exposes parsed `names`, and preserves the original text as
`rawName`. It also decodes the low 16 bits of `time` as the displayed
MM/DD/YYYY day serial and maps the two observed event codes:

- `0x0345`: `Guild founded by <name>.`
- `0x0346`: `New member <name> (invited by <name>).`
- `0x0349`: `<name> kicked by <name>.`
- `0x8101`: `<name> left the guild.`

This is not a general TextParser replacement.

After travelling to the guild hall, `GWCAjs.Guild.Describe()` again returned
`context.valid = true` with the same player guild index, rank, GHKey, roster,
history, and town-alliance counts. The `GuildContext` address stayed at
`13747520`, while the guild array backing buffer moved from `273479912` to
`37413360`, confirming that callers must re-read array headers and pointers
instead of retaining entry addresses across map transitions.

The derived guild-hall helpers were also live-validated in the guild hall:

```text
GWCAjs.Guild.Describe().isCurrentMapGuildHall -> true
GWCAjs.Guild.Describe().currentGuildHall.name -> "Lg Hd Tv Q Plus"
GWCAjs.Guild.Describe().currentGuildHall.tag -> "LGHD"
GWCAjs.Guild.GetCurrentGH().name -> "Lg Hd Tv Q Plus"
GWCAjs.Guild.GetCurrentGH().tag -> "LGHD"
```

Deterministic coverage is in `GWCAjs/Tests/Guild.test.mjs`. The next live step
is to identify the UI message paths before enabling hall actions.

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
- Temporary buffer addresses are lease-scoped and must not be retained by
  callbacks or internal functions after the synchronous/awaited call returns.
- Read APIs and write/action APIs should remain separate. A readable context
  does not prove that a related function is safe to invoke.

## Ghidra JSPI 38615 wasm now contains symbols

- We have copied over the symbols from old version to the current '38615' to help and reduce time in comparing between
  the two versions and sometimes duplicating efforts.

## Guild Hall Action Wiring

Ghidra verification for build `38615`:

- `kGuildHall` (`0x10000180`) and `kLeaveGuildHall` (`0x10000182`) are
  registered by `IUi::GameFrameProc`.
- Both route through `IUi::MapSelect(unsigned int, IUi::CMission const&, int)`.
- Guild-hall travel uses mode `0`, then
  `PartyClient::MsgSendTravelGuildHall(Guid const&, int)`.
  - current function index: `10631`
  - export patch: `__gwca_msg_send_travel_guild_hall`
  - packet opcode/size: `0xb0` / `0x18`
- Leave-guild-hall uses mode `2`, then
  `PartyClient::MsgSendTravelMissionLogin(int)`.
  - current function index: `10633`
  - export patch: `__gwca_msg_send_travel_mission_login`
  - packet opcode/size: `0xb2` / `0x08`

`GWCAjs.Guild.TravelGH()` writes the current `GHKey` through the temporary
buffer pool before calling the travel export. `GWCAjs.Guild.LeaveGH()` sends the
same `1` argument used by the verified UI path. Both fail closed unless their
patched exports are present.

Live validation commands after a browser reload:

```js
GWCAjs.Guild.GetActionStatuses()
GWCAjs.Guild.GetPlayerGuildHallKey()
GWCAjs.Guild.TravelGH()
GWCAjs.Guild.LeaveGH()
```

Live result: user reported the Guild Hall action path works.

## Party Read-Only Baseline

Ghidra verification for build `38615`:

- `PartyClient::ContextCreate()` allocates `0xd0` bytes.
- The Party context is `GameContext + 0x4c`.
- `PartyClient::CPartyTable` starts at `PartyContext + 0x04`.
- `flag` is at `PartyContext + 0x14`.
  - hard mode: `0x10`
  - defeated: `0x20`
  - leader: `0x80`
- `parties` is a `PartyInfo*` array at `PartyContext + 0x40`.
- `player_party` is at `PartyContext + 0x54`.
- `PartyClient::CSearchTable` starts at `PartyContext + 0x9c`.
- party-search pointer array is at `PartyContext + 0xc0`.

Implemented read-only JS surface:

- `GWCAjs.Party.Describe()`
- `GetPartyInfo()`, `GetPartySearch()`, `GetPartySearchArray()`
- party size, player count, hero count, henchman count
- hard mode, defeated, leader, loaded, and ticked reads
- basic hero-agent lookup from the current `PartyInfo`

Party actions currently fail closed with explicit diagnostics until their JSPI
packet senders are independently verified.

`SetHardMode()` is the first wired Party action:

- `PartyClient::MsgSendHardModeSet(int)`
- current function index: `10629`
- export patch: `__gwca_msg_send_hard_mode_set`
- packet opcode/size: `0x9b` / `0x08`
- public behavior: returns `true` without sending when the requested state is
  already active; otherwise sends `1` or `0` through the patched export

Live result: user reported `SetHardMode(true)` and `SetHardMode(false)` work,
and `GetIsPartyInHardMode()` reflects both JS and manual UI changes.

`Tick()` is wired as the next Party action:

- `PartyClient::MsgSendSignal(int)`
- current function index: `10630`
- export patch: `__gwca_msg_send_signal`
- packet opcode/size: `0xaf` / `0x08`
- public behavior: returns `true` without sending when the current player's
  ticked state already matches the requested flag; otherwise sends `1` or `0`
  through the patched export

Live result: user reported `Tick(true)` and `Tick(false)` work, and
`GetIsPlayerTicked()` reflects both states.

`LeaveParty()` is wired through the same callback used by the party window:

- `IUi::Game::Party::CPartyButtonFrame::OnClick(int)`
- current function index: `16298`
- export patch: `__gwca_party_button_on_click`
- synthetic context size: `0x38`, with leave mode `1` at offset `0x34`
- the callback calls `PartyCliLeave()` followed by
  `CharCliHeroDeactivate(0x28)`
- public behavior: requires a readable player party; returns `true` without
  calling when party size is `1` or less; otherwise invokes the callback with
  the validated gameplay context installed in Prop slot `0x28b680`

Rejected path: direct invocation of `PartyClient::MsgSendLeave()` at current
function index `10616` returned successfully but did not leave a live
three-member party. Its export patch was removed.

Live result: user reported the replacement callback returned `true` and
successfully left the party.

Party read helpers now also cover:

- `GetHeroAgentID(0)` for the controlled character and one-based hero indexes
- `GetAgentHeroID(agentId)` from the current party hero array
- `GetHeroPartyMember(index)` for the party entry and its actual `heroId`
- `GetHeroInfo(heroId)` from `WorldContext + 0x594`
- `GetHeroInfoByIndex(index)` as the unambiguous party-index convenience path
- `GetPetInfo(ownerAgentId)` from `WorldContext + 0x6ac`
- `GetAgentAttributes(agentId)` from `WorldContext + 0x0ac`
- `GetIsHardModeUnlocked()` from `WorldContext + 0x684`

The validated entity sizes are `CharHeroData = 0x9c`, `PetInfo = 0x1c`,
`Attribute = 0x14`, and `PartyAttribute = 0x43c`.

`PartyAttribute` contains 51 fixed attribute slots at `+0x04`, followed by
the active attribute-ID array header at `+0x424`. Public `attributes` contains
only those active IDs; `allAttributes` preserves the backing slots for
diagnostics.

Live result with Ogden Stonehealer:

- `GetHeroInfoByIndex(1)` returned hero ID `27`, agent ID `19`, level `20`,
  primary profession `3` (Monk), and secondary profession `5` (Mesmer)
- the standard hero record's inline name buffer was empty
- active attribute IDs were `1, 2, 3, 13, 14, 15, 16`
- base/current levels were `0/0, 0/0, 6/6, 12/12, 0/0, 2/2, 11/11`,
  matching the in-game Skills and Attributes panel

Build `38615` stores pets in `CPetMgr` at `WorldContext + 0x6ac`; its leading
array uses `0x1c`-byte `PetData` entries. Pet names may remain Guild Wars
encoded strings. The reader returns readable ASCII names as `name`, preserves
the source as `rawName`, and reports `nameEncoding`.

Encoded display names now have Promise-based decoders:

- `DecodePetName(ownerAgentId = 0)` decodes the pet's `nameAddress`
- `DecodeHeroNameByIndex(index = 1)` obtains the coded name through
  `CharCliAgentGetCodedName(agentId)` and decodes it
- `TextResolveIssue(encoded, callback, param)` is exported as
  `__gwca_text_resolve_issue` from current function index `5864`
- `CharCliAgentGetCodedName` is exported as
  `__gwca_char_get_coded_name` from current function index `9107`

The hook creates a tiny typed WASM callback trampoline, adds it to the game
function table, resolves the decoded UTF-16 string immediately in the
callback, and releases the table entry. Decode results are cached by encoded
source text. Build `38615` declares a fixed `4676/4676` function table, so the
hook reserves 64 additional table slots while patching the module before
instantiation. This requires a full page reload before decoding can work.

Live validation commands after reload:

```js
GWCAjs.Party.Describe()
GWCAjs.Party.GetPartyInfo()
GWCAjs.Party.GetPartySize()
GWCAjs.Party.GetPartyPlayerCount()
GWCAjs.Party.GetPartyHeroCount()
GWCAjs.Party.GetPartyHenchmanCount()
GWCAjs.Party.GetIsLeader()
GWCAjs.Party.GetIsPartyLoaded()
GWCAjs.Party.GetIsPartyTicked()
GWCAjs.Party.GetIsPartyInHardMode()
GWCAjs.Party.GetActionStatuses()
GWCAjs.Party.SetHardMode(true)
GWCAjs.Party.SetHardMode(false)
GWCAjs.Party.Tick(true)
GWCAjs.Party.GetIsPlayerTicked()
GWCAjs.Party.Tick(false)
GWCAjs.Party.GetIsPlayerTicked()
GWCAjs.Party.LeaveParty()
GWCAjs.Party.GetHeroAgentID(0)
GWCAjs.Party.GetHeroAgentID(1)
GWCAjs.Party.GetAgentHeroID(GWCAjs.Party.GetHeroAgentID(1))
GWCAjs.Party.GetHeroPartyMember(1)
GWCAjs.Party.GetHeroInfoByIndex(1)
GWCAjs.Party.GetPetInfo()
await GWCAjs.Party.DecodeHeroNameByIndex(1)
await GWCAjs.Party.DecodePetName()
GWCAjs.Party.GetTextDecoderStatus()
```

## Recommended Next Steps

1. Reload the browser and live-validate `GWCAjs.Party.Describe()` while solo in
   an outpost.
2. Repeat Party validation with heroes/henchmen added.
3. Live-test the new hero, pet, and attribute readers with matching entities
   present.
4. Verify the next Party action sender, likely add/remove henchman or hero,
   using packet opcode and current function index evidence.
5. Keep investigating a static root anchor in Ghidra, but retain the validated
   root scan as the default fallback.
