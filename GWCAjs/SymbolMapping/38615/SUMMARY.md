# JSPI Symbol Mapping Summary

Generated: 2026-06-07T00:35:03.340Z

## Inputs

- Old: `/home/xamyr/Projects/gw-webapp-gwca/extracted/older version/Gw.jspi.wasm`
- Current: `/home/xamyr/Projects/gw-webapp-gwca/extracted/38615/Gw.jspi.wasm`
- Old SHA-256: `71e284ed7e572c0d0d5630b07e323cef8f2af31aa14bb544a503e043b983a3f9`
- Current SHA-256: `e48878d188ef86e7390d49b577125e4446952f0549c17fef48b94807ea522e1a`

## Coverage

- Old functions/imports: 17739
- Automatically accepted mappings: 17302
- Useful function names written: 17302
- Review or unmapped entries: 437

### Confidence

- exact: 8637
- high: 8665
- review: 433
- unmapped: 4

### Methods

- unique-call: 3809
- equal-anchor-gap: 2903
- stable-anchor-delta: 2701
- unique-shape: 2505
- same-index-strict: 2194
- unique-relaxed: 1862
- unique-strict: 1048
- ordered-review-candidate: 433
- same-import: 213
- mutual-opcode-similarity: 67
- unmapped: 4

## Outputs

- `function-map.json`: complete machine-readable evidence ledger
- `function-map.csv`: review-friendly mapping table
- `Gw.jspi.named.wasm`: current JSPI binary with accepted names

The named binary is an analysis artifact. It must not replace the live game
binary. It was imported as `/38615-symbol-map/Gw.jspi.named.wasm`.

Ghidra application completed on 2026-06-07:

- 17,044 default-named functions renamed from accepted mappings
- 42 accepted functions already named
- 3 existing non-default current-build names preserved
- 3 missing WASM global names applied
- 433 ambiguous candidates annotated for review without renaming
- 4 old functions retained as no-current-candidate records
