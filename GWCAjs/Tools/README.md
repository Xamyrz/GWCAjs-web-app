# JSPI Version Mapping Guide

Use this guide when a new Guild Wars web build changes `Gw.jspi.wasm` and
the previous function names need to be carried forward into Ghidra.

The workflow is:

1. preserve the previous named analysis WASM
2. extract and dump the new WASM
3. generate an evidence-gated old-to-new mapping
4. import the stripped and named new binaries into Ghidra
5. apply accepted names without overwriting manual work
6. annotate ambiguous matches for review
7. validate, save, and record the new baseline

## Important Rules

- The old input must be the previous `Gw.jspi.named.wasm`, not the stripped
  game binary. The named artifact carries the symbol chain forward.
- Never replace the live webapp WASM with `Gw.jspi.named.wasm`.
- Never auto-rename review candidates.
- Never assume one universal function-index delta.
- Never apply names if the dry run reports missing functions or unexpected
  source-default names.
- Do not use Ghidra MCP `merge_program_documentation` on these full WASM
  programs. Its all-code-unit scan can block Ghidra's UI for over 30 minutes.
- Always pass explicit build paths for a new build. Tool defaults currently
  point at build `38615`.

## Requirements

The following must be available:

```bash
node --version
wasm-objdump --version
wasm-validate --version
jq --version
```

Ghidra must be running with Ghidra MCP enabled. The tools normally discover
the active Unix socket automatically. Use `--socket PATH` when multiple
Ghidra instances are open.

The local Python server remains running on port `8000` throughout GWCAjs
work:

```bash
curl -I http://127.0.0.1:8000/
python serve_local_webapp.py --host 0.0.0.0 --port 8000
```

The symbol mapper itself is offline and does not require the browser client,
but the server is needed for the end-to-end validation that follows.

## Build Variables

The examples below use build `38615` as the previous baseline and `NEW_BUILD`
as the replacement. Substitute the real new build number from
`version.json`.

```bash
PREVIOUS_BUILD=38615
NEW_BUILD=NEW_BUILD
PREVIOUS_NAMED="GWCAjs/SymbolMapping/${PREVIOUS_BUILD}/Gw.jspi.named.wasm"
NEW_WASM="extracted/${NEW_BUILD}/Gw.jspi.wasm"
OUTPUT="GWCAjs/SymbolMapping/${NEW_BUILD}"
```

Check the extracted build metadata:

```bash
jq . "extracted/${NEW_BUILD}/version.json"
```

## 1. Preserve The Previous Baseline

Confirm the previous named artifact exists and is valid:

```bash
test -f "${PREVIOUS_NAMED}"
wasm-validate "${PREVIOUS_NAMED}"
sha256sum "${PREVIOUS_NAMED}"
```

`Gw.jspi.named.wasm` is ignored by Git because it is large. Keep it in the
workspace and in the same external/archive location used for extracted game
builds. Losing it breaks the automatic symbol chain unless an older named
build is available to rebuild it.

Do not use `extracted/${PREVIOUS_BUILD}/Gw.jspi.wasm` as the old named input.
That file is normally stripped.

Only accepted names enter the next named baseline. Ambiguous and unmapped
names remain in `function-map.json`, `function-map.csv`, and Ghidra review
comments until independent evidence promotes them. Preserve every build's
ledger so unresolved history is not lost.

If the immediately previous named artifact is missing, use the nearest older
named artifact and expect more review work. Rebuild intermediate mappings in
order when their stripped binaries and ledgers are available.

## 2. Extract The New Build

Store each build in its own immutable directory:

```text
extracted/<build>/
  Gw.js
  Gw.jspi.js
  Gw.jspi.wasm
  Gw.wasm
  version.json
```

At minimum, mapping requires:

```text
extracted/<build>/Gw.jspi.wasm
extracted/<build>/version.json
```

Confirm the new binary is valid before doing any reverse engineering:

```bash
wasm-validate "${NEW_WASM}"
sha256sum "${NEW_WASM}"
```

Never overwrite the previous build directory.

## 3. Generate Objdump Inputs

Create separate analysis dumps for the previous named baseline and the new
stripped binary:

```bash
mkdir -p "${OUTPUT}/baseline-analysis"
mkdir -p "extracted/${NEW_BUILD}/analysis"

wasm-objdump -x "${PREVIOUS_NAMED}" \
  > "${OUTPUT}/baseline-analysis/Gw.jspi.details.txt"
wasm-objdump -d "${PREVIOUS_NAMED}" \
  > "${OUTPUT}/baseline-analysis/Gw.jspi.disassembly.txt"

wasm-objdump -x "${NEW_WASM}" \
  > "extracted/${NEW_BUILD}/analysis/Gw.jspi.details.txt"
wasm-objdump -d "${NEW_WASM}" \
  > "extracted/${NEW_BUILD}/analysis/Gw.jspi.disassembly.txt"
```

