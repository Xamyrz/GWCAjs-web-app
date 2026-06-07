# JSPI Symbol Mapping

This directory contains the repeatable old-to-current JSPI symbol mapping
workflow.

Current mapping: [`38615/SUMMARY.md`](38615/SUMMARY.md)

For the complete new-build procedure, use
[`../Tools/README.md`](../Tools/README.md).

## Generate Inputs

The mapper consumes `wasm-objdump` details and disassembly for both JSPI
binaries:

```bash
mkdir -p extracted/38615/analysis "extracted/older version/analysis"

wasm-objdump -x "extracted/older version/Gw.jspi.wasm" \
  > "extracted/older version/analysis/Gw.jspi.details.txt"
wasm-objdump -d "extracted/older version/Gw.jspi.wasm" \
  > "extracted/older version/analysis/Gw.jspi.disassembly.txt"

wasm-objdump -x extracted/38615/Gw.jspi.wasm \
  > extracted/38615/analysis/Gw.jspi.details.txt
wasm-objdump -d extracted/38615/Gw.jspi.wasm \
  > extracted/38615/analysis/Gw.jspi.disassembly.txt
```

Run:

```bash
node GWCAjs/Tools/map-jspi-symbols.mjs
```

Generated large artifacts are ignored by Git:

- `function-map.json`
- `function-map.csv`
- `Gw.jspi.named.wasm`

The summary is tracked. Regenerate the detailed files whenever the mapper or
input binary changes.

## Matching Evidence

The mapper applies one-to-one matches in confidence order:

1. identical imports
2. same-index strict instruction bodies
3. unique strict bodies
4. unique bodies after direct-call target normalization
5. unique bodies after large-address normalization
6. unique normalized instruction shapes
7. equal-size intervals between trusted anchors
8. stable function-order deltas between trusted anchors
9. mutual-best opcode/shingle similarity

Matches from these classes are written to the synthesized name section.
Remaining functions receive one-to-one review candidates where possible, but
those names are not written automatically.

The old JSPI name section contains:

- module name
- function names
- WASM global names
- data-segment names

It does not contain local-variable or label-name subsections. The mapper
remaps accepted function indexes and copies the compatible module/global/data
name subsections.

This does not include comments, bookmarks, labels, or renamed symbols that
exist only in the old Ghidra project database. Migrate those in a separate
metadata pass after the accepted function map has been merged.

## Apply In Ghidra

`Gw.jspi.named.wasm` is an analysis artifact. Never replace the live game
binary with it.

1. Validate it:

   ```bash
   wasm-validate GWCAjs/SymbolMapping/38615/Gw.jspi.named.wasm
   ```

2. Import it into a separate Ghidra folder, for example:

   ```text
   /38615-symbol-map/Gw.jspi.named.wasm
   ```

3. Let Ghidra auto-analysis finish.
4. Confirm the function count and several known mappings.
5. Dry-run the accepted function-name transfer:

   ```bash
   node GWCAjs/Tools/apply-jspi-symbols-ghidra.mjs
   ```

6. Apply it:

   ```bash
   node GWCAjs/Tools/apply-jspi-symbols-ghidra.mjs --apply
   ```

7. Annotate ambiguous candidates without renaming them:

   ```bash
   node GWCAjs/Tools/annotate-jspi-review-candidates.mjs --apply
   ```

8. Name `global:0`, `global:10`, and `global:20` from the imported analysis
   program if the current loader left them as `global_0` through `global_2`.
9. Save `/38615/Gw.jspi.wasm`.
10. Transfer old Ghidra-only annotations through the accepted function map.

The scripts auto-discover the active local Ghidra MCP Unix socket. Pass
`--socket PATH` only when more than one local Ghidra instance is active.

Do not use `merge_program_documentation` for these full WASM programs. Its
all-code-unit scan monopolizes Ghidra's Swing thread long enough for Function
tree loads to time out. If the Function tree remains on `In progress`, save,
close, and reopen the affected programs without re-running analysis.

## Rules

- Never auto-apply review candidates.
- Never infer a universal function-index delta.
- Preserve manually verified current-build names and comments.
- Treat four old functions with no current same-signature candidate as
  removed or ABI-reworked until proven otherwise.
- Re-run known-function checks after changing matching thresholds.
