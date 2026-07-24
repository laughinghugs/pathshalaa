"""Turns a confirmed LaTeX equation into numeric data a frontend can plot.

Handles, in order:
  1. Explicit form: "y = f(x)" or "z = f(x, y)" (or a bare expression, which
     is treated as the explicit form with an implied "y = " / "z = ") -> 2D
     line or 3D surface, no solving needed.
  2. Implicit form: e.g. "x^2 + y^2 = 25" -> solved for one variable, which
     may yield multiple branches (e.g. the +/- of a circle/sphere).
  3. Degenerate form: solving leaves no free variable at all (e.g.
     "2x + 3 = 7" solves to x = 2) -> a horizontal/vertical reference line.

Only handles up to 2 independent variables (2D or 3D). Anything else raises
GraphError with a message meant to be shown directly to the teacher.
"""

from __future__ import annotations

import math

import numpy as np
import sympy
from sympy.parsing.latex import parse_latex

X_RANGE = (-10, 10)
POINTS_2D = 400
POINTS_3D = 60


class GraphError(Exception):
    """Raised for anything that isn't a valid, plottable (<=2D) equation."""


def build_graph(latex: str) -> dict:
    try:
        parsed = parse_latex(latex)
    except Exception as exc:  # sympy/antlr raise several different types
        raise GraphError("Could not parse this as a mathematical equation.") from exc

    dependent, candidates = _resolve(parsed)

    try:
        indep_vars = sorted(set().union(*(c.free_symbols for c in candidates)), key=str)
    except Exception as exc:
        raise GraphError("Could not graph this equation.") from exc

    try:
        if len(indep_vars) == 0:
            return _build_constant_line(dependent, candidates)
        if len(indep_vars) == 1:
            return _build_2d(dependent, indep_vars[0], candidates)
        if len(indep_vars) == 2:
            return _build_3d(dependent, indep_vars, candidates)
    except GraphError:
        raise
    except Exception as exc:
        raise GraphError("Could not graph this equation.") from exc

    raise GraphError("This equation has too many variables to graph (max 2).")


def _resolve(parsed: sympy.Basic) -> tuple[sympy.Symbol, list[sympy.Expr]]:
    """Returns (dependent_symbol, [candidate expressions for it])."""
    if isinstance(parsed, sympy.Eq):
        lhs, rhs = parsed.lhs, parsed.rhs
        if isinstance(lhs, sympy.Symbol) and lhs not in rhs.free_symbols:
            return lhs, [rhs]
        if isinstance(rhs, sympy.Symbol) and rhs not in lhs.free_symbols:
            return rhs, [lhs]

        all_vars = sorted(lhs.free_symbols | rhs.free_symbols, key=str)
        if not all_vars:
            raise GraphError("This equation has no variables to graph.")
        target = _pick_solve_target(all_vars)
        try:
            candidates = sympy.solve(sympy.Eq(lhs, rhs), target)
        except NotImplementedError as exc:
            raise GraphError(f"Could not rearrange this equation to solve for {target}.") from exc
        if not candidates:
            raise GraphError(f"Could not rearrange this equation to solve for {target}.")
        return target, list(candidates)

    all_vars = sorted(parsed.free_symbols, key=str)
    if len(all_vars) > 2:
        raise GraphError("This equation has too many variables to graph (max 2).")
    dependent = sympy.Symbol("z" if len(all_vars) == 2 else "y")
    return dependent, [parsed]


def _pick_solve_target(vars_: list[sympy.Symbol]) -> sympy.Symbol:
    for name in ("z", "y"):
        for v in vars_:
            if str(v) == name:
                return v
    non_x = [v for v in vars_ if str(v) != "x"]
    return non_x[-1] if non_x else vars_[-1]


def _sanitize_scalar(value) -> float | None:
    try:
        cval = complex(value)
    except (TypeError, ValueError):
        return None
    if abs(cval.imag) > 1e-9:
        return None
    fval = cval.real
    return fval if math.isfinite(fval) else None


def _sanitize_array(arr: np.ndarray) -> list:
    arr = np.asarray(arr)
    if np.iscomplexobj(arr):
        invalid = np.abs(arr.imag) > 1e-9
        arr = np.where(invalid, np.nan, arr.real)
    arr = arr.astype(float)
    return [None if not math.isfinite(v) else float(v) for v in arr]


def _evaluate_1d(expr: sympy.Expr, var: sympy.Symbol, xs: np.ndarray) -> list:
    f = sympy.lambdify((var,), expr, modules=["numpy"])
    with np.errstate(all="ignore"):
        raw = f(xs)
    raw = np.broadcast_to(np.asarray(raw), xs.shape)
    return _sanitize_array(raw)


def _evaluate_2d(expr: sympy.Expr, vars_: list[sympy.Symbol], xg: np.ndarray, yg: np.ndarray) -> list:
    f = sympy.lambdify(tuple(vars_), expr, modules=["numpy"])
    with np.errstate(all="ignore"):
        raw = f(xg, yg)
    raw = np.broadcast_to(np.asarray(raw), xg.shape)
    return [_sanitize_array(row) for row in raw]


def _build_2d(dependent: sympy.Symbol, var: sympy.Symbol, candidates: list[sympy.Expr]) -> dict:
    xs = np.linspace(*X_RANGE, POINTS_2D)
    multi = len(candidates) > 1
    traces = []
    for i, expr in enumerate(candidates, start=1):
        traces.append(
            {
                "label": f"Branch {i}" if multi else str(dependent),
                "x": [float(v) for v in xs],
                "y": _evaluate_1d(expr, var, xs),
            }
        )
    return {"type": "2d", "x_label": str(var), "y_label": str(dependent), "traces": traces}


def _build_3d(dependent: sympy.Symbol, vars_: list[sympy.Symbol], candidates: list[sympy.Expr]) -> dict:
    xs = np.linspace(*X_RANGE, POINTS_3D)
    ys = np.linspace(*X_RANGE, POINTS_3D)
    xg, yg = np.meshgrid(xs, ys)
    multi = len(candidates) > 1
    surfaces = []
    for i, expr in enumerate(candidates, start=1):
        surfaces.append(
            {
                "label": f"Branch {i}" if multi else str(dependent),
                "z": _evaluate_2d(expr, vars_, xg, yg),
            }
        )
    return {
        "type": "3d",
        "x_label": str(vars_[0]),
        "y_label": str(vars_[1]),
        "z_label": str(dependent),
        "x": [float(v) for v in xs],
        "y": [float(v) for v in ys],
        "surfaces": surfaces,
    }


def _build_constant_line(dependent: sympy.Symbol, candidates: list[sympy.Expr]) -> dict:
    values = [v for v in (_sanitize_scalar(c) for c in candidates) if v is not None]
    if not values:
        raise GraphError("Could not compute a real value to graph for this equation.")

    if str(dependent) == "y":
        traces = [{"label": f"y = {v:g}", "x": list(X_RANGE), "y": [v, v]} for v in values]
        return {"type": "2d", "x_label": "x", "y_label": "y", "traces": traces}

    traces = [{"label": f"{dependent} = {v:g}", "x": [v, v], "y": list(X_RANGE)} for v in values]
    return {"type": "2d", "x_label": str(dependent), "y_label": "y", "traces": traces}
