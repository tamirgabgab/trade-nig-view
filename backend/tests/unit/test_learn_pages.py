"""Learn page lint: v2 pages have the standard sections in order, and every ```lab block on any
page is valid JSON that names only registered indicators."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, cast

import pytest

from app.api.learn import CONCEPT_PAGES
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
    "historical-volatility",
    "hma",
    "kama",
    "lsma",
    "ma-cross",
    "ma-ribbon",
    "macd",
    "market-regime",
    "mcginley",
    "moving-average",
    "obv",
    "pivots",
    "previous-hlc",
    "rsi",
    "sma",
    "smma",
    "stochastic",
    "swma",
    "t3",
    "tema",
    "value-at-risk",
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
#: The planner's concept pages (Phase H, ADR 0025) and the sections each one has, in this order.
PLANNER_PAGES: set[str] = {
    "xirr",
    "mortgage-tracks",
    "rent-or-buy",
    "same-money",
    "overlapping-windows",
    "simulated-worlds",
    "risk-metrics",
    "what-the-answer-depends-on",
    # Phase J (ADR 0030).
    "withdrawals",
    "cost-basis",
    "sustainable-withdrawals",
}
PLANNER_SECTIONS = (
    "What it answers",
    "Formula",
    "Worked example",
    "How to read it",
    "Where it comes from",
    "Limits",
)
#: Sections whose formulas reuse the symbols the Formula section's tables already gave.
REUSES_SYMBOLS = {"Worked example", "Where it comes from"}
SYMBOL_TABLE = "| Symbol | Meaning | Units / typical range |"
_MATH = re.compile(r"\$\$.*?\$\$|\$[^$\n]+\$", re.DOTALL)
#: The fields each lab kind cannot do without (LabBlock.tsx shows an error line without them).
LAB_REQUIRED: dict[str, set[str]] = {
    "param": {"indicator", "vary"},
    "event": {"indicator", "output", "op", "value"},
    "combo": {"rules"},
    "replay": {"symbol", "date"},
    "filter": {"indicator"},
    "forecast": set(),
    "volatility": set(),
    "risk": set(),
    "regime": set(),
}
MAX_AGO = 500  # app.analysis.conditions.Operand.ago's bound
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


def headings(markdown: str, levels: tuple[str, ...] = ("## ", "### ")) -> list[str]:
    """The text of the page's headings at ``levels``, outside fenced code blocks."""
    found: list[str] = []
    fenced = False
    for line in markdown.splitlines():
        if line.startswith("```"):
            fenced = not fenced
        elif not fenced and line.startswith(levels):
            found.append(line.split(" ", 1)[1])
    return found


def heading_anchors(markdown: str, levels: tuple[str, ...] = ("## ", "### ")) -> set[str]:
    """Anchors of the headings a link can target: those without math (KaTeX renders math into
    text the anchor rule does not see, so such a heading has no stable anchor)."""
    return {anchor_of(h) for h in headings(markdown, levels) if "$" not in h}


def missing_sections(markdown: str, sections: tuple[str, ...] = V2_SECTIONS) -> list[str]:
    """``sections`` that are absent or out of order among the page's ``## `` headings (other
    headings may sit in between)."""
    headings = [line[3:].strip() for line in markdown.splitlines() if line.startswith("## ")]
    missing: list[str] = []
    position = 0
    for section in sections:
        try:
            position = headings.index(section, position) + 1
        except ValueError:
            missing.append(section)
    return missing


def formulas_without_symbols(markdown: str) -> list[str]:
    """The first line of every display formula (a ``$$`` block) that no symbol table follows
    before the next heading. Formulas in ``REUSES_SYMBOLS`` sections are not counted."""
    found: list[str] = []
    waiting: list[str] = []
    section, inside, first = "", False, ""
    for line in [*markdown.splitlines(), "## end"]:
        text = line.strip()
        if text == "$$":
            if inside and section not in REUSES_SYMBOLS:
                waiting.append(first)
            inside, first = not inside, ""
        elif inside:
            first = first or text
        elif text.startswith(SYMBOL_TABLE):
            waiting.clear()
        elif line.startswith(("## ", "### ")):
            found.extend(waiting)
            waiting.clear()
            if line.startswith("## "):
                section = line[3:].strip()
    return found


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