The disassembly files can be hundreds of megabytes. Both analysis locations
are ignored by Git.

## 4. Generate The Mapping

Run the mapper with every path explicit:

```bash
node GWCAjs/Tools/map-jspi-symbols.mjs \
  --oldWasm "${PREVIOUS_NAMED}" \
  --oldDetails "${OUTPUT}/baseline-analysis/Gw.jspi.details.txt" \
  --oldDisassembly "${OUTPUT}/baseline-analysis/Gw.jspi.disassembly.txt" \
  --currentWasm "${NEW_WASM}" \
  --currentDetails "extracted/${NEW_BUILD}/analysis/Gw.jspi.details.txt" \
  --currentDisassembly "extracted/${NEW_BUILD}/analysis/Gw.jspi.disassembly.txt" \
  --outputDirectory "${OUTPUT}"
```

This creates:

```text
GWCAjs/SymbolMapping/<build>/
  SUMMARY.md
  function-map.json
  function-map.csv
  Gw.jspi.named.wasm
```

Validate the generated analysis binary:

```bash
wasm-validate "${OUTPUT}/Gw.jspi.named.wasm"
cat "${OUTPUT}/SUMMARY.md"
```

Before continuing, confirm:

- accepted mappings have no duplicate target indexes
- review and unmapped counts are understood
- known GWCAjs functions still map to plausible current functions
- no matching threshold was loosened merely to improve coverage

Use `function-map.csv` for manual review and `function-map.json` for scripts.

## 5. Import The New Build Into Ghidra

Import and fully analyze the original stripped binary as the authoritative
program:

```text
/<NEW_BUILD>/Gw.jspi.wasm
```

Import and fully analyze the generated named binary separately:

```text
/<NEW_BUILD>-symbol-map/Gw.jspi.named.wasm
```

Never import the named artifact over the authoritative program.

Confirm both programs:

- use `Wasm:LE:32:default`
- have the expected function count
- are no longer analyzing
- show several known mapped functions in the named program

## 6. Dry-Run Accepted Names

Always run without `--apply` first:

```bash
node GWCAjs/Tools/apply-jspi-symbols-ghidra.mjs \
  --map "${OUTPUT}/function-map.json" \
  --source "/${NEW_BUILD}-symbol-map/Gw.jspi.named.wasm" \
  --target "/${NEW_BUILD}/Gw.jspi.wasm"
```

Expected safety properties:

```text
missingFunction: 0
sourceDefaultNamed: 0
```

`preservedExistingName` is allowed and means the tool protected an existing
non-default target name. Investigate a surprisingly large count before
applying.

The script only renames target functions that still have default names. It
does not change signatures, parameters, locals, comments, labels, or types.

## 7. Apply Accepted Names

Apply the exact dry-run set:

```bash
node GWCAjs/Tools/apply-jspi-symbols-ghidra.mjs \
  --apply \
  --map "${OUTPUT}/function-map.json" \
  --source "/${NEW_BUILD}-symbol-map/Gw.jspi.named.wasm" \
  --target "/${NEW_BUILD}/Gw.jspi.wasm"
```

Run the dry run again. Completion requires:

```text
planned: 0
missingFunction: 0
sourceDefaultNamed: 0
```

The operation is resumable. If it is interrupted, rerun the same `--apply`
command; already-correct functions are skipped.

## 8. Annotate Review Candidates

Audit first:

```bash
node GWCAjs/Tools/annotate-jspi-review-candidates.mjs \
  --map "${OUTPUT}/function-map.json" \
  --target "/${NEW_BUILD}/Gw.jspi.wasm"
```

The tool preserves any existing plate comment. Apply only after reviewing
the counts:

```bash
node GWCAjs/Tools/annotate-jspi-review-candidates.mjs \
  --apply \
  --map "${OUTPUT}/function-map.json" \
  --target "/${NEW_BUILD}/Gw.jspi.wasm"
```

Run it once more without `--apply`. Completion requires:

```text
planned: 0
```

These comments record the old name, old/current function indexes, and match
evidence. They deliberately do not rename ambiguous functions.

## 9. Apply WASM Global Names

Compare named and authoritative programs. Ghidra may leave the first three
globals as:

```text
global_0
global_1
global_2
```

