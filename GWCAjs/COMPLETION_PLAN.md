# GWCAjs Completion Plan

Last updated: 2026-06-07

Target game build: `38615`

Live JSPI build ID: `103f50bb0ce2d744bfbf88a91afce2328b`

Progress tracker: [`PROGRESS.md`](PROGRESS.md)

## Goal

Complete `GWCAjs` as the browser/WebAssembly counterpart of native `GWCA`.
The public API should retain GWCA manager names and behavior where the browser
runtime can support them, while using verified WASM memory layouts, exports,
callbacks, and browser-native replacements internally.

`PlayerMgr` and `MapMgr` are the reference implementations. New managers
should follow their separation of:

- public GWCA-style API in `Source/<Manager>.js`
- memory discovery and cache ownership in `Source/<Manager>State.js` when
  needed
- build-specific callable functions in
  `Source/<Manager>Internals.js`
- reusable layouts and readers in `Include/GWCA/`
- build addresses and indexes in the build signature/export registries
- deterministic tests under `GWCAjs/Tests/`

## Completion Contract

GWCAjs is complete when:

1. Every public API in `gwca/Include/GWCA/Managers/` is represented in the
   corresponding browser manager, or is explicitly documented as a
   browser-only compatibility adaptation.
2. No manager file is an empty placeholder.
3. Required constants, containers, contexts, entities, packet layouts, and
   utility APIs used by those managers are implemented.
4. Build-specific addresses and function indexes are isolated from public
   manager logic.
5. Read APIs use validated context paths and bounded reads. Ordinary getters
   never launch broad memory scans.
6. Action APIs use independently verified current-build functions and expose
   useful availability/status metadata.
7. Deterministic tests pass, and each manager has passed its manual end-to-end
   scenarios on the live client.
8. Initialization, map transitions, character changes, memory growth, page
   reloads, and termination do not leave trusted stale pointers or callbacks.

A native-only concept such as a Direct3D device pointer must not be faked.
Expose the closest browser equivalent, preserve the GWCA name where useful,
and record the compatibility difference in the parity ledger.

## Current Baseline

| Area | State |
| --- | --- |
| Shared `Context` and root promotion | Implemented and live validated |
| `PlayerMgr` | Implemented, native API names represented 17/17 |
| `MapMgr` | Implemented, native API names represented 33/33 |
| `MemoryMgr` and `Scanner` | Growth-safe checked memory, bounded strings, scoped/reusable allocation, arrays, pointer arrays, and lists implemented |
| `GameThreadMgr`, `RenderMgr`, `UIMgr` | Initialization placeholders only |
| Other native managers | Empty placeholders |
| Context/entity/container readers | On-demand GameContext child pointers are centralized; layouts remain complete only for Player/Map paths |
| Deterministic tests | `Memory`, `Containers`, `TemporaryBuffer`, `ContextChildren`, `InstanceInfo`, and `MapTest` |
| Manual testing | Strong coverage for current Player/Map paths |

Native header declaration counts are useful for estimating scope, but they are
not exact API totals because overloads, inline helpers, and UIMgr C wrappers
inflate the count. Track method-level parity explicitly rather than relying on
line counts.

## Working Environment

### Server invariant

The local Python server must remain available on port `8000` throughout work:

```bash
curl -I http://127.0.0.1:8000/
python serve_local_webapp.py --host 0.0.0.0 --port 8000
```

Check first and do not start a second server when the port is already owned by
the project server. The expected response identifies Python
`SimpleHTTPServer` and uses `Cache-Control: no-store`.

Do not automatically launch the game or browser. Open the live client only
when a specific hypothesis is ready for a controlled test.

### Authoritative inputs

Use evidence in this order:

1. Current runtime code and live behavior.
2. Ghidra program `/38615/Gw.jspi.wasm`.
3. `HANDOVER.md`.
4. `Ghidra-Notes.md`.
5. Native GWCA for API shape and semantic clues.

The live JSPI binary is authoritative:

```text
extracted/38615/Gw.jspi.wasm
```

The current non-JSPI `Gw.wasm`, older build `38549`, and native GWCA are
comparison sources, not proof for current JSPI addresses or function indexes.

## Toolchain

### Local source and verification tools

- `rg` and `rg --files` for source, constants, names, packet opcodes, and
  known addresses.