def valid_side(side: Any) -> bool:
    """A rule side's ``ago``: an integer 0-500, and only on a series (not on a value)."""
    if not isinstance(side, dict) or "ago" not in side:
        return True
    fields = cast("dict[str, Any]", side)
    ago = fields["ago"]
    in_range = isinstance(ago, int) and not isinstance(ago, bool) and 0 <= ago <= MAX_AGO
    return in_range and "value" not in fields


def lab_blocks(markdown: str) -> list[str]:
    return _LAB_BLOCK.findall(markdown)


def test_section_checker() -> None:
    page = "\n".join(f"## {s}\ntext\n## Extra" for s in V2_SECTIONS)
    assert missing_sections(page) == []
    swapped = page.replace("## Formula", "## TMP").replace("## Defaults", "## Formula")
    assert missing_sections(swapped.replace("## TMP", "## Defaults")) == ["Defaults"]
    assert missing_sections("## What it measures\n### Formula") == list(V2_SECTIONS[1:])


def test_symbol_table_checker() -> None:
    table = f"{SYMBOL_TABLE}\n|---|---|---|\n| $x$ | a thing | ₪ |"
    page = f"## Formula\n$$\nx = 1\n$$\n{table}\n### More\n$$\ny = 2\n$$\ntext\n## Limits"
    assert formulas_without_symbols(page) == ["y = 2"]
    # Two formulas may share one table; a worked example reuses the symbols above it.
    shared = f"## Formula\n$$\nx\n$$\nand\n$$\ny\n$$\n{table}\n## Worked example\n$$\nz\n$$"
    assert formulas_without_symbols(shared) == []
    assert formulas_without_symbols("## How to read it\n$$\nq\n$$") == ["q"]


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
    assert heading_anchors("# T\n## A b\n### C\n#### D\n## The $k$\n```\n## not\n```") == {
        "a-b",
        "c",
    }


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
                assert anchor in heading_anchors(text), (
                    f"{slug}.md: no heading #{anchor} (without math) in {page}"
                )
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
        # The same checks as the frontend's LabBlock SHAPES (a failing block shows an error line).
        if kind not in {"filter"}:
            assert fields.get("interval", "1D") in {"1D", "1h"}, f"{where}: interval is 1D or 1h"
        steps: Any = fields.get("steps", [])
        assert isinstance(steps, list), f"{where}: steps is a list of strings"
        assert all(isinstance(s, str) for s in cast("list[Any]", steps)), f"{where}: steps"
        assert isinstance(fields.get("reveal", ""), str), f"{where}: reveal is a string"
        for rule in rules:
            for side in (rule.get("left"), rule.get("right")):
                assert valid_side(side), f"{where}: ago is 0-500 bars, and only on a series"
        if kind == "filter" and "output" in fields:
            outputs = [o.name for o in CATALOG[fields["indicator"]].outputs]
            assert fields["output"] in outputs, f"{where}: output not in {outputs}"
        unknown = sorted(set(indicator_ids(block)) - CATALOG.keys())
        assert not unknown, f"{where}: unknown indicator(s) {unknown}"


def test_planner_pages_are_registered() -> None:
    assert set(ALL_PAGES) >= PLANNER_PAGES
    assert CONCEPT_PAGES.keys() >= PLANNER_PAGES


@pytest.mark.parametrize("slug", sorted(PLANNER_PAGES))
def test_planner_page_has_its_sections_and_a_symbol_table_for_every_formula(slug: str) -> None:
    markdown = (LEARN_DIR / f"{slug}.md").read_text(encoding="utf-8")
    assert missing_sections(markdown, PLANNER_SECTIONS) == [], f"{slug}.md: missing or out of order"
    assert formulas_without_symbols(markdown) == [], f"{slug}.md: a formula without its symbols"
    assert SYMBOL_TABLE in markdown
    # A bar inside math in a table row ends the cell: the row would lose its columns.
    for line in markdown.splitlines():
        if line.startswith("|"):
            assert not any("|" in math for math in _MATH.findall(line)), f"{slug}.md: {line[:60]}"
    # An unescaped % starts a TeX comment: the rest of the formula would vanish without an error.
    for math in _MATH.findall(markdown):
        assert not re.search(r"(?<!\\)%", math), f"{slug}.md: write \\% inside math: {math[:60]}"
