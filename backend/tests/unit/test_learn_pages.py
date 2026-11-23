"""Learn page lint: v2 pages have the standard sections in order, and every ```lab block on any
page is valid JSON that names only registered indicators."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, cast

import pytest

from app.config import REPO_ROOT
from app.indicators.catalog import CATALOG

LEARN_DIR: Path = REPO_ROOT / "docs" / "indicators"  # Settings.learn_dir's default

#: Pages rewritten to the v2 structure (add a slug here once its page follows ``V2_SECTIONS``).
V2_PAGES: set[str] = {
    "alma",
    "dema",
    "ema",
    "envelope",
    "hma",
    "kama",
    "lsma",
    "ma-cross",
    "ma-ribbon",
    "mcginley",
    "moving-average",
    "sma",
    "smma",
    "swma",
    "t3",
    "tema",
    "vwma",
    "wma",
    "zlema",
}

V2_SECTIONS = (
    "What it measures",
    "Formula",
    "Defaults",
    "Warm-up",
    "How to read it",
    "Why it works",
    "Combine with",
    "Differences vs TradingView",
    "Pitfalls",
    "Exercise",
)
LAB_KINDS = {"param", "event", "combo", "replay"}
_LAB_BLOCK = re.compile(r"^```lab[ \t]*\n(.*?)^```[ \t]*$", re.MULTILINE | re.DOTALL)

ALL_PAGES = sorted(p.stem for p in LEARN_DIR.glob("*.md") if p.stem != "README")


def missing_sections(markdown: str) -> list[str]:
    """``V2_SECTIONS`` that are absent or out of order among the page's ``## `` headings (other
    headings may sit in between)."""
    headings = [line[3:].strip() for line in markdown.splitlines() if line.startswith("## ")]
    missing: list[str] = []
    position = 0
    for section in V2_SECTIONS:
        try:
            position = headings.index(section, position) + 1
        except ValueError:
            missing.append(section)
    return missing


def indicator_ids(block: Any) -> list[str]:  # JSON: dict / list / scalar
    """Indicator ids a lab block names: every ``"indicator"`` value that is a string or an
    object with an ``"id"`` (an int is an index into the block's own list) and every id
    (string, or ``"id"`` of an object) in an ``"indicators"`` list."""
    found: list[str] = []
    if isinstance(block, dict):
        for key, value in cast("dict[str, Any]", block).items():
            if key == "indicator" and isinstance(value, str):
                found.append(value)
            # A combo rule's side: {"indicator": {"id": ..., "params": ...}, "output": ...}.
            if key == "indicator" and isinstance(value, dict):
                ref_id: Any = cast("dict[str, Any]", value).get("id")
                if isinstance(ref_id, str):
                    found.append(ref_id)
            if key == "indicators" and isinstance(value, list):
                for item in cast("list[Any]", value):
                    ref: Any = (
                        cast("dict[str, Any]", item).get("id") if isinstance(item, dict) else item
                    )
                    if isinstance(ref, str):
                        found.append(ref)
            found.extend(indicator_ids(value))
    elif isinstance(block, list):
        for item in cast("list[Any]", block):
            found.extend(indicator_ids(item))
    return found


def lab_blocks(markdown: str) -> list[str]:
    return _LAB_BLOCK.findall(markdown)


def test_section_checker() -> None:
    page = "\n".join(f"## {s}\ntext\n## Extra" for s in V2_SECTIONS)
    assert missing_sections(page) == []
    swapped = page.replace("## Formula", "## TMP").replace("## Defaults", "## Formula")
    assert missing_sections(swapped.replace("## TMP", "## Defaults")) == ["Defaults"]
    assert missing_sections("## What it measures\n### Formula") == list(V2_SECTIONS[1:])


def test_lab_block_helpers() -> None:
    page = '```lab\n{"kind": "param", "indicator": "rsi"}\n```\n```python\nx\n```\n'
    assert lab_blocks(page) == ['{"kind": "param", "indicator": "rsi"}\n']
    block = {"kind": "combo", "indicators": [{"id": "ema"}, "sma"], "c": [{"indicator": 0}]}
    assert indicator_ids(block) == ["ema", "sma"]
    rule: dict[str, Any] = {
        "left": {"indicator": {"id": "rsi", "params": {}}, "output": "rsi"},
        "right": {"value": 30},
    }
    assert indicator_ids({"kind": "combo", "rules": [rule]}) == ["rsi"]


def test_v2_pages_are_known() -> None:
    assert set(V2_PAGES) <= set(ALL_PAGES)


@pytest.mark.parametrize("slug", sorted(V2_PAGES))
def test_v2_page_has_every_section_in_order(slug: str) -> None:
    markdown = (LEARN_DIR / f"{slug}.md").read_text(encoding="utf-8")
    assert missing_sections(markdown) == [], f"{slug}.md: missing or out of order"


@pytest.mark.parametrize("slug", ALL_PAGES)
def test_lab_blocks_are_valid(slug: str) -> None:
    markdown = (LEARN_DIR / f"{slug}.md").read_text(encoding="utf-8")
    for i, text in enumerate(lab_blocks(markdown)):
        where = f"{slug}.md lab block {i}"
        try:
            block: Any = json.loads(text)
        except json.JSONDecodeError as exc:
            pytest.fail(f"{where}: invalid JSON ({exc})")
        assert isinstance(block, dict), f"{where}: not a JSON object"
        kind = cast("dict[str, Any]", block).get("kind")
        assert kind in LAB_KINDS, f"{where}: kind {kind!r} not in {sorted(LAB_KINDS)}"
        unknown = sorted(set(indicator_ids(block)) - CATALOG.keys())
        assert not unknown, f"{where}: unknown indicator(s) {unknown}"
