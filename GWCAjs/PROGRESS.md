# GWCAjs Progress Checklist

Last updated: 2026-06-07

Execution plan: [`COMPLETION_PLAN.md`](COMPLETION_PLAN.md)

## Status Legend

- `[x]` completed and validated for build `38615`
- `[ ]` not complete
- A manager is complete only after static verification, deterministic tests,
  live tests, public registration, and documentation.

## Current Baseline

- [x] Browser captures the live WASM instance and memory.
- [x] Build `38615` and live JSPI build ID are identified.
- [x] Shared GameContext-like root discovery and promotion work.
- [x] WorldContext and CharContext paths are validated.
- [x] `PlayerMgr` implementation is complete.
- [x] `MapMgr` implementation is complete.
- [x] Existing `InstanceInfo` deterministic test passes.
- [x] Existing `MapTest` deterministic test passes.
- [ ] Full cross-manager regression suite exists.
- [ ] Method-level native-to-JS API parity ledger exists.

## Session Invariants

- [x] Python project server is reachable on port `8000`.
- [ ] Verify port `8000` at the start of every work session.
- [ ] Record the active game build and WASM build ID before live testing.
- [ ] Confirm `Gw.jspi.wasm` is the live binary before using an address/index.
- [ ] Keep live scans bounded and hypothesis-driven.
- [ ] Keep personal/account data out of notes and fixtures.

## Shared Foundations

### Memory And Containers

- [ ] Refresh all typed views after WASM memory growth.
- [ ] Add shared checked range/alignment helpers.
- [ ] Complete integer, float, pointer, and pointer-slot reads/writes.
- [ ] Add bounded UTF-8 read/write helpers.
- [ ] Add bounded UTF-16 read/write helpers.
- [ ] Add scoped `malloc`/`free` helpers.
- [ ] Add reusable temporary string/packet buffers.
- [ ] Complete checked `Array` readers.
- [ ] Complete pointer-array readers.
- [ ] Complete `List` readers.
- [ ] Add deterministic tests for invalid pointers, capacities, and memory
  growth.

### Contexts

- [x] GameContext root.
- [x] CharContext.
- [x] MapContext.
- [x] WorldContext.
- [x] Cinematic state.
- [x] AgentContext path used by current player position.
- [ ] AccountContext.
- [ ] Full AgentContext reader.
- [ ] GadgetContext.
- [ ] GuildContext.
- [ ] ItemContext.
- [ ] PartyContext.
- [ ] PreGameContext.
- [ ] TextParser.
- [ ] TradeContext.
- [ ] On-demand child-pointer refresh tests.
- [ ] Character-switch invalidation tests.

### Build And Calls

- [ ] Central method-level API parity ledger.
- [ ] Central build-aware internal-call registry.
- [ ] Central export patch manifest consumed by `capture.js`.
- [x] Whole-program old/current JSPI correlation tool.
- [x] Build `38615` function mapping ledger generated.
- [x] Build `38615` named analysis WASM generated and validated.
- [x] Previously proven GWCAjs function indexes cross-checked against mapping.
- [x] Import the named analysis WASM into Ghidra.
- [x] Apply 17,044 accepted function names to current JSPI.
- [x] Preserve three existing non-default current-build names.
- [x] Apply the three missing WASM global names.
- [x] Annotate all 433 ambiguous review candidates without renaming them.
- [x] Audit old Ghidra bookmarks; all 11,167 are analyzer-generated.
- [ ] Transfer comments, bookmarks, labels, and renamed symbols stored only
  in the old Ghidra project.
- [ ] Promote review annotations only when independent evidence resolves them.
- [ ] Resolve or confirm removal of four no-candidate old functions.
- [ ] Shared scoped PropContext guard.
- [ ] Shared internal-call argument validation.
- [ ] Shared action status schema.
- [ ] Export-presence tests.
- [ ] Build mismatch fails closed.
- [ ] New-build snapshot/dump checklist automated or scripted.

