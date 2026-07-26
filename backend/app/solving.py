"""Computes a verified ground-truth answer for a confirmed LaTeX equation,
then asks the LLM to narrate a pedagogical step-by-step path to that exact
answer.

Mirrors graphing.py's shape: SymPy does the actual math (so the final
answer is never a model hallucination), the LLM only writes the human-
readable explanation, told the correct destination up front. Handles two
cases:
  1. Algebraic equations in a single unknown, e.g. "x^2 + 3x - 4 = 0" or a
     bare expression (treated as "expression = 0").
  2. First-order ordinary differential equations written with Leibniz
     notation, e.g. "\\frac{dy}{dx} = y" or "\\frac{dy}{dx} + 2y = x" — the
     only ODE form SymPy's LaTeX parser reliably recognizes (it doesn't
     parse prime notation like y' or second-derivative fractions).

Anything else (multiple unknowns, higher-order/prime-notation ODEs, systems)
raises SolveError with a message meant to be shown directly to the teacher.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import sympy
from sympy.parsing.latex import parse_latex

STEP_DELIMITER = "@@@"
_CODE_FENCE_RE = re.compile(r"^```[^\n]*\n?|\n?```$", re.MULTILINE)
_STEP_LABEL_RE = re.compile(r"^(?:step\s*\d+\s*[:.)-]?|\d+\s*[.)-])\s*", re.IGNORECASE)


class SolveError(Exception):
    """Raised for anything that isn't a single-unknown algebraic equation or
    a first-order Leibniz-notation differential equation."""


@dataclass
class SolveResult:
    is_differential: bool
    variable: str
    classification: str
    answer_latex: str


def compute_ground_truth(latex: str) -> SolveResult:
    try:
        parsed = parse_latex(latex)
    except Exception as exc:  # sympy/antlr raise several different types
        raise SolveError("Could not parse this as a mathematical equation.") from exc

    eq = parsed if isinstance(parsed, sympy.Eq) else sympy.Eq(parsed, 0)

    if eq.atoms(sympy.Derivative):
        return _solve_differential(eq)
    return _solve_algebraic(eq)


def _solve_algebraic(eq: sympy.Eq) -> SolveResult:
    free_vars = sorted(eq.free_symbols, key=str)
    if not free_vars:
        raise SolveError("This equation has no unknown to solve for.")
    if len(free_vars) > 1:
        names = ", ".join(str(v) for v in free_vars)
        raise SolveError(
            f"This equation has more than one unknown ({names}). "
            "Solve requires a single-variable equation."
        )

    var = free_vars[0]
    try:
        solutions = sympy.solve(eq, var)
    except NotImplementedError as exc:
        raise SolveError("Could not solve this equation.") from exc
    if not solutions:
        raise SolveError("Could not find a solution for this equation.")

    classification = _classify_algebraic(eq, var)
    answer_latex = r" \quad \text{or} \quad ".join(
        f"{sympy.latex(var)} = {sympy.latex(sol)}" for sol in solutions
    )
    return SolveResult(
        is_differential=False,
        variable=str(var),
        classification=classification,
        answer_latex=answer_latex,
    )


def _classify_algebraic(eq: sympy.Eq, var: sympy.Symbol) -> str:
    try:
        # parse_latex can return Add/Mul trees that aren't fully auto-flattened
        # (e.g. "(x**2 + 3*x) - 4" as nested Adds), which trips up Poly's
        # generator detection even though the expression is a plain
        # polynomial. Round-tripping through str() forces a canonical form.
        difference = sympy.sympify(str(eq.lhs - eq.rhs))
        poly = sympy.Poly(difference, var)
    except sympy.PolynomialError:
        return "non-polynomial equation"
    degree = poly.degree()
    return {1: "linear equation", 2: "quadratic equation", 3: "cubic equation"}.get(
        degree, f"polynomial equation of degree {degree}"
    )


def _solve_differential(eq: sympy.Eq) -> SolveResult:
    derivs = eq.atoms(sympy.Derivative)
    if len(derivs) > 1 or any(d.derivative_count > 1 for d in derivs):
        raise SolveError(
            "Only first-order differential equations (written as dy/dx) are supported."
        )

    deriv = next(iter(derivs))
    dep_symbol = deriv.expr
    if not isinstance(dep_symbol, sympy.Symbol) or len(deriv.variables) != 1:
        raise SolveError("Could not identify the dependent and independent variables.")
    indep_symbol = deriv.variables[0]

    func = sympy.Function(str(dep_symbol))(indep_symbol)
    ode = eq.subs(deriv, sympy.Derivative(func, indep_symbol)).subs(dep_symbol, func)

    try:
        hints = sympy.classify_ode(ode, func)
    except (NotImplementedError, ValueError) as exc:
        raise SolveError("Could not classify this differential equation.") from exc
    if not hints:
        raise SolveError("This differential equation doesn't match any known solving method.")

    try:
        solution = sympy.dsolve(ode, func)
    except NotImplementedError as exc:
        raise SolveError("Could not solve this differential equation.") from exc

    solutions = solution if isinstance(solution, list) else [solution]
    answer_latex = r" \quad \text{or} \quad ".join(sympy.latex(sol) for sol in solutions)

    return SolveResult(
        is_differential=True,
        variable=str(dep_symbol),
        classification=hints[0].replace("_", " "),
        answer_latex=answer_latex,
    )


def build_solve_prompt(latex: str, result: SolveResult) -> str:
    kind = "first-order ordinary differential equation" if result.is_differential else "equation"
    return (
        f"You are a math teacher writing a step-by-step solution for a student. "
        f"The {kind} is: {latex}\n"
        f"It is a {result.classification}. "
        f"The verified correct final answer is: {result.answer_latex}\n\n"
        "Write the solution as a sequence of short, clear steps that a student can follow "
        "from the original equation to that exact final answer — do not deviate from it, "
        "and do not introduce a different final answer. "
        "Each step should be one short sentence or line of algebra. Wrap any math notation "
        "in a step in single dollar signs, e.g. \"Subtract $3$ from both sides to get $2x = 4$.\" "
        "The last step must state the final answer. Produce between 3 and 8 steps.\n\n"
        f"Respond with ONLY the steps as plain text, one step per line, with each step "
        f"separated by a line containing exactly {STEP_DELIMITER} and nothing else. "
        "Do not number the steps, do not use bullet points, do not use JSON, and do not "
        "wrap the response in markdown code fences — just the step text and the delimiter "
        f"lines between them. Example shape (with {{n}} step count varying):\n"
        f"first step text\n{STEP_DELIMITER}\nsecond step text\n{STEP_DELIMITER}\nlast step text"
    )


def parse_solution_steps(raw_text: str) -> list[str]:
    """Turns the model's plain-text, delimiter-separated response into a
    list of step strings.

    Deliberately not JSON: asking a model to hand-produce valid JSON whose
    string values are themselves full of LaTeX backslashes (\\frac, \\left,
    ...) turned out to be unreliable — reasoning models would intermittently
    emit an unbalanced bracket or an unescaped backslash and break json.loads.
    Splitting on a plain-text delimiter has nothing to escape, so there's
    nothing for the model to get wrong.
    """
    cleaned = _CODE_FENCE_RE.sub("", raw_text).strip()
    steps = []
    for chunk in cleaned.split(STEP_DELIMITER):
        step = _STEP_LABEL_RE.sub("", chunk.strip()).strip()
        if step:
            steps.append(step)
    return steps
