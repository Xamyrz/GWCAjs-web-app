# GWCAjs Plan

## Goal

Build a clean JavaScript API layer in `Gw-Webapp` called `GWCAjs` that can hook into `Gw.wasm`, using the existing browser hook infrastructure as the low-level transport.

The first milestone is to implement and test `GWCAjs.initialize()` so we can prove that:

- the wasm instance is captured reliably
- linear memory access is working
- required root anchors can be resolved for the current build
- initialization state and failures are reported cleanly

## Why a new layer

The repo already contains:

- `serve_local_webapp.py`
- `assets/public/gw-hook/*`
- `assets/public/gw-runtime/*`

That is enough to capture the wasm instance, inspect memory, and expose some Guild Wars-specific helpers. But the current runtime is partial and messy, and it is not shaped like a stable GWCA-style API.

We should treat `GWCAjs` as a fresh API layer with clear boundaries:

- `gw-hook` stays low-level and generic
- `GWCAjs` becomes the Guild Wars-specific API surface
- existing `gw-runtime` code can be reused selectively, but it should not define the architecture

## Architectural direction

The native `GWCA::Initialize()` flow in `vendor/gwca` does four important things:

1. initialize scanning and memory discovery
2. resolve root pointers and gameplay contexts
3. initialize modules
4. enable hooks

We should preserve that contract conceptually, but adapt it for the wasm/browser runtime.

### Browser-side equivalent

`GWCAjs.initialize()` should:

1. wait for `window.GWHook` to capture the wasm instance
2. verify wasm memory helpers are usable
3. identify the current build
4. resolve required root anchors for that build
5. initialize internal module state
6. expose structured readiness and structured failure details

## Important constraint

Native GWCA offsets and hooks are not directly portable.

Desktop GWCA:

- scans a native x86 process
- depends on native process memory layout
- uses native hooks/detours
- assumes native calling conventions

`Gw.wasm`:

- runs inside a browser/embedded web runtime
- uses wasm linear memory
- exposes imports, exports, and table entries instead of native code injection points
- may preserve gameplay structure concepts without preserving native binary layout

So native GWCA is useful for:

- API shape
- manager/module boundaries
- context naming
- candidate semantic anchors

It is not a source of truth for:

- raw addresses
- hook mechanics
- direct function offsets

## Proposed folder layout

Create a new folder that mirrors GWCA naming and ownership:

```text
Gw-Webapp/GWCAjs/
  README.md
  Source/
    GWCA.js
    MemoryMgr.js
    Scanner.js
    UIMgr.js
    ...
  Include/
    GWCA/
      Managers/
      Context/
      GameEntities/
      GameContainers/
      Constants/
      Utilities/
      Logger/
      Packets/
```

Notes:

- `Source/` mirrors `vendor/gwca/Source`
- `Include/GWCA/` mirrors `vendor/gwca/Include/GWCA`
- all mirrored files should exist up front, even if many start as placeholders
- implementation can then proceed file by file without changing structure later

## Phase plan

### Phase 1: inventory and boundaries

Goal: decide what we keep, what we replace, and what becomes an internal dependency.

Tasks:

- inspect `assets/public/gw-hook/*`
- inspect `assets/public/gw-runtime/*`
- identify any existing useful resolver logic
- avoid extending messy surfaces directly
- define `GWCAjs` as a separate, clean entry point

Status:

- completed at a planning level

### Phase 2: scaffold `GWCAjs`

Goal: create the new folder and public API skeleton.

Tasks:

- create `Gw-Webapp/GWCAjs/`
- mirror the full GWCA `Source` file set as `.js`
- mirror the full GWCA `Include/GWCA` tree as `.js`
- add `README.md`
- define the initial public contract

Expected public API:

```js
import { initialize, isInitialized, terminate } from "./Source/GWCA.js";
```

Or browser-side:

```js
const result = await GWCAjs.initialize();
```

### Phase 3: implement `GWCAjs.initialize()`

Goal: make initialization real before we attempt feature modules.

`initialize()` should:

- wait for `window.GWHook.ready`
- collect build information
- confirm memory helpers exist
- confirm memory can be read safely
- resolve a minimal required anchor set
- cache the result in internal state
- return a structured initialization report

Suggested return shape:

```js
{
  initialized: true,
  buildId: "...",
  anchors: {
    baseContext: 0x0,
    gameplayContext: 0x0,
    pregameContext: 0x0
  },
  warnings: [],
  errors: []
}
```

If initialization fails, it should fail loudly and descriptively.

### Phase 4: verify root anchors in Ghidra

Goal: prove that our first build resolver is based on real wasm structures.

Native GWCA initialization in `vendor/gwca/Source/GWCA.cpp` resolves these kinds of roots:

- `base_ptr`
- `GameplayContext_addr`
- `PreGameContext_addr`
- `GetGameContext()` context chain

For wasm, we should use Ghidra to identify the equivalent structures in `Gw.wasm`.

Tasks:

- inspect the currently open `Gw.wasm` in Ghidra
- identify whether existing runtime signatures already map to context roots
- compare semantic targets, not literal byte patterns
- document every confirmed anchor in `GWCAjs/src/resolver/ghidra-notes.md`
- record mismatches between native GWCA assumptions and wasm reality

Success criterion:

- at least one trusted root context chain is confirmed against `Gw.wasm`

### Phase 5: build-aware resolver registry

Goal: centralize build/version-specific anchor definitions.

Tasks:

- define a build registry keyed by wasm build ID
- store resolver rules and anchor metadata per build
- reject initialization when required anchors are missing
- allow future builds to be merged without changing module code

This is where we want discipline early, because the project will become unmaintainable if build-specific knowledge leaks into gameplay modules.

### Phase 6: smoke test `initialize()`

Goal: prove initialization behavior end to end in the actual webapp runtime.

Tasks:

- create `test/initialize.smoke.js`
- call `GWCAjs.initialize()` after the hook is available
- log build ID, resolved anchors, readiness, and errors
- verify both success and expected failure modes

Minimum assertions:

- wasm instance captured
- memory helper available
- build identified
- required anchors either resolved or reported missing explicitly
- repeated `initialize()` calls behave deterministically

### Phase 7: first feature modules

Goal: only after initialization is reliable, start building read APIs.

Suggested order:

1. context
2. player
3. map
4. party

Each module should depend on initialized resolver state rather than reaching directly into `GWHook` ad hoc.

## Immediate milestone

The first milestone is complete when:

- `Gw-Webapp/GWCAjs` exists
- `GWCAjs.initialize()` is implemented
- it runs in the webapp runtime
- it returns a structured status object
- it is backed by at least one Ghidra-verified root anchor path
- a smoke test proves the flow end to end

## Initial implementation order

1. Create `Gw-Webapp/GWCAjs`
2. Scaffold the public API and state model
3. Implement `initialize()` against the existing `GWHook`
4. Add a smoke test harness
5. Use Ghidra to confirm the first required anchor set
6. Lock the resolver format before adding more modules

## Working rules

- keep `gw-hook` generic
- keep build-specific offsets and anchor logic in one resolver area
- never trust native GWCA offsets without wasm verification
- prefer structured initialization reports over boolean success/failure
- do not expand gameplay modules until initialization is stable

## Current decision

We are starting with `GWCAjs.initialize()` as the first real implementation target.