### Lifecycle And Callbacks

- [ ] Browser game-tick scheduler.
- [ ] Callback registration/removal abstraction.
- [ ] Callback altitude ordering.
- [ ] UI message observation and dispatch.
- [ ] Event dispatch.
- [ ] StoC pre/post dispatch.
- [ ] Termination removes timers and callbacks.
- [ ] Reinitialize does not duplicate callbacks.

## Completed Managers

### PlayerMgr

- [x] Native public API names represented 17/17.
- [x] Player and title layouts.
- [x] Fast current-player and direct agent paths.
- [x] Title and profession/faction actions.
- [x] Action diagnostics.
- [x] Live validation.
- [ ] Include in final full-client regression run.

### MapMgr

- [x] Native public API names represented 33/33.
- [x] Map/instance/context layouts.
- [x] Read-only map state.
- [x] Mission/world map contexts.
- [x] Travel, cinematic, challenge, and altitude actions.
- [x] Action diagnostics.
- [x] Deterministic `InstanceInfo` and `MapTest` coverage.
- [x] Live validation across map transitions.
- [ ] Include in final full-client regression run.

## Manager Implementation Checklist

### GuildMgr

- [ ] Validate `GameContext + 0x3c` as GuildContext.
- [ ] Implement `Guild`, `GuildPlayer`, `GuildHistory`, `CapeDesign`,
  `TownAlliance`, and `GHKey` readers as needed.
- [ ] Implement guild array, current guild, guild lookup, player guild index,
  announcement, and announcer reads.
- [ ] Verify string bounds, guild keys, ranks, and array cross-references.
- [ ] Implement travel-to-hall and leave-hall actions.
- [ ] Add deterministic layout/action tests.
- [ ] Live test guild state and guild hall lifecycle.
- [ ] Register and expose `GWCAjs.Guild`.

### AgentMgr

- [ ] Complete `Agent`, `AgentLiving`, `MapAgent`, and `NPC` readers.
- [ ] Validate agent, map-agent, player, and NPC arrays.
- [ ] Implement controlled, target, mouseover, observing, and lookup reads.
- [ ] Implement name/login/hero ID helpers and encoded-name decoding.
- [ ] Implement target, move, call-target, and dialog actions.
- [ ] Add deterministic array/layout/action tests.
- [ ] Live test in outpost and explorable combat.
- [ ] Register and expose `GWCAjs.Agent`.

### PartyMgr

- [ ] Validate PartyContext and relevant WorldContext arrays.
- [ ] Implement `PartyInfo`, `PartySearch`, `HeroInfo`, `PetInfo`, and
  `Attribute` readers.
- [ ] Implement size, composition, leader, loaded, defeated, tick, and hard
  mode reads.
- [ ] Implement hero/henchman/player lookup helpers.
- [ ] Implement party request, leave, invite, kick, tick, hard mode, return,
  hero/pet, flag, and search actions.
- [ ] Add deterministic layout/action tests.
- [ ] Live test solo, player party, and hero/henchman party.
- [ ] Register and expose `GWCAjs.Party`.

### EffectMgr

- [ ] Implement `Buff`, `Effect`, and `AgentEffects` readers.
- [ ] Validate party/player/agent effect arrays.
- [ ] Implement alcohol and effect/buff lookup reads.
- [ ] Implement drop-buff action.
- [ ] Decide and document browser behavior for post-processing effects.
- [ ] Add deterministic layout/action tests.
- [ ] Live test active effects and buff removal.
- [ ] Register and expose `GWCAjs.Effects`.

### QuestMgr

- [ ] Implement `Quest` and quest-log readers.
- [ ] Validate active quest and quest lookup.
- [ ] Implement encoded quest text/group reads.
- [ ] Implement active, abandon, and request-info actions.
- [ ] Add deterministic layout/text/action tests.
- [ ] Live test with active, completed, and absent quests.
- [ ] Register and expose `GWCAjs.Quest`.

