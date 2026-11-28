r"""A strategy: rules (or a Python file) that say when to enter and leave, long and short.

Two kinds share one document (stored in ``DocumentStore("strategies")``):

* ``rules``: indicators plus condition groups. A side's entry fires at bar :math:`t` when **any**
  of its groups holds, and a group holds when **all** of its conditions hold
  (``app.analysis.conditions``):

  .. math:: \text{entry}_t = \bigvee_g \bigwedge_{c \in g} c_t

  Filters (the same shape) gate the entries of both sides; exits are not filtered.
* ``python``: a file in ``strategies/`` (``app.backtest.python_loader``) with its parameters.

Both sides always exist (the user, 2026-11-28); either may be left without entries. The exits
(stop, target, trailing stop, time stop, the opposite signal) and the trade cap are stored and
validated here and executed by the engine (B1).
"""

from __future__ import annotations

from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.analysis.conditions import Condition, Operand
from app.errors import ChartLabError
from app.indicators.catalog import get_spec
from app.indicators.registry import ParamValue, resolve_params
from app.models.bars import Interval

from .profiles import PROFILES, ProfileId

ConditionGroup = Annotated[list[Condition], Field(min_length=1, max_length=8)]
Groups = Annotated[list[ConditionGroup], Field(max_length=8)]


class StrategyIndicator(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Annotated[str, Field(min_length=1, max_length=40, description="Indicator id")]
    params: dict[str, ParamValue] = Field(
        default_factory=dict[str, ParamValue], description="Missing parameters use defaults"
    )
    interval: Interval | None = Field(
        default=None,
        description="Null: the decision interval; else one of the profile's context intervals "
        "(its value reaches a decision bar once that context bar has closed)",
    )


class SideRules(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entry: Groups = Field(default_factory=list[list[Condition]], description="OR of AND-groups")
    exit: Groups = Field(default_factory=list[list[Condition]], description="OR of AND-groups")


class Level(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["percent", "atr"]
    value: float = Field(gt=0, le=1000, description="Percent of the entry price, or ATR multiples")


class Exits(BaseModel):
    model_config = ConfigDict(extra="forbid")

    on_opposite: bool = Field(default=True, description="Leave when the other side's entry fires")
    stop: Level | None = None
    target: Level | None = None
    trailing: Level | None = None
    time_stop_bars: int | None = Field(default=None, ge=1, le=10_000)
    atr_length: int = Field(default=14, ge=1, le=500, description="ATR of the ATR levels")


class _Common(BaseModel):
    model_config = ConfigDict(extra="forbid")

    description: str = Field(default="", max_length=500)
    profile: ProfileId
    exits: Exits = Field(default_factory=Exits)
    max_trades: int | None = Field(
        default=None,
        ge=1,
        le=10_000,
        description="Trade cap per the profile's period; null = the profile's default",
    )


class RulesStrategy(_Common):
    kind: Literal["rules"] = "rules"
    indicators: list[StrategyIndicator] = Field(
        default_factory=list[StrategyIndicator], max_length=12
    )
    long: SideRules = Field(default_factory=SideRules)
    short: SideRules = Field(default_factory=SideRules)
    filters: Groups = Field(
        default_factory=list[list[Condition]], description="Gate both sides' entries"
    )

    @model_validator(mode="after")
    def _consistent(self) -> Self:
        if not self.long.entry and not self.short.entry:
            raise ValueError("give at least one entry group (long or short)")
        context = PROFILES[self.profile].context_intervals
        outputs: list[list[str]] = []
        for i, ind in enumerate(self.indicators):
            if ind.interval is not None and ind.interval not in context:
                allowed = ", ".join(context) or "none"
                raise ValueError(
                    f"indicators[{i}]: {ind.interval} is not a context interval of the "
                    f"{self.profile} profile ({allowed})"
                )
            try:
                spec = get_spec(ind.id)
                resolve_params(spec, ind.params)
            except ChartLabError as e:
                raise ValueError(f"indicators[{i}]: {e.detail}") from None
            outputs.append([o.name for o in spec.outputs])
        for where, groups in (
            ("long.entry", self.long.entry),
            ("long.exit", self.long.exit),
            ("short.entry", self.short.entry),
            ("short.exit", self.short.exit),
            ("filters", self.filters),
        ):
            for g, group in enumerate(groups):
                for c, cond in enumerate(group):
                    for side, op in (("left", cond.left), ("right", cond.right)):
                        _check_operand(op, outputs, f"{where}[{g}][{c}].{side}")
        return self


def _check_operand(op: Operand, outputs: list[list[str]], where: str) -> None:
    if op.indicator is None:
        return
    if op.indicator >= len(outputs):
        raise ValueError(f"{where}: indicator {op.indicator} is out of range")
    if op.output not in outputs[op.indicator]:
        names = ", ".join(outputs[op.indicator])
        raise ValueError(f"{where}: no output '{op.output}' (outputs: {names})")


class PythonStrategy(_Common):
    kind: Literal["python"] = "python"
    module: str = Field(
        pattern=r"^[A-Za-z_][A-Za-z0-9_]{0,63}$", description="File stem in strategies/"
    )
    params: dict[str, ParamValue] = Field(
        default_factory=dict[str, ParamValue], description="Missing parameters use defaults"
    )


Strategy = Annotated[RulesStrategy | PythonStrategy, Field(discriminator="kind")]
