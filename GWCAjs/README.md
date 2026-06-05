# GWCAjs

`GWCAjs` mirrors the upstream `GWCA` project structure, but targets the browser/wasm runtime used by `Gw-Webapp`.

## Layout

- `Source/` mirrors `vendor/gwca/Source`
- `Include/GWCA/` mirrors `vendor/gwca/Include/GWCA`

The purpose of this layout is ownership and migration discipline:

- keep file names familiar when comparing against native GWCA
- give each future JS module a stable home
- make Ghidra verification notes easier to map back to GWCA concepts

## Current status

All mirrored files now exist as JS-side placeholders.

Implementation starts with:

1. `Source/GWCA.js`
2. `Source/MemoryMgr.js`
3. `Source/Scanner.js`
4. `Source/UIMgr.js`
5. `Source/MapMgr.js`
6. `Source/PlayerMgr.js`

The first functional milestone is `GWCAjs.initialize()`.

## Runtime entry points

- `/GWCAjs/bootstrap.js` installs `window.GWCAjs`
- `/GWCAjs/probe.html` runs the current initialization smoke test