- Node.js for syntax checks, import checks, and deterministic tests.
- Git for reviewing changes without reverting unrelated work.
- `sha256sum` for immutable WASM snapshot records.
- `serve_local_webapp.py` for the web client and patch mirror.
- `extract_patch_file.py` for reconstructing files from mirrored patch chunks.

Run the current deterministic suite with:

```bash
node GWCAjs/Tests/Memory.test.mjs
node GWCAjs/Tests/Containers.test.mjs
node GWCAjs/Tests/TemporaryBuffer.test.mjs
node GWCAjs/Tests/ContextChildren.test.mjs
node GWCAjs/Tests/Guild.test.mjs
node GWCAjs/Tests/InstanceInfo.test.mjs
node GWCAjs/Tests/MapTest.test.mjs
```

Every new manager should add focused tests that can run without the game.

### WASM extraction and dumps

Keep each build in its own immutable directory:

```bash
python extract_patch_file.py Gw.jspi.wasm \
  --output extracted/<build>/Gw.jspi.wasm
python extract_patch_file.py Gw.wasm \
  --output extracted/<build>/Gw.wasm
python extract_patch_file.py version.json \
  --output extracted/<build>/version.json
sha256sum extracted/<build>/Gw.jspi.wasm extracted/<build>/Gw.wasm
```

Create analysis outputs beside the ignored extracted binaries:

```bash
mkdir -p extracted/<build>/analysis
wasm-objdump -h extracted/<build>/Gw.jspi.wasm \
  > extracted/<build>/analysis/Gw.jspi.headers.txt
wasm-objdump -x extracted/<build>/Gw.jspi.wasm \
  > extracted/<build>/analysis/Gw.jspi.details.txt
wasm-objdump -d extracted/<build>/Gw.jspi.wasm \
  > extracted/<build>/analysis/Gw.jspi.disassembly.txt
wasm2wat --generate-names extracted/<build>/Gw.jspi.wasm \
  -o extracted/<build>/analysis/Gw.jspi.wat
wasm-decompile extracted/<build>/Gw.jspi.wasm \
  -o extracted/<build>/analysis/Gw.jspi.dcmp
```

The full dumps are very large. Search them with `rg` and generate them only
when Ghidra or a targeted `wasm-objdump` query is insufficient.

For every new build, record:

- game build number
- browser-reported WASM build ID
- SHA-256 of both WASM variants
- loader/version metadata
- Ghidra project/program names
- date first tested

### Ghidra MCP

Primary comparison pair:

```text
/older version GW/Gw.jspi.wasm
/38615/Gw.jspi.wasm
```

Use Ghidra MCP function search, batch decompilation, xrefs, global-reference
audits, and comments. The repeatable function-matching procedure is:

1. Find and decompile the named function in old build `38549`.
2. Record constants, packet opcode and size, callees, loads/stores, branches,
   raw signature, and neighboring functions.
3. Find the semantic match independently in current build `38615`.
4. Verify the current function index and raw WASM type using the current
   binary.
5. Comment the confirmed current function/global in Ghidra.
6. Record the evidence in `Ghidra-Notes.md`.
7. Only then add a build signature or patched export.

Never infer a universal index delta between builds.

### Browser tools

- Browser DevTools console
- hidden `Show GW Debug` panel
- `/gw-hook/inspector.html`
- `/gw-hook/probe.html`
- manager `Describe()`, `GetActionStatus()`, and diagnostics APIs

After changing `assets/public/gw-hook/capture.js`, perform a full page/client
reload so export patching runs during WASM instantiation.

Live memory scans should be bounded, deliberate, and run once per hypothesis.
Do not copy account names, character names, email addresses, UUIDs, tokens, or
private chat from dumps into project notes.

## Architecture Work

Complete these shared facilities before multiplying manager-specific code.

### 1. API parity ledger

Create a method-level ledger from every native manager header with:

- native signature
- JS name and argument adaptation
- `not-started`, `layout-verified`, `implemented`, `static-tested`,
  `live-tested`, or `adapted` state
- required context/layout
- action export/status name
- test scenario and evidence link

The ledger is the authoritative measurement of parity. Empty methods or silent
`false`/`null` placeholders do not count as implemented.

### 2. Memory and allocation toolkit

Extend shared memory support with:

- refreshed typed views after memory growth
- checked ranges and alignment
- signed/unsigned integer and float reads/writes
- pointer and pointer-slot helpers
- UTF-8 and UTF-16 reads/writes
- scoped `malloc`/`free` and reusable temporary buffers
- checked GW arrays, pointer arrays, lists, and string pointers
- diagnostics that report failure without crashing the client

