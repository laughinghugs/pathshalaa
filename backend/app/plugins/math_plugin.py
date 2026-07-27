from __future__ import annotations

from .base import SubjectPlugin
from .registry import register

PROMPT_TEMPLATE = (
    "This image contains a handwritten math note on a whiteboard-style canvas. "
    "If it is just an equation or expression with no instruction attached, transcribe it as "
    "clean, valid LaTeX (no surrounding $ or $$ delimiters) and return it as a single `latex` "
    "command — e.g. a bare \"x^2 - 4 = 0\" is a `latex` command, not a `solve_equation` one.\n\n"
    "If it explicitly instructs solving the equation — the word \"solve\", \"find x\", \"evaluate\", "
    "or similar, written alongside the equation — return a `solve_equation` command instead: put "
    "the equation itself (with the instruction words stripped out) in `content` as clean LaTeX. "
    "If it also restricts the solution to a range of x — phrases like \"for x in [0, 2\\pi)\", "
    "\"0 <= x < 2pi\", or a bare bracketed range such as [0, \\pi) right after the equation — put "
    "the lower and upper bounds as LaTeX expressions in `range_min`/`range_max` (e.g. \"0\", "
    "\"\\\\pi\", not a decimal approximation), and set `range_min_inclusive`/`range_max_inclusive` "
    "to true for a square bracket ([ or ]) on that side and false for a round one (( or )). Omit "
    "range_min/range_max entirely (leave them unset) if no range is written."
)

MATH_PLUGIN = SubjectPlugin(
    id="math",
    name="Math",
    # `graph` / `shape3d` / `solution_steps` remain valid AICommand types
    # this plugin (or a future one) can adopt later without any change to
    # recognize_router.py.
    command_types=["latex", "solve_equation"],
    prompt_template=PROMPT_TEMPLATE,
)

register(MATH_PLUGIN)