### FriendListMgr

- [ ] Implement `Friend` and `FriendList` readers.
- [ ] Validate alias, character name, UUID, type, and status.
- [ ] Implement list lookups and type counts.
- [ ] Implement current status read.
- [ ] Implement status callbacks and cleanup.
- [ ] Implement set-status, add, ignore, and remove actions.
- [ ] Add deterministic layout/callback/action tests.
- [ ] Live test status changes and list mutation with sanitized logs.
- [ ] Register and expose `GWCAjs.FriendList`.

### ItemMgr

- [ ] Validate ItemContext, inventory, bags, item array, and salvage state.
- [ ] Implement `Item`, `ItemModifier`, `Bag`, `Inventory`, and salvage
  readers.
- [ ] Implement item lookup, bag, hovered item, material, storage, and gold
  reads.
- [ ] Implement PvP item, upgrade, composite model, and formula readers.
- [ ] Implement item-name decoding.
- [ ] Implement item click callbacks and cleanup.
- [ ] Implement use, equip, drop, pickup, move, storage, gold, identify, and
  salvage actions.
- [ ] Gate destructive item actions with strict validation and diagnostics.
- [ ] Add deterministic layout/search/action tests.
- [ ] Live test inventory, storage, and salvage/identify workflows.
- [ ] Register and expose `GWCAjs.Items`.

### SkillbarMgr

- [ ] Implement `Skill`, `Skillbar`, `SkillTemplate`, `Attribute`, and
  `AttributeInfo` readers.
- [ ] Validate static skill/attribute data and skillbar arrays.
- [ ] Implement skill slot, hovered skill, unlocked, and learned reads.
- [ ] Implement skill template encode/decode with deterministic vectors.
- [ ] Implement use-skill callbacks and cleanup.
- [ ] Implement use, load bar/template, profession, and attribute actions.
- [ ] Add deterministic layout/template/action tests.
- [ ] Live test player and hero skillbars.
- [ ] Register and expose `GWCAjs.Skillbar`.

### MerchantMgr

- [ ] Implement merchant item array and transaction/quote structures.
- [ ] Validate merchant-open lifecycle.
- [ ] Implement quote request.
- [ ] Implement buy/sell transaction calls.
- [ ] Add deterministic packet/action tests.
- [ ] Live test buying and selling low-value items.
- [ ] Register and expose `GWCAjs.Merchant`.

### TradeMgr

- [ ] Validate TradeContext and trade-window lifecycle.
- [ ] Implement offered-item and gold reads.
- [ ] Implement open, accept, cancel, change, submit, offer, and remove
  actions.
- [ ] Add deterministic layout/action tests.
- [ ] Live test complete and cancelled player trades.
- [ ] Register and expose `GWCAjs.Trade`.

### CameraMgr

- [ ] Implement `Camera` and vector readers.
- [ ] Validate camera pointer and values across maps.
- [ ] Implement FOV, yaw, position, unlock, and fog reads.
- [ ] Implement movement and camera-setting actions.
- [ ] Add deterministic math/layout/action tests.
- [ ] Live test camera movement and reset behavior.
- [ ] Register and expose `GWCAjs.Camera`.

### ChatMgr

- [ ] Implement chat buffer/message readers.
- [ ] Implement channel mapping and color helpers.
- [ ] Implement typing state and chat-log reads.
- [ ] Implement encoded/plain text conversion.
- [ ] Implement send/write/fake-chat actions.
- [ ] Implement command registration/removal.
- [ ] Implement timestamp and color behavior.
- [ ] Add deterministic format/channel/action tests.
- [ ] Live test local, guild, party, and whisper-safe paths.
- [ ] Register and expose `GWCAjs.Chat`.

## Browser-Native Manager Checklist

### UIMgr

