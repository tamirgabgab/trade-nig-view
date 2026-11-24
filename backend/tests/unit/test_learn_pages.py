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
    "atr",
    "bollinger-bands",
    "dema",
    "ema",
    "envelope",
    "hma",
    "kama",
    "lsma",
    "ma-cross",
    "ma-ribbon",
    "macd",
    "mcginley",
    "moving-average",
    "obv",
    "rsi",
    "sma",
    "smma",
    "stochastic",
    "swma",
    "t3",
    "tema",
    "volume-sma",
    "vwap",
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
#: The fields each lab kind cannot do without (LabBlock.tsx shows an error line without them).
LAB_REQUIRED: dict[str, set[str]] = {
    "param": {"indicator", "vary"},
    "event": {"indicator", "output", "op", "value"},
    "combo": {"rules"},
    "replay": {"symbol", "date"},
    "filter": {"indicator"},
}
RULE_REQUIRED = {"label", "left", "op", "right"}
OPS = {"lt", "gt", "crosses_above", "crosses_below"}
_LAB_BLOCK = re.compile(r"^```lab[ \t]*\n(.*?)^```[ \t]*$", re.MULTILINE | re.DOTALL)

ALL_PAGES = sorted(p.stem for p in LEARN_DIR.glob("*.md") if p.stem != "README")

#: `[text](learn:slug#heading)` and `[term](glossary:term)` (frontend/src/components/learnLinks.ts).
_LINK = re.compile(r"\]\((learn|glossary):([^)\s]*)\)")
_MD_LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")


def anchor_of(heading: str) -> str:
    """A heading's anchor, as the frontend makes it: its plain text (links keep their text, the
    marks * ` $ go) in lower case, every run of other characters as '-'."""
    text = re.sub(r"[*`$]", "", _MD_LINK.sub(r"\1", heading)).strip().lower()
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def heading_anchors(markdown: str, levels: tuple[str, ...] = ("## ", "### ")) -> set[str]:
    return {
        anchor_of(line.split(" ", 1)[1])
        for line in markdown.splitlines()
        if line.startswith(levels)
    }


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


def test_anchor_rule() -> None:
    assert anchor_of("Why it works") == "why-it-works"
    assert anchor_of("`%b` and [bandwidth](learn:x)") == "b-and-bandwidth"
    assert heading_anchors("# T\n## A b\n### C\n#### D") == {"a-b", "c"}


@pytest.mark.parametrize("slug", ALL_PAGES)
def test_learn_links_resolve(slug: str) -> None:
    """Every learn: link names a page (and a heading of it), every glossary: link an entry."""
    markdown = (LEARN_DIR / f"{slug}.md").read_text(encoding="utf-8")
    for scheme, target in _LINK.findall(markdown):
        if scheme == "learn":
            page, _, anchor = target.partition("#")
            assert page in ALL_PAGES, f"{slug}.md: no page {page!r}"
            if anchor:
                text = (LEARN_DIR / f"{page}.md").read_text(encoding="utf-8")
                assert anchor in heading_anchors(text), f"{slug}.md: no heading #{anchor} in {page}"
        else:
            glossary = LEARN_DIR / "glossary.md"
            assert glossary.is_file(), f"{slug}.md links glossary:{target} but there is no glossary"
            terms = heading_anchors(glossary.read_text(encoding="utf-8"), ("### ",))
            assert target in terms, f"{slug}.md: glossary has no ### entry {target!r}"


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
        fields = cast("dict[str, Any]", block)
        kind = fields.get("kind")
        assert kind in LAB_REQUIRED, f"{where}: kind {kind!r} not in {sorted(LAB_REQUIRED)}"
        assert LAB_REQUIRED[kind] <= fields.keys(), f"{where}: needs {sorted(LAB_REQUIRED[kind])}"
        rules = cast("list[dict[str, Any]]", fields.get("rules", []))
        for rule in [fields] if kind == "event" else rules:
            assert rule.get("op") in OPS, f"{where}: op {rule.get('op')!r} not in {sorted(OPS)}"
        for j, rule in enumerate(rules):
            assert rule.keys() >= RULE_REQUIRED, f"{where} rule {j}: needs {sorted(RULE_REQUIRED)}"
        if kind == "combo":
            assert len(rules) > 0, f"{where}: no rules"
        if kind == "filter" and "output" in fields:
            outputs = [o.name for o in CATALOG[fields["indicator"]].outputs]
            assert fields["output"] in outputs, f"{where}: output not in {outputs}"
        unknown = sorted(set(indicator_ids(block)) - CATALOG.keys())
        assert not unknown, f"{where}: unknown indicator(s) {unknown}"
