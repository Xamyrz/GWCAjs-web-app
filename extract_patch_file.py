#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
MIRROR_ROOT = ROOT / "local-mirror" / "patching.1.arenanetworks.com"
MANIFEST_PATH = MIRROR_ROOT / "manifest.json"


def load_manifest() -> dict:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def find_file_entry(manifest: dict, target_path: str) -> dict:
    for entry in manifest.get("files", []):
        entry_path = entry.get("path") or entry.get("name")
        if entry_path == target_path:
            return entry
    raise SystemExit(f"File not found in manifest: {target_path}")


def read_chunk_bytes(chunk_hash: str, compression_mode: str) -> bytes:
    chunk_path = MIRROR_ROOT / f"{chunk_hash}.bin"
    if not chunk_path.exists():
        raise SystemExit(f"Missing mirrored chunk: {chunk_path}")
    raw = chunk_path.read_bytes()
    if compression_mode == "gzip":
        return gzip.decompress(raw)
    return raw


def extract_file(target_path: str, output_path: Path) -> None:
    manifest = load_manifest()
    entry = find_file_entry(manifest, target_path)
    compression_mode = manifest.get("compressionMode", "none")
    chunk_size = int(manifest["chunkSize"])

    assembled = bytearray()
    for chunk_hash in entry["chunkHashes"]:
        assembled.extend(read_chunk_bytes(chunk_hash, compression_mode))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(bytes(assembled[: int(entry["size"])]))
    print(f"Wrote {target_path} to {output_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Reconstruct a patch file from mirrored chunk data.")
    parser.add_argument("path", help="Manifest file path to extract, e.g. Gw.wasm")
    parser.add_argument(
        "--output",
        type=Path,
        help="Output path. Defaults to ./extracted/<basename>",
    )
    args = parser.parse_args()

    output_path = args.output or (ROOT / "extracted" / Path(args.path).name)
    extract_file(args.path, output_path)


if __name__ == "__main__":
    main()
