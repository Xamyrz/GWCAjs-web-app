# GWCAjs

`GWCAjs` mirrors the upstream `GWCA` project structure, but targets the browser/wasm runtime used by `Gw-Webapp`.

## Project documents

- `HANDOVER.md`: validated current-build findings and operational context
- `COMPLETION_PLAN.md`: end-to-end implementation and testing plan
- `PROGRESS.md`: live completion checklist
- `Ghidra-Notes.md`: chronological reverse-engineering evidence
- `SymbolMapping/README.md`: repeatable old-to-current JSPI symbol mapping and
  Ghidra merge workflow
- `Tools/README.md`: step-by-step procedure for mapping a newly released build

## Layout

- `Source/` mirrors `gwca/Source`
- `Include/GWCA/` mirrors `gwca/Include/GWCA`

The purpose of this layout is ownership and migration discipline:

- keep file names familiar when comparing against native GWCA
- give each future JS module a stable home
- make Ghidra verification notes easier to map back to GWCA concepts

## Current status

The shared Context root, `PlayerMgr`, and `MapMgr` are implemented and live
validated for game build `38615`. Most other managers and many of their
supporting context/entity readers remain placeholders.

The next implementation work is:

1. finish shared memory, string, allocation, context, callback, and build
   registries
2. implement a read-only `GuildMgr`
3. continue through the manager order in `COMPLETION_PLAN.md`
4. add deterministic and manual end-to-end coverage for each manager

## Runtime entry points

- `/GWCAjs/bootstrap.js` installs `window.GWCAjs`
- `/GWCAjs/probe.html` runs the current initialization smoke test
- `http://127.0.0.1:8000/` is the required local runtime