- [ ] Root frame and frame-array discovery.
- [ ] Validated `Frame` reader and relationship traversal.
- [ ] Frame lookup by ID, label, and hash.
- [ ] UI message send and observation.
- [ ] Frame callback registration/removal.
- [ ] Window position and visibility APIs.
- [ ] Encoded string conversion/validation.
- [ ] Preferences and command-line preferences.
- [ ] Input/key APIs.
- [ ] Tooltip, compass, settings, and UI-state APIs.
- [ ] Button frame wrapper.
- [ ] Tabs frame wrapper.
- [ ] Scrollable frame wrapper.
- [ ] Editable text frame wrapper.
- [ ] Text/multiline label wrappers.
- [ ] Checkbox, dropdown, slider, and progress wrappers.
- [ ] Diagnostics/frame hierarchy APIs.
- [ ] Deterministic frame/message/preference tests.
- [ ] Live test representative windows and controls.
- [ ] Register and expose `GWCAjs.UI`.

### GameThreadMgr

- [ ] Define browser/WASM equivalent of game-thread execution.
- [ ] Implement queued calls and clear calls.
- [ ] Implement callback registration/removal.
- [ ] Implement meaningful `IsInGameThread()`.
- [ ] Add ordering, cleanup, and reinitialize tests.
- [ ] Live test calls during normal play and map loading.
- [ ] Register and expose `GWCAjs.GameThread`.

### EventMgr

- [ ] Identify current event source/dispatch path.
- [ ] Implement event callback registration/removal.
- [ ] Preserve callback altitude ordering.
- [ ] Add dispatch/cleanup tests.
- [ ] Live test map or instance events.
- [ ] Register and expose `GWCAjs.Event`.

### StoCMgr

- [ ] Identify current server-to-client dispatch path.
- [ ] Implement packet definitions required by managers.
- [ ] Implement pre and post callbacks.
- [ ] Implement callback removal.
- [ ] Determine safe packet emulation support.
- [ ] Add dispatch/order/cleanup tests.
- [ ] Live test selected non-sensitive packets.
- [ ] Register and expose `GWCAjs.StoC`.

### RenderMgr

- [ ] Map viewport and FOV reads to browser/WebGL state.
- [ ] Implement render-loop and reset callbacks.
- [ ] Implement width, height, fullscreen, and transform behavior.
- [ ] Define explicit compatibility behavior for native `GetDevice()`.
- [ ] Add deterministic matrix/callback tests.
- [ ] Live test resize, fullscreen, and render callbacks.
- [ ] Register and expose `GWCAjs.Render`.

## Constants, Packets, And Utilities

- [ ] Port constants needed by implemented APIs.
- [ ] Port map, skill, quest, agent, and item IDs without hand-edited drift.
- [ ] Port packet opcodes/layouts needed by callbacks and actions.
- [ ] Complete `GamePos` and vector/matrix helpers.
- [ ] Complete logger/debug facilities.
- [ ] Complete browser hook utility surface.
- [ ] Define scanner/file-scanner browser behavior.
- [ ] Define memory-patcher browser behavior.
- [ ] Remove or document native-only utility APIs.

## Integration And Release Gates

- [ ] Every manager is initialized in dependency order.
- [ ] Every manager is exposed by `GWCAjs/bootstrap.js`.
- [ ] Repeated `initialize()` is deterministic.
- [ ] `terminate()` cleans every timer, callback, allocation owner, and cache.
- [ ] Reinitialize after terminate works.
- [ ] Full deterministic suite passes.
- [ ] Full manual end-to-end matrix passes.
- [ ] Outpost-to-explorable transition passes with all managers initialized.
- [ ] Character switch passes without stale pointers.
- [ ] Page reload applies every required export patch.
- [ ] Unknown build fails closed with useful diagnostics.
- [ ] Method-level parity ledger has no unexplained gaps.
- [ ] `HANDOVER.md`, `Ghidra-Notes.md`, and this checklist are current.
