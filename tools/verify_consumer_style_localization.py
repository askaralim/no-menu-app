#!/usr/bin/env python3
"""Verify the generated consumer bundle without changing frozen artifacts."""

from __future__ import annotations

import csv
import hashlib
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "outputs" / "style-localization-v1-20261108"
BUNDLE_PATH = ROOT / "taplist-mobile" / "assets" / "data" / "style-localization-v1.2.json"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def csv_rows(name: str) -> list[dict[str, str]]:
    with (SOURCE_DIR / name).open(encoding="utf-8-sig", newline="") as source:
        return list(csv.DictReader(source))


def main() -> None:
    bundle = json.loads(BUNDLE_PATH.read_text(encoding="utf-8"))
    key_rows = csv_rows("style-key-bilingual-dictionary.csv")
    raw_rows = csv_rows("raw-style-english-mapping.csv")

    assert bundle["artifact_status"] == "frozen_offline"
    assert bundle["counts"] == {"style_keys": 84, "raw_styles": 1312}
    assert len(bundle["style_keys"]) == 84
    assert len(bundle["raw_styles"]) == 1312
    assert bundle["sources"]["style_keys_sha256"] == sha256(SOURCE_DIR / "style-key-bilingual-dictionary.csv")
    assert bundle["sources"]["raw_styles_sha256"] == sha256(SOURCE_DIR / "raw-style-english-mapping.csv")

    expected_tiers = Counter(row["consumer_delivery_tier"] for row in raw_rows)
    actual_tiers = Counter(row["consumer_delivery_tier"] for row in bundle["raw_styles"].values())
    assert actual_tiers == expected_tiers

    for row in raw_rows:
        entry = bundle["raw_styles"][row["raw_style"]]
        assert entry == {
            "display_en": row["display_en"],
            "style_key": row["current_style_key"],
            "consumer_delivery_tier": row["consumer_delivery_tier"],
        }
        if entry["consumer_delivery_tier"] == "style_key_safe_fallback":
            key = bundle["style_keys"][entry["style_key"]]
            assert key["fallback_approved"] is True

    expected = {
        "Unfiltered IPA": "Unfiltered IPA",
        "柏林酸小麦": "Berliner Weisse",
        "酸浑浊IPA": "Sour Hazy IPA",
        "酸混浊IPA": "Sour Hazy IPA",
        "IPA - Triple New England / Hazy": "Triple Hazy IPA",
        "西海岸皮尔森": "West Coast Pilsner",
        "新西兰皮尔森": "New Zealand Pilsner",
        "红色艾尔": "Red Ale",
        "玉米拉格": "Corn Lager",
    }
    for raw_style, display_en in expected.items():
        entry = bundle["raw_styles"][raw_style]
        assert entry["consumer_delivery_tier"] == "localized_display"
        assert entry["display_en"] == display_en

    assert [row["style_key"] for row in key_rows] == list(bundle["style_keys"])
    print(f"verified 84 keys, 1312 raw styles, tiers={dict(actual_tiers)}")


if __name__ == "__main__":
    main()
