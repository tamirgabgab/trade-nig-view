"""Built-in tax tables for the apartment. Defaults to start from, not tax advice.

Purchase tax (מס רכישה), 2026, from secondary sources (property and news sites, read on
2026-11-26; check the Israel Tax Authority's own table before relying on them):

* a single home: nothing up to 1,978,745; 3.5 % to 2,347,040; 5 % to 6,055,070; 8 % to
  20,183,565; 10 % above. The brackets are frozen until 2028-01-15;
* an additional home: 8 % up to 6,055,070, 10 % above (a temporary provision until 2026-12-31).

Betterment tax (מס שבח): 25 % of the real gain; a single home is exempt up to a ceiling
(5,008,000 in 2025); a home bought before 2014 pays only for the days held after 2014-01-01.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.planner.home import Betterment, Bracket

AS_OF = "2026-11-26"
SOURCE = "Secondary sources (property and news sites); check the Israel Tax Authority"


@dataclass(frozen=True, slots=True)
class PurchasePreset:
    id: str
    name: str
    note: str
    brackets: tuple[Bracket, ...]


@dataclass(frozen=True, slots=True)
class BettermentPreset:
    id: str
    name: str
    note: str
    spec: Betterment


PURCHASE = (
    PurchasePreset(
        "single_home_2026",
        "Single home (2026)",
        "Brackets frozen until 2028-01-15",
        (
            Bracket(1_978_745.0, 0.0),
            Bracket(2_347_040.0, 0.035),
            Bracket(6_055_070.0, 0.05),
            Bracket(20_183_565.0, 0.08),
            Bracket(None, 0.10),
        ),
    ),
    PurchasePreset(
        "additional_home_2026",
        "Additional home (2026)",
        "A temporary provision until 2026-12-31",
        (Bracket(6_055_070.0, 0.08), Bracket(None, 0.10)),
    ),
)

BETTERMENT = (
    BettermentPreset(
        "single_home",
        "Single home (exempt up to the ceiling)",
        "The 2025 ceiling; a home held at least 18 months",
        Betterment(single_home=True),
    ),
    BettermentPreset(
        "additional_home",
        "Additional home (25 % of the real gain)",
        "The linear rule applies to a home bought before 2014",
        Betterment(single_home=False),
    ),
)
