"""Built-in tax tables for the apartment. Defaults to start from, not tax advice.

The amounts are those of the Israel Tax Authority's real-estate taxation directive 1/2026
(הוראת ביצוע מיסוי מקרקעין 1/2026, 2026-01-18), read on 2026-11-26.

Purchase tax (מס רכישה):

* a single home, 2025-01-16 to 2028-01-15 (frozen): nothing up to 1,978,745; 3.5 % to
  2,347,040; 5 % to 6,055,070; 8 % to 20,183,565; 10 % above;
* an additional home, a temporary provision until 2026-12-31: 8 % up to 6,055,070, 10 % above.

Betterment tax (מס שבח): the single-home exemption ceiling is 5,008,000 from 2025-01-01 to
2027-12-31 (the directive). The rate (25 % of the real gain) and the linear rule (a home bought
before 2014 pays only for the days held after 2014-01-01) are the law's general rules, modelled
without its conditions (the holding period, who may use the linear rule).
"""

from __future__ import annotations

from dataclasses import dataclass

from app.planner.home import Betterment, Bracket

AS_OF = "2026-01-18"
SOURCE = "Israel Tax Authority, real-estate taxation directive 1/2026"


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
        "From 2025-01-16, frozen until 2028-01-15",
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
        "The ceiling of 2025 to 2027; the law also asks for 18 months of holding",
        Betterment(single_home=True),
    ),
    BettermentPreset(
        "additional_home",
        "Additional home (25 % of the real gain)",
        "The linear rule applies to a home bought before 2014",
        Betterment(single_home=False),
    ),
)