String-taking action APIs must use this shared allocator instead of custom
buffers in each manager.

### 3. Shared context navigation

Add validated, on-demand accessors for all candidate GameContext children:

- Account
- Agent
- Map
- World
- Cinematic
- Gadget
- Guild
- Item
- Char
- Party

Add PreGame, Trade, TextParser, and other non-GameContext roots only after
their actual current-build ownership is proven. Child pointers must be
re-read across map loads and lifecycle changes.

The static root-anchor search remains an optimization. It must not block
manager implementation while the validated root promotion is reliable.

### 4. Entity and container readers

Port only the layouts needed by the next manager, then validate them against
current JSPI. Readers should:

- retain the native field names where practical
- include the raw address
- validate arrays, enums, IDs, pointers, capacities, and string bounds
- return stable JS objects rather than leaking unchecked raw memory
- make uncertain fields explicit

Do not bulk-copy native offsets into JS without manager-specific invariants.

### 5. Internal-call registry

Move callable metadata toward one build-aware registry containing:

- public purpose
- export name
- current function index and Ghidra address
- raw WASM signature
- old named function
- packet opcode/size where applicable
- PropContext/game-thread requirements
- static and live verification state

`capture.js` should consume a clear patch manifest. Managers should call only
through guarded internals helpers and expose action status.

### 6. Browser lifecycle and callbacks

Implement shared equivalents for:

- scoped PropContext installation/restoration
- safe internal invocation
- game-tick scheduling
- callback registration/removal and altitude ordering
- UI messages, frame callbacks, events, and StoC dispatch
- termination cleanup
- stale-pointer invalidation on map/character lifecycle changes

This foundation is required before callback-heavy GWCA APIs can be considered
complete.

## Implementation Order

### Phase 0: Lock the baseline

1. Create the API parity ledger.
2. Capture the current build metadata, hashes, dumps, and Ghidra program names.
3. Run the existing Node tests and Player/Map smoke checks.
4. Record known live scenarios so later work cannot regress them.
5. Keep the current root scan as the supported fallback.

### Phase 1: Shared foundations

1. Finish memory, strings, scoped allocation, arrays, and list helpers.
2. Add all shared context accessors with validation and lifecycle refresh.
3. Centralize build-specific data and export metadata.
4. Implement the common module shape, public registration, diagnostics, and
   action-status conventions.
5. Implement the minimal GameThread/UI/Event machinery needed by actions.

### Phase 2: Read-only manager wave

Implement reads first, in this order:

1. `GuildMgr`: small surface and the next unvalidated GameContext child.
2. `AgentMgr`: core dependency for Party, Effect, Item interaction, and
   Skillbar.
3. `PartyMgr`: party/player/hero/henchman/pet state.
4. `EffectMgr`: buffs and effects using verified World/Agent data.
5. `QuestMgr`: quest log and encoded text paths.
6. `FriendListMgr`: list state, counts, UUIDs, names, and status.
7. `ItemMgr`: inventory, bags, items, storage, gold, and static item tables.
8. `SkillbarMgr`: skillbars, attributes, static skill data, and template
   codecs.
9. `MerchantMgr` and `TradeMgr`: depend on Item/UI/Trade contexts.
10. `CameraMgr`: camera state and browser-compatible movement/settings.
11. `ChatMgr`: chat log, typing state, channels, colors, and text paths.

For each manager, prove its context and primary arrays in at least two
different live states before implementing actions.

### Phase 3: Action and callback wave

For each manager:

1. Prefer verified low-level message functions.
2. Verify ABI, ownership, packet layout, and context requirements.
3. Add the patched export and action metadata.
4. Add argument guards and scoped temporary memory.
5. Test one reversible or low-risk action first.
6. Test failure paths and unavailable-export behavior.
7. Add callbacks only after shared registration/removal cleanup is proven.

Suggested action order:

1. Guild hall travel/leave.
2. Agent target, move, call-target, and dialog.
3. Party tick, invite/kick, hero/pet, flagging, and return actions.
4. Quest selection/request/abandon.
5. Friend status and list mutation.
6. Item use/move/equip/storage/gold, then destructive salvage/destroy actions.
7. Skill use/load/attribute actions.
8. Merchant quotes/transactions and trade offers.
9. Effect removal.
10. Camera mutation.
11. Chat send/write/command and UI-driven behavior.

