"""Surface area / volume calculations for CBSE Class 9-10 mensuration:
cone, sphere, cylinder, cuboid.

Mirrors solving.py's "never let the LLM compute the answer" stance, but for
a different reason: there's no solving *strategy* to narrate here (unlike
an equation, a mensuration problem is a fixed formula plus substitution),
so the step-by-step breakdown is generated directly here — no LLM call
involved at all, unlike build_solve_prompt()'s approach.

Every quantity (surface area, volume) is computed the same four-step way:
state the formula, substitute the given values, simplify to an exact form,
then a final answer with both the exact form and a decimal approximation.
SymPy keeps the exact form (e.g. `15*pi` rather than `47.12...`) all the way
through, matching how a CBSE/ICSE textbook presents these answers.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import sympy

REQUIRED_DIMENSIONS: dict[str, tuple[str, ...]] = {
    "cone": ("radius", "height"),
    "sphere": ("radius",),
    "cylinder": ("radius", "height"),
    "cuboid": ("length", "width", "height"),
}


class MensurationError(Exception):
    """Raised for missing/invalid dimensions or an unsupported shape —
    meant to be shown directly to the teacher."""


@dataclass
class QuantityResult:
    steps: list[str]
    final_answer: str
    formula_used: str


@dataclass
class MensurationResult:
    shape: str
    dimensions: dict[str, float]
    unit: Optional[str]
    surface_area: QuantityResult
    volume: QuantityResult
    formulas_used: list[str]


def missing_dimensions(shape: str, dimensions: dict) -> list[str]:
    required = REQUIRED_DIMENSIONS.get(shape, ())
    return [name for name in required if dimensions.get(name) is None]


def _nice(value: float) -> sympy.Expr:
    """Turns a plain decimal dimension into an exact SymPy value where
    possible (e.g. 3.5 -> 7/2), so downstream simplification produces clean
    fractions/pi-multiples instead of dragging a float through every step."""
    return sympy.nsimplify(value, rational=True)


def _unit_suffix(unit: Optional[str], power: int) -> str:
    if not unit:
        return ""
    exponent = f"^{power}" if power != 1 else ""
    return f"\\ \\text{{{unit}}}{exponent}"


def _quantity_result(
    label: str,
    symbol_latex: str,
    formula_expr: sympy.Expr,
    substitutions: dict[sympy.Symbol, sympy.Expr],
    unit: Optional[str],
    unit_power: int,
) -> QuantityResult:
    """Builds the standard 4-step breakdown for one quantity (e.g. "volume"
    of a cone): state the formula, substitute, simplify, final answer."""
    formula_latex = sympy.latex(formula_expr)
    # UnevaluatedExpr keeps the substitution step showing e.g. "3^2 * 5"
    # rather than SymPy eagerly collapsing it straight to "15" — without
    # this, "substitute" and "simplify" would show the same expression for
    # any purely-numeric formula.
    unevaluated_substitutions = {sym: sympy.UnevaluatedExpr(val) for sym, val in substitutions.items()}
    substituted_latex = sympy.latex(formula_expr.subs(unevaluated_substitutions))
    simplified = sympy.simplify(formula_expr.subs(substitutions))
    exact_latex = sympy.latex(simplified)
    approx = float(simplified.evalf())
    suffix = _unit_suffix(unit, unit_power)

    steps = [
        f"The formula for the {label} is ${symbol_latex} = {formula_latex}$.",
        f"Substitute the given values: ${symbol_latex} = {substituted_latex}$.",
        f"Simplify: ${symbol_latex} = {exact_latex}$.",
        f"Final answer: ${symbol_latex} = {exact_latex} \\approx {approx:.2f}{suffix}$.",
    ]
    final_answer = f"{exact_latex} \\approx {approx:.2f}{suffix}"
    return QuantityResult(steps=steps, final_answer=final_answer, formula_used=f"{symbol_latex} = {formula_latex}")


def _require_positive(dimensions: dict, *names: str) -> None:
    for name in names:
        value = dimensions.get(name)
        if value is not None and value <= 0:
            raise MensurationError(f"{name} must be a positive number (got {value}).")


def calculate_cone(radius: float, height: float, unit: Optional[str] = None) -> MensurationResult:
    _require_positive({"radius": radius, "height": height}, "radius", "height")
    r, h = sympy.symbols("r h", positive=True)
    rv, hv = _nice(radius), _nice(height)
    subs = {r: rv, h: hv}

    slant = sympy.sqrt(r**2 + h**2)
    volume_formula = sympy.Rational(1, 3) * sympy.pi * r**2 * h
    tsa_formula = sympy.pi * r * (r + slant)

    volume = _quantity_result("volume of a cone", "V", volume_formula, subs, unit, 3)
    surface_area = _quantity_result(
        "total surface area of a cone (base + curved surface, using slant height "
        f"$l = \\sqrt{{r^2 + h^2}}$)",
        "S",
        tsa_formula,
        subs,
        unit,
        2,
    )
    return MensurationResult(
        shape="cone",
        dimensions={"radius": radius, "height": height},
        unit=unit,
        surface_area=surface_area,
        volume=volume,
        formulas_used=[volume.formula_used, "l = \\sqrt{r^2 + h^2}", surface_area.formula_used],
    )


def calculate_sphere(radius: float, unit: Optional[str] = None) -> MensurationResult:
    _require_positive({"radius": radius}, "radius")
    r = sympy.symbols("r", positive=True)
    subs = {r: _nice(radius)}

    volume_formula = sympy.Rational(4, 3) * sympy.pi * r**3
    surface_formula = 4 * sympy.pi * r**2

    volume = _quantity_result("volume of a sphere", "V", volume_formula, subs, unit, 3)
    surface_area = _quantity_result("surface area of a sphere", "S", surface_formula, subs, unit, 2)
    return MensurationResult(
        shape="sphere",
        dimensions={"radius": radius},
        unit=unit,
        surface_area=surface_area,
        volume=volume,
        formulas_used=[volume.formula_used, surface_area.formula_used],
    )


def calculate_cylinder(radius: float, height: float, unit: Optional[str] = None) -> MensurationResult:
    _require_positive({"radius": radius, "height": height}, "radius", "height")
    r, h = sympy.symbols("r h", positive=True)
    subs = {r: _nice(radius), h: _nice(height)}

    volume_formula = sympy.pi * r**2 * h
    tsa_formula = 2 * sympy.pi * r * (r + h)

    volume = _quantity_result("volume of a cylinder", "V", volume_formula, subs, unit, 3)
    surface_area = _quantity_result(
        "total surface area of a cylinder (two circular ends + curved surface)",
        "S",
        tsa_formula,
        subs,
        unit,
        2,
    )
    return MensurationResult(
        shape="cylinder",
        dimensions={"radius": radius, "height": height},
        unit=unit,
        surface_area=surface_area,
        volume=volume,
        formulas_used=[volume.formula_used, surface_area.formula_used],
    )


def calculate_cuboid(length: float, width: float, height: float, unit: Optional[str] = None) -> MensurationResult:
    _require_positive({"length": length, "width": width, "height": height}, "length", "width", "height")
    l, w, h = sympy.symbols("l w h", positive=True)
    subs = {l: _nice(length), w: _nice(width), h: _nice(height)}

    volume_formula = l * w * h
    tsa_formula = 2 * (l * w + w * h + h * l)

    volume = _quantity_result("volume of a cuboid", "V", volume_formula, subs, unit, 3)
    surface_area = _quantity_result("total surface area of a cuboid", "S", tsa_formula, subs, unit, 2)
    return MensurationResult(
        shape="cuboid",
        dimensions={"length": length, "width": width, "height": height},
        unit=unit,
        surface_area=surface_area,
        volume=volume,
        formulas_used=[volume.formula_used, surface_area.formula_used],
    )


def _expand_cube_shorthand(shape: str, dimensions: dict) -> dict:
    """A cube is a cuboid with one labeled `side` instead of separate
    length/width/height — expand it so calculate_cuboid never needs to know
    about the shorthand."""
    if shape != "cuboid" or dimensions.get("side") is None:
        return dimensions
    if dimensions.get("length") is not None or dimensions.get("width") is not None or dimensions.get("height") is not None:
        return dimensions
    side = dimensions["side"]
    return {**dimensions, "length": side, "width": side, "height": side}


def calculate(shape: str, dimensions: dict, unit: Optional[str] = None) -> MensurationResult:
    """Dispatches to the right calculate_*() for `shape`, after checking
    every dimension it needs is present — the single entry point
    mensuration_router.py calls, so callers never need their own
    shape-to-function mapping."""
    if shape not in REQUIRED_DIMENSIONS:
        raise MensurationError(f"Unsupported shape: {shape!r}.")

    dimensions = _expand_cube_shorthand(shape, dimensions)
    missing = missing_dimensions(shape, dimensions)
    if missing:
        raise MensurationError(
            f"Missing dimension(s) for a {shape}: {', '.join(missing)}. "
            f"A {shape} needs: {', '.join(REQUIRED_DIMENSIONS[shape])}."
        )

    if shape == "cone":
        return calculate_cone(dimensions["radius"], dimensions["height"], unit)
    if shape == "sphere":
        return calculate_sphere(dimensions["radius"], unit)
    if shape == "cylinder":
        return calculate_cylinder(dimensions["radius"], dimensions["height"], unit)
    return calculate_cuboid(dimensions["length"], dimensions["width"], dimensions["height"], unit)
