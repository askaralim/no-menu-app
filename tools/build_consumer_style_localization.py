#!/usr/bin/env python3
"""Build the consumer style-localization bundle from frozen V1.2 CSVs."""

from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "outputs" / "style-localization-v1-20261108"
KEYS_CSV = SOURCE_DIR / "style-key-bilingual-dictionary.csv"
RAW_CSV = SOURCE_DIR / "raw-style-english-mapping.csv"
SUMMARY_JSON = SOURCE_DIR / "summary.json"
OUTPUT_JSON = ROOT / "taplist-mobile" / "assets" / "data" / "style-localization-v1.2.json"

TIERS = {
    "localized_display",
    "style_key_safe_fallback",
    "hold_for_manual_review",
}


def rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as source:
        return list(csv.DictReader(source))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    summary = json.loads(SUMMARY_JSON.read_text(encoding="utf-8"))
    key_rows = rows(KEYS_CSV)
    raw_rows = rows(RAW_CSV)

    assert summary["artifact_status"] == "frozen_offline"
    assert len(key_rows) == 84
    assert len(raw_rows) == 1312
    assert len({row["style_key"] for row in key_rows}) == len(key_rows)
    assert len({row["raw_style"] for row in raw_rows}) == len(raw_rows)
    assert {row["consumer_delivery_tier"] for row in raw_rows} <= TIERS

    style_keys = {
        row["style_key"]: {
            "zh": row["zh_standard_name"],
            "en": row["en_standard_name"],
            "granularity": row["reason_granularity"],
            "fallback_approved": row["fallback_approved"] == "true",
        }
        for row in key_rows
    }
    raw_styles = {}
    for row in raw_rows:
        tier = row["consumer_delivery_tier"]
        style_key = row["current_style_key"]
        if tier == "style_key_safe_fallback":
            assert style_key in style_keys
            assert style_keys[style_key]["fallback_approved"]
        raw_styles[row["raw_style"]] = {
            "display_en": row["display_en"],
            "style_key": style_key,
            "consumer_delivery_tier": tier,
        }

    payload = {
        "version": "style-localization-v1.2",
        "artifact_status": summary["artifact_status"],
        "sources": {
            "style_keys_sha256": sha256(KEYS_CSV),
            "raw_styles_sha256": sha256(RAW_CSV),
            "e1_bundle_sha256": summary["inputs"]["e1_bundle_sha256"],
        },
        "counts": {"style_keys": len(style_keys), "raw_styles": len(raw_styles)},
        "style_keys": style_keys,
        "raw_styles": raw_styles,
    }
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {OUTPUT_JSON.relative_to(ROOT)} ({OUTPUT_JSON.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