Destructive actions require explicit diagnostics and a deliberate manual test
case. Never use a valuable item or irreversible account operation as the
first live proof.

### Phase 4: Browser-native core managers

Complete the managers whose native implementation is tied to process hooks or
Direct3D:

- `UIMgr`: frame discovery, messages, preferences, windows, text decoding,
  callbacks, and frame wrapper classes.
- `GameThreadMgr`: browser/WASM scheduling semantics and callbacks.
- `EventMgr`: event dispatch and cleanup.
- `StoCMgr`: packet callbacks, post callbacks, and safe emulation where
  possible.
- `RenderMgr`: viewport, FOV, render-loop state, callbacks, and explicit WebGL
  adaptations. `GetDevice()` cannot pretend to return a Direct3D9 pointer.
- `Hooker`, scanner, patcher, and debug utilities: browser-compatible behavior
  with explicit unsupported status for native-only patching concepts.

Implement UIMgr in slices rather than as one 221-declaration block:

1. root/frame lookup and validated frame reader
2. UI message send/observe
3. window and visibility APIs
4. encoded-string and preference APIs
5. callback registration and diagnostics
6. button/text/dropdown/checkbox/scrollable frame wrappers
7. remaining compatibility wrappers

### Phase 5: Parity and release pass

1. Fill remaining constants, packet definitions, contexts, entities, and
   utilities required by public APIs.
2. Remove empty files and accidental duplicate implementations.
3. Run the method-level parity audit.
4. Run all deterministic tests.
5. Run the complete manual scenario matrix.
6. Verify clean initialize/terminate/reinitialize behavior.
7. Verify a map transition and character switch with no stale manager state.
8. Update `HANDOVER.md`, `Ghidra-Notes.md`, and `PROGRESS.md`.
9. Document unsupported/adapted native behavior and the exact browser
   replacement.

## Per-Manager Definition Of Done

A manager may be marked complete only when all of these are true:

- Native public methods are represented in the parity ledger.
- Required JS context/entity/container readers exist.
- Current-build layouts are statically verified.
- Reads are bounded and lifecycle-safe.
- Actions have verified current-build metadata and guarded wrappers.
- `Describe()` and action-status diagnostics are available.
- Syntax/import checks pass.
- Deterministic tests cover layout decoding, validation, and action argument
  construction.
- Manual tests pass in every relevant scenario.
- The manager is registered in `GWCA.js` and exposed by `bootstrap.js`.
- Termination removes timers, callbacks, caches, and temporary state.
- Findings are documented without personal game data.

## Manual End-To-End Matrix

Use the live client on port `8000` for these scenarios:

| Scenario | Required coverage |
| --- | --- |
| Before login / character select | initialization failure handling, PreGame-safe APIs |
| Outpost | player, map, guild, party, inventory, friends, chat, UI |
| Explorable area | agents, party, effects, skills, quests, pathing, combat state |
| Map transition | child-context refresh, stale-pointer rejection, callback cleanup |
| Cinematic | map cinematic state and skip action |
| Guild hall | guild state and hall travel/leave |
| Party with hero/henchman | party arrays, hero IDs, flags, behavior, skillbars |
| Storage open/closed | ItemMgr storage state and gold/item movement |
| Merchant open | quote and transaction state |
| Player trade | trade context and offer lifecycle |
| Friend status change | list callbacks and mutation |
| UI windows | frames, messages, preferences, visibility, controls |
| Page reload | export patch presence and clean reinitialization |

For each test record:

- date, build number, and WASM build ID
- scenario and map type
- API and sanitized arguments
- expected and actual result
- action status/export status
- pass/fail and any follow-up

## Efficiency Rules

- Work one manager slice end to end: evidence, layout, reads, actions, tests,
  live validation, docs.
- Reuse the Player/Map module pattern instead of creating new manager styles.
- Batch related Ghidra decompilations and source searches.
- Search old named JSPI first, then current JSPI.
- Keep static data, runtime pointers, and callable functions as separate
  evidence classes.
- Prefer low-level packet/message functions over fragile high-level wrappers.
- Add shared helpers when the second manager needs them, not preemptively.
- Keep broad scans in diagnostics only.
- Reload once after batching export-patch changes.
- Preserve old build snapshots so update work is comparison, not rediscovery.