Rename them to the names carried by the WASM name section:

```text
global:00000000 -> __stack_pointer
global:00000010 -> __stack_end
global:00000020 -> __stack_base
```

Ghidra MCP's project naming policy may reject these standard Emscripten
names. Use the per-call `strict_mode: off` override only for these exact
loader-defined names.

Data-segment names such as `.rodata`, `.data`, `em_asm`, and `em_js` remain
in the generated WASM name section, but the current Ghidra WASM loader does
not materialize them as separate memory blocks or symbols.

## 10. Preserve Manual Ghidra Work

The generated WASM carries function, global, module, and data-segment names.
It does not carry metadata stored only in the previous Ghidra database:

- manual comments
- bookmarks
- extra labels
- manually renamed locals
- custom data types and structures

Transfer those only through accepted old/current function mappings.
Analyzer-generated Address Table bookmarks must not be copied because
linear-memory addresses can move between builds.

Do not use the generic whole-program documentation merge. Prefer targeted
function-level transfer after verifying the mapped pair.

## 11. Save And Validate

Save the authoritative program:

```text
/<NEW_BUILD>/Gw.jspi.wasm
```

Then verify:

- Ghidra reports analysis complete and idle
- accepted-name dry run reports `planned: 0`
- review-annotation dry run reports `planned: 0`
- known GWCAjs calls resolve to expected names and addresses
- existing manual target names and comments remain intact
- the new named artifact passes `wasm-validate`

Run the browser/client manual checks through port `8000` for the functions
used by GWCAjs. Static similarity is not a substitute for end-to-end
validation.

## 12. Promote The New Baseline

The completed output becomes the old named input for the next update:

```text
GWCAjs/SymbolMapping/<NEW_BUILD>/Gw.jspi.named.wasm
```

Update:

- `GWCAjs/SymbolMapping/<NEW_BUILD>/SUMMARY.md`
- `GWCAjs/Ghidra-Notes.md`
- `GWCAjs/HANDOVER.md`
- `GWCAjs/PROGRESS.md`

Record:

- previous and new build numbers
- SHA-256 hashes
- accepted, review, and unmapped counts
- preserved current-build names
- known-function validation results
- manual end-to-end results
- any functions believed removed or ABI-reworked

## Recovery

### Function Tree Stuck On `In progress`

This can happen after an expensive Ghidra task blocks Swing.

1. Confirm auto-analysis reports `analyzing: false`.
2. Save all affected programs.
3. Close the old and current programs.
4. Reopen them with auto-analysis disabled.

Do not reanalyze unless the program itself is incomplete.

### Tool Cannot Find Ghidra

List the active socket:

```bash
find "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/ghidra-mcp" \
  -name 'ghidra-*.sock' -print
```

Pass it explicitly:

```bash
node GWCAjs/Tools/apply-jspi-symbols-ghidra.mjs \
  --socket /run/user/<uid>/ghidra-mcp/ghidra-<pid>.sock \
  --map "${OUTPUT}/function-map.json" \
  --source "/${NEW_BUILD}-symbol-map/Gw.jspi.named.wasm" \
  --target "/${NEW_BUILD}/Gw.jspi.wasm"
```

### Unexpected Mapping Counts

Stop before applying when:

- `missingFunction` is nonzero
- `sourceDefaultNamed` is nonzero
- accepted targets are duplicated
- many known functions become review-only or unmapped
- the new function count changes dramatically without a corresponding game
  update explanation

Inspect `function-map.csv`, compare disassembly, and verify representative
functions in Ghidra before changing mapper thresholds.

## Per-Build Checklist

- [ ] New build extracted into its own directory.
- [ ] `version.json` build number recorded.
- [ ] Previous `Gw.jspi.named.wasm` preserved and validated.
- [ ] Previous named and new stripped objdump files generated.
- [ ] Mapping generated with explicit paths.
- [ ] New named WASM passes `wasm-validate`.
- [ ] Mapping counts and known functions reviewed.
- [ ] Stripped and named programs imported separately into Ghidra.
- [ ] Accepted-name dry run passes safety checks.
- [ ] Accepted names applied.
- [ ] Accepted-name rerun reports `planned: 0`.
- [ ] Review candidates annotated without renaming.
- [ ] Review rerun reports `planned: 0`.
- [ ] Standard WASM global names applied.
- [ ] Manual Ghidra-only metadata reviewed.
- [ ] Authoritative Ghidra program saved.
- [ ] Browser end-to-end checks pass on port `8000`.
- [ ] Summary, notes, handover, and progress files updated.
- [ ] New named WASM archived as the next baseline.
